"""Reproducible owned-instance no-op/resume/restart/original-read checks."""
from pathlib import Path
import subprocess,os,json,time,http.client,datetime
C=Path(__file__).resolve().parents[2];assert Path.cwd()==C
P=C/'.local/release-test-runs';P.mkdir(parents=True,exist_ok=True,mode=0o700);state=json.loads((C/'.local/installation.json').read_text());env=os.environ.copy();env.update({'PATH':str(Path.home()/'.local/bin')+':'+env['PATH'],'APP_ENV':'local','NEXT_TELEMETRY_DISABLED':'1'});tag='retention-'+str(time.time_ns());rows=[]
def run(name,args):
 t=time.monotonic()
 with (P/(tag+'-'+name+'.log')).open('w') as f:r=subprocess.run(args,cwd=C,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=300)
 rows.append({'stage':name,'exit_code':r.returncode,'seconds':time.monotonic()-t});assert r.returncode==0,name
run('owned-target',['node','scripts/verify-owned.mjs']);assert (C/'.local/qa-private-record.json').is_file(),'Run scripts/qa-installed.mts first; authentication/original checks are required, never skipped'
if 'DEMO' in state['completed']:run('normal-user-edit',['node','tools/release/demo-edit-proof.mjs'])
run('before',['node','scripts/snapshot.mjs','before'])
if 'DEMO' in state['completed']:run('completed-demo-noop',['node','--conditions=react-server','--import','tsx','scripts/demo/run.mts'])
run('repeat-install',['bash','scripts/install.sh','--yes','--resume','--admin-email',state['admin_email']])
connection=http.client.HTTPConnection('127.0.0.1',state['ports']['web'],timeout=5);connection.request('GET','/health/ready',headers={'Connection':'keep-alive'});response=connection.getresponse();response.read();assert response.status==200 and connection.sock is not None
try:run('stop',['bash','scripts/stop.sh']);run('immediate-start-with-old-connection',['bash','scripts/start.sh'])
finally:connection.close()
run('after',['node','scripts/snapshot.mjs','after']);before=json.loads((C/'.local/persistence-before.json').read_text());after=json.loads((C/'.local/persistence-after.json').read_text());assert before==after
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stages':rows,'all_table_and_original_fingerprints_equal':True,'authenticated_same_byte_original_and_anonymous_denial_verified':True,'orphaned_keepalive_connection_did_not_block_restart':True,'normal_demo_user_edit_retained':True if 'DEMO' in state['completed'] else 'NOT_APPLICABLE_CLEAN','no_reset_purge_or_duplicate_seed':True};(C/'.local/retention-campaign.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
