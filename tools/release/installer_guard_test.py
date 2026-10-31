from pathlib import Path
import importlib.util,unittest,tempfile,socket,json,time
from unittest.mock import patch
O=Path(__file__).resolve().parents[2];(O/'.local/guard-tests').mkdir(parents=True,exist_ok=True);spec=importlib.util.spec_from_file_location('kit',O/'scripts/kit.py');k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
class Guards(unittest.TestCase):
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
  original=Path.read_text
  def read(p,*a,**kw):return 'MemAvailable: 1499999 kB\n' if str(p)=='/proc/meminfo' else original(p,*a,**kw)
  with patch.object(Path,'read_text',read):self.assertRaisesRegex(RuntimeError,'LOW_MEMORY',k.check)
 def test_low_disk_guard(self):
  class Disk:free=1024
  with patch.object(k.shutil,'disk_usage',return_value=Disk()):self.assertRaisesRegex(RuntimeError,'LOW_DISK',k.check)
 def test_nonowned_runtime_database_refuses(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t,patch.object(k,'LOCAL',Path(t)):
   p=Path(t)/'runtime.json';p.write_text(json.dumps({'DATABASE_URL':'postgresql://capstone_runtime:invalid@example.invalid:16530/capstone_local'}));p.chmod(0o600)
   self.assertRaisesRegex(RuntimeError,'NON_OWNED_DATABASE',k.runtime_contract,{'ports':{'db':16530}})
 def test_runtime_file_must_be_private(self):
  with tempfile.TemporaryDirectory(dir=O/'.local/guard-tests') as t,patch.object(k,'LOCAL',Path(t)):
   p=Path(t)/'runtime.json';p.write_text('{}');p.chmod(0o644)
   self.assertRaisesRegex(RuntimeError,'PERMISSIONS',k.runtime_contract,{})
if __name__=='__main__':unittest.main()
