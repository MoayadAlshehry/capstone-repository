from pathlib import Path
import importlib.util,unittest,tempfile,socket,json
from unittest.mock import patch
O=Path(__file__).resolve().parents[2];(O/'.local/guard-tests').mkdir(parents=True,exist_ok=True);spec=importlib.util.spec_from_file_location('kit',O/'scripts/kit.py');k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
class Guards(unittest.TestCase):
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
