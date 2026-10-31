from pathlib import Path
import subprocess,os,json,time,signal,datetime
C=Path(__file__).resolve().parents[2];assert Path.cwd()==C;P=C/'.local/release-test-runs';P.mkdir(parents=True,exist_ok=True,mode=0o700);env=os.environ.copy();env.update({'PATH':str(Path.home()/'.local/bin')+':'+env['PATH'],'APP_ENV':'local','NEXT_TELEMETRY_DISABLED':'1','CAPSTONE_RELEASE_MODEL_FAILURE_TEST':'1'});runtime=json.loads((C/'.local/runtime.json').read_text());original=runtime['CAPSTONE_AI_BASE_URL'];token=runtime['CAPSTONE_AI_TOKEN_FILE'];tag=os.environ.get('PARITY_FAILURE_TAG','local-failure-'+str(time.time_ns()));rows=[]
def run(label,args,extra=None):
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
 with (P/f'{tag}-{label}.log').open('w') as f:r=subprocess.run(args,cwd=C,env={**env,**(extra or {})},stdout=f,stderr=subprocess.STDOUT,timeout=400)
 rows.append({'stage':label,'exit_code':r.returncode,'seconds':time.monotonic()-t,'start':started,'command':' '.join(args).replace(original,'PRIVATE_REAL_MODEL_ENDPOINT').replace(token,'PRIVATE_PER_INSTALL_TOKEN_FILE')});return r.returncode
log=(P/f'{tag}-harness.log').open('w');child=subprocess.Popen(['node','tools/release/model-failure-harness.mjs'],cwd=C,env=env,stdout=log,stderr=subprocess.STDOUT);h=None;restored=False
try:
 for _ in range(100):
  assert child.poll() is None,'OWNED_HARNESS_EXITED'
  p=C/'.local/model-harness.json'
  if p.exists():
   value=json.loads(p.read_text())
   if value['pid']==child.pid:h=value;break
  time.sleep(.05)
 assert h and h['root']==str(C) and h['bind']=='127.0.0.1'
 proc=Path('/proc')/str(child.pid);assert proc.joinpath('stat').read_text().split()[21]==h['start'] and os.readlink(proc/'cwd')==str(C)
 socket_rows=[l.split() for l in Path('/proc/net/tcp').read_text().splitlines()[1:]];s=next(r for r in socket_rows if r[3]=='0A' and int(r[1].split(':')[1],16)==h['port']);assert s[1].split(':')[0]=='0100007F';assert any(os.readlink(f)=='socket:['+s[9]+']' for f in (proc/'fd').iterdir())
 base='http://127.0.0.1:'+str(h['port']);assert run('configure-owned-harness',['bash','scripts/configure.sh','--yes','--ai','--ai-base-url',base,'--ai-token-file',token])==0
 assert run('bounded-failure',['node','tools/release/ai-failure-proof.mjs'])==0
 assert run('real-model-recovery',['node','tools/release/ai-feature-proof.mjs','REAL_ASSISTANT_balanced'],{'CAPSTONE_AI_PROOF_LABEL':tag+'-recovery'})==0
finally:
 if json.loads((C/'.local/runtime.json').read_text())['CAPSTONE_AI_BASE_URL']!=original:
  restored=run('restore-original-model-profile',['bash','scripts/configure.sh','--yes','--ai','--ai-base-url',original,'--ai-token-file',token])==0
 else:restored=True
 if restored and child.poll() is None:
  proc=Path('/proc')/str(child.pid);assert os.readlink(proc/'cwd')==str(C) and h and proc.joinpath('stat').read_text().split()[21]==h['start'];child.send_signal(signal.SIGTERM);child.wait(timeout=15)
 log.close();value={'stages':rows,'original_model_profile_restored':restored,'negative_requests_targeted_owned_loopback_only':True,'real_model_configuration_or_network_changes':False,'harness_stopped':child.poll() is not None};(C/'.local/ai-failure-campaign.json').write_text(json.dumps(value,indent=2));print(json.dumps(value));assert restored and child.poll() is not None
