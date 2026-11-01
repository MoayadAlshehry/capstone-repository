from pathlib import Path
import importlib.util,unittest,tempfile,socket,json,time
from unittest.mock import patch
O=Path(__file__).resolve().parents[2];(O/'.local/guard-tests').mkdir(parents=True,exist_ok=True);spec=importlib.util.spec_from_file_location('kit',O/'scripts/kit.py');k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
from contextlib import contextmanager
from types import SimpleNamespace
@contextmanager
def prerequisite_contract(memory='MemAvailable: 8000000 kB\n'):
 # Unit fixtures for prerequisite responses, not a claim about this runner's host.
 original=Path.read_text
 def read(p,*a,**kw):
  values={'/proc/sys/kernel/osrelease':'synthetic-microsoft-WSL2','/etc/os-release':'Ubuntu synthetic unit host','/proc/meminfo':memory}
  return values[str(p)] if str(p) in values else original(p,*a,**kw)
 def output(args,**kw):
  if args==['node','--version']:return 'v24.21.0\n'
  if args==['corepack','pnpm','--version']:return '11.28.3\n'
  if args[:2]==['docker','info']:return 'linux\n'
  raise AssertionError('Unexpected prerequisite subprocess')
 with patch.object(Path,'read_text',read),patch.object(k.os,'uname',return_value=SimpleNamespace(machine='x86_64')),patch.object(k.subprocess,'check_output',side_effect=output),patch.object(k.subprocess,'run',return_value=SimpleNamespace(returncode=0)):
  yield
class Guards(unittest.TestCase):
 def test_transient_windows_interop_requires_successful_second_measurement(self):
  failure=k.subprocess.CalledProcessError(1,['private-read-only-helper'])
  with patch.object(k.subprocess,'check_output',side_effect=[failure,'4000000\n']) as probe:
   self.assertEqual(k.windows_commit(),4000000);self.assertEqual(probe.call_count,2)
   self.assertTrue(all(call.kwargs['timeout']==15 for call in probe.call_args_list))
 def test_windows_probe_unavailable_never_bypasses_the_guard(self):
  failure=k.subprocess.TimeoutExpired(['private-read-only-helper'],15)
  with patch.object(k.subprocess,'check_output',side_effect=failure) as probe:
   self.assertRaisesRegex(RuntimeError,'WINDOWS_COMMIT_MEASUREMENT_UNAVAILABLE',k.windows_commit);self.assertEqual(probe.call_count,2)
 def test_successful_low_commit_is_not_retried_until_it_passes(self):
  with patch.object(k.subprocess,'check_output',return_value='899999\n') as probe:
   self.assertRaisesRegex(RuntimeError,'LOW_WINDOWS_COMMIT_BEFORE_BUILD',k.windows_commit);self.assertEqual(probe.call_count,1)

 def test_active_foreign_listener_still_refused(self):
  with socket.socket() as s:
   s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',0));s.listen();self.assertRaisesRegex(RuntimeError,'OCCUPIED_APPLICATION_PORT',k.application_port_available,s.getsockname()[1])
 def test_closed_keepalive_kernel_socket_does_not_block_restart(self):
  listener=socket.socket();client=socket.socket();accepted=None
  try:
   listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);listener.bind(('127.0.0.1',0));port=listener.getsockname()[1];listener.listen();client.connect(('127.0.0.1',port));accepted,_=listener.accept();accepted.close();accepted=None;self.assertEqual(client.recv(1),b'');listener.close()
   for attempt in range(100):
    rows=[line.split() for line in Path('/proc/net/tcp').read_text().splitlines()[1:] if int(line.split()[1].split(':')[1],16)==port]
    if rows and all(r[3] in ['05','06'] and r[9]=='0' for r in rows):break
    time.sleep(.01)
   else:self.fail('Owned kernel socket did not reach the observed orphaned closed state')
   k.application_port_available(port)
  finally:
   if accepted:accepted.close()
   listener.close();client.close()
 def test_incomplete_demo_cannot_open_application(self):
  with patch.object(k,'runtime_contract',side_effect=AssertionError('No runtime admission before Demo completion')):
   self.assertRaisesRegex(RuntimeError,'DEMO_NOT_READY',k.start,{'demo':True,'completed':[]})
 def test_occupied_loopback_port_is_skipped(self):
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1];self.assertNotEqual(k.free(port),port)
 def test_symlink_ancestor_is_rejected(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t:
   p=Path(t);(p/'real').mkdir();(p/'link').symlink_to(p/'real');self.assertRaisesRegex(RuntimeError,'SYMLINK',k.safe,p/'link'/'secret')
 def test_unknown_existing_local_is_not_adopted(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t,patch.object(k,'LOCAL',Path(t)):
   self.assertRaisesRegex(RuntimeError,'UNKNOWN_EXISTING',k.init,'new@capstone.local')
 def test_foreign_volume_label_refuses(self):
  class R:returncode=0;stdout=json.dumps([{'Labels':{},'Config':{'Labels':{}}}])
  with patch.object(k.subprocess,'run',return_value=R()):self.assertRaisesRegex(RuntimeError,'FOREIGN_DOCKER',k.ownership,{'root':str(k.ROOT),'schema':1,'project':'unknown','owner':'different'})
 def test_low_memory_guard(self):
  with prerequisite_contract(memory='MemAvailable: 1499999 kB\n'):self.assertRaisesRegex(RuntimeError,'LOW_MEMORY',k.check)
 def test_low_disk_guard(self):
  class Disk:free=1024
  with prerequisite_contract(),patch.object(k.shutil,'disk_usage',return_value=Disk()):self.assertRaisesRegex(RuntimeError,'LOW_DISK',k.check)
 def test_nonowned_runtime_database_refuses(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t,patch.object(k,'LOCAL',Path(t)):
   p=Path(t)/'runtime.json';p.write_text(json.dumps({'DATABASE_URL':'postgresql://capstone_runtime:invalid@example.invalid:16530/capstone_local'}));p.chmod(0o600)
   self.assertRaisesRegex(RuntimeError,'NON_OWNED_DATABASE',k.runtime_contract,{'ports':{'db':16530}})
 def test_runtime_file_must_be_private(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t,patch.object(k,'LOCAL',Path(t)):
   p=Path(t)/'runtime.json';p.write_text('{}');p.chmod(0o644)
   self.assertRaisesRegex(RuntimeError,'PERMISSIONS',k.runtime_contract,{})
if __name__=='__main__':unittest.main()
