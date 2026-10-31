"""Bounded settings regressions; all HTTP belongs to this test process."""
from pathlib import Path
import sys,unittest,tempfile,json,threading,contextlib,io,types
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'));import settings
class Server(BaseHTTPRequestHandler):
 dimension=1024;zero=False;generation=True;native=True
 def log_message(self,*a):pass
 def do_GET(self):self.send({'data':[{'id':settings.GENERATION},{'id':settings.EMBEDDING}]})
 def do_POST(self):
  self.rfile.read(int(self.headers['Content-Length']))
  if self.path=='/v1/embeddings':return self.send({'data':[{'index':0,'embedding':[0.0 if self.zero else 1.0]*self.dimension}]})
  if self.path=='/v1/chat/completions':return self.send({'choices':[{'message':{'content':'{"status":"ready"}' if self.generation else '{}'}}]})
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  events=[{'type':'message.delta','content':'READY'}] if self.native else []
  events.append({'type':'chat.end','stats':{'input_tokens':1,'total_output_tokens':1}})
  for event in events:self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
 def send(self,data):
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(data).encode())
@contextlib.contextmanager
def model_server(**overrides):
 handler=type('OwnedSyntheticModel',(Server,),overrides);server=ThreadingHTTPServer(('127.0.0.1',0),handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:yield 'http://127.0.0.1:'+str(server.server_port)
 finally:server.shutdown();server.server_close();thread.join()
class Settings(unittest.TestCase):
 def test_rejects_public_model_endpoint_before_request(self):
  for s in ['https://127.0.0.1:1234','http://8.8.8.8:1234','http://user:password@127.0.0.1:1234','http://127.0.0.1:1234/v1','http://127.0.0.1:1234/?key=value']:
   with self.subTest(endpoint=s):self.assertRaisesRegex(RuntimeError,'AI_ENDPOINT',settings.endpoint,s)
 def test_local_and_current_private_ipv4_contract(self):
  for value in ['http://127.0.0.1:1234','http://10.1.2.3:1234','http://192.168.1.2:1234','http://172.16.1.2:1234']:self.assertEqual(settings.endpoint(value),value)
 def test_preflight_executes_both_generation_apis_and_vectors(self):
  with model_server() as base:
   r=settings.model_probe(base,'synthetic-test-token');self.assertTrue(r['actual_structured_generation']);self.assertTrue(r['actual_native_stream_generation']);self.assertEqual(r['vector_dimensions'],1024)
 def test_bad_dimension_refused(self):
  with model_server(dimension=512) as base:self.assertRaisesRegex(RuntimeError,'1024',settings.model_probe,base,'synthetic-test-token')
 def test_zero_vector_refused(self):
  with model_server(zero=True) as base:self.assertRaisesRegex(RuntimeError,'NONZERO',settings.model_probe,base,'synthetic-test-token')
 def test_malformed_generation_refused(self):
  with model_server(generation=False) as base:self.assertRaisesRegex(RuntimeError,'STRUCTURED',settings.model_probe,base,'synthetic-test-token')
 def test_native_completion_requires_actual_message(self):
  with model_server(native=False) as base:self.assertRaisesRegex(RuntimeError,'DID_NOT_COMPLETE',settings.model_probe,base,'synthetic-test-token')
 def test_token_input_permission_and_symlink(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'token';p.write_text('synthetic-private-token');p.chmod(0o644);self.assertRaisesRegex(RuntimeError,'0600',settings.token_from,p);p.chmod(0o600);self.assertEqual(settings.token_from(p),'synthetic-private-token');link=Path(t)/'link';link.symlink_to(p);self.assertRaisesRegex(RuntimeError,'SYMLINK',settings.token_from,link)
 def test_windows_utf8_bom_token_file(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'token';p.write_text('synthetic-test-token\n',encoding='utf-8-sig');p.chmod(0o600);self.assertEqual(settings.token_from(p),'synthetic-test-token')
 def test_default_never_silently_disables_unavailable_ai(self):
  with tempfile.TemporaryDirectory() as t,patch.object(settings,'model_probe',side_effect=RuntimeError('OFFLINE')),contextlib.redirect_stdout(io.StringIO()):
   self.assertRaisesRegex(RuntimeError,'AI_PREFLIGHT_BLOCKED',settings.configure,Path(t),Path(t),{},types.SimpleNamespace(ai=None),False)
 def test_explicit_off_is_labelled_partial_and_private(self):
  with tempfile.TemporaryDirectory() as t,contextlib.redirect_stdout(io.StringIO()) as log:
   r=settings.configure(Path(t),Path(t),{},types.SimpleNamespace(ai=False),False);self.assertFalse(r['ai']['enabled']);self.assertIn('partial-feature',log.getvalue());self.assertEqual((Path(t)/'ai-token').stat().st_mode&0o777,0o600)
 def test_interactive_explicit_disable(self):
  with tempfile.TemporaryDirectory() as t,patch.object(settings,'model_probe',side_effect=RuntimeError('OFFLINE')),patch('builtins.input',return_value='d'),contextlib.redirect_stdout(io.StringIO()):
   r=settings.configure(Path(t),Path(t),{},types.SimpleNamespace(ai=None),True);self.assertFalse(r['ai']['enabled'])
 def test_mail_only_approved_contract(self):
  valid={'mode':'zoho','region':'US','endpoint':settings.LEGACY_US,'agent_key':'synthetic-key-for-test-only-000000','from_address':'test@example.invalid','app_origin':'https://app.example.invalid'}
  self.assertEqual(settings.parse_mail(valid)['mode'],'zoho')
  for change in [{'endpoint':'https://example.invalid/send'},{'app_origin':'http://127.0.0.1:3760'},{'from_address':'test@capstone.local'},{'region':'EU'}]:self.assertRaises(RuntimeError,settings.parse_mail,{**valid,**change})
  self.assertEqual(settings.parse_mail({'mode':'capture'}),{'mode':'capture'})
if __name__=='__main__':unittest.main()
