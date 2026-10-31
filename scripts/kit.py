#!/usr/bin/env python3
"""Owned-instance self-hosted installation and lifecycle controller. No production or arbitrary database target options."""
from pathlib import Path
import argparse,subprocess,os,json,secrets,socket,hashlib,time,signal,sys,shutil,fcntl
from urllib.parse import urlparse
sys.path.insert(0,str(Path(__file__).resolve().parent))
import settings
ROOT=Path(__file__).resolve().parent.parent;LOCAL=ROOT/'.local';STATE=LOCAL/'installation.json'
os.umask(0o077)
def fail(code):raise RuntimeError(code)
def safe(path):
 for p in [path,*path.parents]:
  if p.is_symlink():fail('SYMLINK_PATH_REFUSED')
def save(p,x):safe(p);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(x,indent=2));tmp.chmod(0o600);tmp.replace(p)
def read(p):safe(p);return json.loads(p.read_text())
def dependency_environment():
 pin=read(ROOT/'third_party/binary-fingerprints.json');env=os.environ.copy()
 env.pop('FFMPEG_BIN',None)
 env['FFMPEG_BINARY_RELEASE']=pin['package_binary_release_tag']
 env['FFMPEG_BINARIES_URL']='https://github.com/eugeneware/ffmpeg-static/releases/download'
 return env
def run(args,tag,env=None):
 log=LOCAL/'installer-logs'/f'{tag}.log';log.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 with log.open('a') as f:
  if tag=='demo-install':
   out('Loading the existing synthetic Demo through real workflows; authentication rate limits may add short pauses.')
   r=subprocess.Popen(args,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);reviews=0
   for line in r.stdout:
    f.write(line);f.flush()
    if line.startswith(('DEMO_STAGE_COMPLETED | ','DEMO_PROJECT_COMPLETED | ','DEMO_READY | ','DEMO_ALREADY_INSTALLED | ')):out(line.strip())
    elif line.startswith('{'):
     try:
      event=json.loads(line)
      if event.get('stage')=='respecting-auth-rate-limit':out('Waiting for the unchanged authentication rate limit; installation remains resumable.')
      if event.get('stage')=='external-completed':
       reviews+=1
       if reviews%10==0:out('Completed synthetic independent review forms: '+str(reviews))
     except ValueError:pass
   code=r.wait()
  else:code=subprocess.run(args,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
 if code:fail(f'{tag.upper()}_FAILED_CHECK_PRIVATE_LOG')
def release_version():
 value=read(ROOT/'RELEASE.json').get('version')
 if not isinstance(value,str) or not __import__('re').fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?',value):fail('INVALID_RELEASE_IDENTITY')
 return value
def out(s):print(s,flush=True)
def free(start):
 for port in range(start,start+100):
  with socket.socket() as s:
   try:s.bind(('127.0.0.1',port));return port
   except OSError:pass
 fail('NO_FREE_LOOPBACK_PORT')
def application_port_available(port):
 with socket.socket() as s:
  try:s.bind(('127.0.0.1',port));return
  except OSError:pass
 # An exited HTTP server can leave only orphaned FIN_WAIT2/TIME_WAIT sockets.
 # Reuse that kernel state without accepting any live socket/listener owner.
 rows=[]
 for line in Path('/proc/net/tcp').read_text().splitlines()[1:]:
  f=line.split()
  if int(f[1].split(':')[1],16)==port and f[1].split(':')[0] in ['0100007F','00000000']:rows.append(f)
 if not rows or any(f[3] not in ['05','06'] or f[9]!='0' for f in rows):fail('OCCUPIED_APPLICATION_PORT_REFUSED')
 with socket.socket() as s:
  s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  try:s.bind(('127.0.0.1',port))
  except OSError:fail('OCCUPIED_APPLICATION_PORT_REFUSED')
def windows_commit():
 # One bounded retry for a transient WSL interop failure, before data mutation.
 # A successful measurement below the existing threshold is never retried.
 ps='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
 for attempt in range(2):
  try:
   value=subprocess.check_output([ps,'-NoProfile','-NonInteractive','-Command','(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory'],text=True,timeout=15).strip()
   if not value.isdigit():raise ValueError('Invalid memory measurement')
   commit=int(value)
  except (subprocess.SubprocessError,OSError,ValueError):
   if attempt==0:out('Retrying the Windows memory measurement once; no installation data has changed.')
   continue
  if commit<900000:fail('LOW_WINDOWS_COMMIT_BEFORE_BUILD')
  return commit
 fail('WINDOWS_COMMIT_MEASUREMENT_UNAVAILABLE | Retry after the Windows/WSL helper is available; no resource guard was bypassed')
def check(resources=True):
 if 'microsoft' not in Path('/proc/sys/kernel/osrelease').read_text().lower():fail('WSL2_REQUIRED_FOR_VERIFIED_HOST_PATH')
 if 'Ubuntu' not in Path('/etc/os-release').read_text():fail('UBUNTU_REQUIRED')
 if os.uname().machine.lower() not in ['x86_64','amd64']:fail('NOT_SUPPORTED_YET_LINUX_AMD64_REQUIRED')
 if subprocess.check_output(['node','--version'],text=True).strip()!='v24.21.0':fail('NODE_24_21_0_REQUIRED')
 if subprocess.check_output(['corepack','pnpm','--version'],text=True).strip()!='11.28.3':fail('PNPM_11_28_3_REQUIRED')
 subprocess.run(['docker','compose','version'],check=True,stdout=subprocess.DEVNULL)
 if subprocess.check_output(['docker','info','--format','{{.OSType}}'],text=True).strip()!='linux':fail('LINUX_DOCKER_REQUIRED')
 available=int(next(l.split()[1] for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))
 if resources and available<1500000:fail('LOW_MEMORY_BEFORE_BUILD')
 if resources and shutil.disk_usage(ROOT).free<4*1024**3:fail('LOW_DISK_BEFORE_BUILD')
 if resources:
  windows_commit()
 out('[PASS] WSL Ubuntu, pinned Node/pnpm, Docker and Compose')
 if resources:out('[PASS] WSL memory, Windows commit and disk guards')
def ownership(st,absent_ok=False):
 if st['root']!=str(ROOT) or st['schema']!=1:fail('FOREIGN_INSTANCE_STATE')
 expected={'io.capstone.kit.owner':st['owner'],'io.capstone.kit.root':hashlib.sha256(str(ROOT).encode()).hexdigest()}
 for typ,name in [('container',st['project']+'-postgres-1'),('container',st['project']+'-mailpit-1'),('volume',st['project']+'-pg')]:
  p=subprocess.run(['docker',typ,'inspect',name],capture_output=True,text=True)
  if p.returncode:
   if absent_ok:continue
   fail('OWNED_RESOURCE_MISSING')
  r=json.loads(p.stdout)[0];labels=r['Config']['Labels'] if typ=='container' else r['Labels']
  if not all(labels.get(k)==v for k,v in expected.items()):fail('FOREIGN_DOCKER_RESOURCE_REFUSED')
def compose(st,*args):ownership(st,True);run(['docker','compose','-p',st['project'],'-f',str(LOCAL/'compose.yaml'),*args],'compose-'+args[0])
def runtime_contract(st):
 p=LOCAL/'runtime.json';safe(p)
 if p.stat().st_mode&0o077 or p.stat().st_uid!=os.getuid():fail('PRIVATE_RUNTIME_FILE_PERMISSIONS')
 e=read(p)
 for name,role in [('DATABASE_URL','capstone_runtime'),('JOB_DATABASE_URL','capstone_jobs')]:
  u=urlparse(e.get(name,''))
  if u.scheme not in ['postgres','postgresql'] or u.hostname!='127.0.0.1' or u.port!=st['ports']['db'] or u.path!='/capstone_local' or u.username!=role or u.query or u.fragment:fail('NON_OWNED_DATABASE_TARGET_REFUSED')
 expected={'APP_ENV':'local','WORKSPACE_ROOT':str(ROOT),'AUTH_BASE_URL':'http://127.0.0.1:'+str(st['ports']['web']),'PRIVATE_STORAGE_ROOT':str(LOCAL/'storage'),'UPLOAD_INTERNAL_URL':'http://127.0.0.1:'+str(st['ports']['upload']),**settings.runtime_settings(st,ROOT)}
 if any(e.get(k)!=v for k,v in expected.items()):fail('UNSUPPORTED_CHANGED_RUNTIME_CONFIG_REFUSED')
def journal(st,step):
 if step not in st['completed']:st['completed'].append(step)
 save(STATE,st);out('[PASS] '+step)
 if os.environ.get('CAPSTONE_INSTALL_TEST_STOP_AFTER')==step:fail('CONTROLLED_TEST_INTERRUPTION')
def init(email):
 if LOCAL.exists():fail('UNKNOWN_EXISTING_LOCAL_DIRECTORY_REFUSED')
 if not email or '@' not in email or not email.endswith('.local'):fail('LOCAL_CAPTURE_REQUIRES_SYNTHETIC_DOT_LOCAL_ADMIN')
 LOCAL.mkdir(mode=0o700);owner=secrets.token_hex(16);st={'schema':1,'root':str(ROOT),'owner':owner,'project':'capstone-kit-'+secrets.token_hex(6),'admin_email':email,'ports':{'web':free(3760),'upload':free(3860),'worker':free(3960),'db':free(16530),'smtp':free(17625),'mail_ui':free(17680)},'completed':[]}
 save(STATE,st);pw={r:secrets.token_urlsafe(32) for r in ['bootstrap','migration','runtime','jobs']}
 save(LOCAL/'database/config.json',{'version':1,'workspaceRoot':str(ROOT),'developmentPort':st['ports']['db'],'testPort':st['ports']['db'],'passwords':pw})
 for r,v in pw.items():p=LOCAL/'database'/f'{r}.password';p.write_text(v);p.chmod(0o600)
 labels={'io.capstone.kit.owner':owner,'io.capstone.kit.root':hashlib.sha256(str(ROOT).encode()).hexdigest()}
 compose_data={'name':st['project'],'services':{'postgres':{'image':'postgres:17.11-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652','entrypoint':['sh','/usr/local/bin/capstone-entrypoint.sh'],'command':['postgres'],'tmpfs':['/run/capstone-secrets'],'environment':{'POSTGRES_USER':'capstone_bootstrap','POSTGRES_DB':'capstone_local','POSTGRES_PASSWORD_FILE':'/run/capstone-secrets/bootstrap_password','POSTGRES_INITDB_ARGS':'--encoding=UTF8 --locale=C.UTF-8 --auth-host=scram-sha-256'},'ports':[f"127.0.0.1:{st['ports']['db']}:5432"],'secrets':[r+'_password' for r in pw],'volumes':[st['project']+'-pg:/var/lib/postgresql/data',str(ROOT/'infra/postgres/entrypoint.sh')+':/usr/local/bin/capstone-entrypoint.sh:ro',str(ROOT/'infra/postgres/init.sh')+':/docker-entrypoint-initdb.d/10-roles.sh:ro'],'labels':labels}},'volumes':{st['project']+'-pg':{'name':st['project']+'-pg','labels':labels}},'secrets':{r+'_password':{'file':str(LOCAL/'database'/f'{r}.password')} for r in pw}}
 compose_data['services']['mailpit']={'image':'axllent/mailpit:v1.30.7@sha256:d5ecbb067db3705fa953d79e1b7f81ef84038df67aba6c52825d8c02a1ea748a','command':['--listen','0.0.0.0:8025','--smtp','0.0.0.0:1025','--disable-version-check'],'ports':[f"127.0.0.1:{st['ports']['smtp']}:1025",f"127.0.0.1:{st['ports']['mail_ui']}:8025"],'labels':labels}
 (LOCAL/'compose.yaml').write_text(json.dumps(compose_data,indent=2));return st
def node(st,task):run(['node','--conditions=react-server','--import','tsx','scripts/tasks.mts',task],task)
def running(record):
 p=Path('/proc')/str(record['pid'])
 if not p.exists():return False
 if p.joinpath('stat').read_text().split()[21]!=record['start']:return False
 if os.readlink(p/'cwd')!=str(ROOT) or 'scripts/launch.mjs' not in p.joinpath('cmdline').read_text():fail('FOREIGN_PROCESS_REFUSED')
 return True
def listeners(st):
 proof=[]
 for role in ['web','upload','worker']:
  record=read(LOCAL/f'{role}.process.json')
  for attempt in range(150):
   if not running(record):fail('OWNED_SERVICE_EXITED_'+role)
   found=None
   for line in Path('/proc/net/tcp').read_text().splitlines()[1:]:
    fields=line.split()
    if fields[3]=='0A' and int(fields[1].split(':')[1],16)==st['ports'][role]:found=fields
   if found:
    if found[1].split(':')[0]!='0100007F':fail('NONLOOPBACK_BIND')
    links=[]
    for fd in (Path('/proc')/str(record['pid'])/'fd').iterdir():
     try:links.append(os.readlink(fd))
     except FileNotFoundError:pass
    if 'socket:['+found[9]+']' not in links:fail('LISTENER_NOT_OWNED_'+role)
    proof.append({'role':role,'pid':record['pid'],'port':st['ports'][role],'loopback':True,'socket_inode_owner':True});break
   time.sleep(.2)
  else:fail('OWNED_LISTENER_TIMEOUT_'+role)
 save(LOCAL/'listener-proof.json',{'root_owner':st['owner'],'processes':proof})
def start(st):
 if st.get('demo') and 'DEMO' not in st['completed']:fail('DEMO_NOT_READY | Resume the opted-in installation before opening the application')
 runtime_contract(st)
 if st['features']['ai']['enabled']:
  try:settings.model_probe(st['features']['ai']['base_url'],settings.token_from(LOCAL/'ai-token'))
  except (RuntimeError,ValueError) as e:settings.guidance(str(e));fail('AI_NOT_READY | Retry after loading models or explicitly configure --ai-off; no silent disable')
 run(['python3','scripts/verify-binary.py'],'binary-verification')
 compose(st,'up','-d','--no-recreate');ownership(st)
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  r=subprocess.run(['docker','exec',st['project']+'-postgres-1','pg_isready','-U','capstone_bootstrap','-d','capstone_local'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if r.returncode==0:break
  time.sleep(.3)
 else:fail('DATABASE_NOT_READY')
 for role in ['upload','worker','web']:
  record=LOCAL/f'{role}.process.json'
  if record.exists() and running(read(record)):continue
  application_port_available(st['ports'][role])
  log=(LOCAL/'installer-logs'/f'{role}.log').open('ab');env=os.environ.copy();env['NEXT_TELEMETRY_DISABLED']='1'
  args=['node']+([] if role=='web' else ['--conditions=react-server'])+['scripts/launch.mjs',role]
  proc=subprocess.Popen(args,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);log.close()
  p=Path('/proc')/str(proc.pid);save(record,{'pid':proc.pid,'start':p.joinpath('stat').read_text().split()[21],'owner':st['owner']})
 listeners(st);node(st,'doctor')
def stop_applications(st):
 ownership(st)
 for role in ['web','upload','worker']:
  f=LOCAL/f'{role}.process.json'
  if f.exists():
   r=read(f)
   if r['owner']!=st['owner']:fail('PROCESS_OWNER_MISMATCH')
   if running(r):os.kill(r['pid'],signal.SIGTERM)
 time.sleep(3)
def stop(st):
 stop_applications(st);compose(st,'stop');out('[PASS] Owned services stopped; database and originals retained')
def main():
 p=argparse.ArgumentParser(description='Capstone Repository self-hosted installer for the documented evaluation environment')
 p.add_argument('action',choices=['install','start','stop','doctor','status','uninstall','credentials','configure','demo-accounts']);p.add_argument('--yes',action='store_true');p.add_argument('--resume',action='store_true');p.add_argument('--admin-email');p.add_argument('--demo',action='store_true',default=None)
 ai=p.add_mutually_exclusive_group();ai.add_argument('--ai',dest='ai',action='store_true',default=None);ai.add_argument('--ai-off',dest='ai',action='store_false');p.add_argument('--ai-base-url');p.add_argument('--ai-token-file');p.add_argument('--mail-config')
 a=p.parse_args();out('CAPSTONE REPOSITORY '+release_version()+' | LOCAL SELF-HOSTED SETUP\n==========================================')
 if a.action=='install' and not a.yes:
  if not sys.stdin.isatty():fail('NONINTERACTIVE_REQUIRES_EXPLICIT_--yes_AND_--admin-email')
  if input('Install the full platform with clean data and local services? [y/N] ').lower()!='y':return
  if a.demo is None:a.demo=input('Load the existing synthetic Demo projects and role scenarios? [y/N] ').lower()=='y'
  if not a.admin_email:a.admin_email=input('Synthetic initial admin email (.local): ').strip()
 check(a.action=='install');safe(LOCAL)
 if STATE.exists():
  st=read(STATE);ownership(st,True)
  if a.admin_email and a.admin_email!=st['admin_email']:fail('ADMIN_IDENTITY_CHANGE_REFUSED')
 elif a.action=='install':st=init(a.admin_email)
 else:fail('NO_OWNED_INSTALLATION')
 lock=(LOCAL/'installer.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 st=read(STATE);ownership(st,True)
 ai_root=ROOT.parent/('.'+ROOT.name+'-ai-'+st['owner'])
 safe(ai_root)
 if ai_root.exists():
  if read(ai_root/'.owner.json')!={'owner':st['owner'],'root':str(ROOT)}:fail('FOREIGN_AI_CACHE_DIRECTORY')
 else:
  ai_root.mkdir(mode=0o700);save(ai_root/'.owner.json',{'owner':st['owner'],'root':str(ROOT)})
 st['ai_root']=str(ai_root)
 previous_demo=st.get('demo',False)
 if 'demo' not in st:st['demo']=False
 if a.demo:st['demo']=True
 save(STATE,st)
 if a.action in ['install','configure']:
  before=st.get('features');st['features']=settings.configure(ROOT,LOCAL,st,a,interactive=sys.stdin.isatty() and not a.yes);save(STATE,st)
  if (LOCAL/'runtime.json').exists():
   if before!=st['features']:stop_applications(st)
   runtime=read(LOCAL/'runtime.json');runtime.update(settings.runtime_settings(st,ROOT))
   if st['features']['mail']['mode']=='capture':
    for key in ['ACCOUNT_MAIL_AGENT_KEY','ACCOUNT_MAIL_REGION','ACCOUNT_MAIL_ENDPOINT']:runtime.pop(key,None)
   save(LOCAL/'runtime.json',runtime)
  if a.action=='configure':
   if not (LOCAL/'runtime.json').exists():fail('FINISH_INSTALL_BEFORE_CONFIGURE_ACTION')
   node(st,'validate-config');start(st);return
 if 'features' not in st:fail('RESUME_INSTALL_TO_CONFIGURE_FULL_PLATFORM_FEATURES')
 if a.action=='demo-accounts':
  if not sys.stdin.isatty():fail('DEMO_CREDENTIALS_REQUIRE_PRIVATE_INTERACTIVE_TTY')
  if not st['demo']:fail('DEMO_NOT_INSTALLED')
  identities=read(LOCAL/'demo/identities.json')
  preferred=['admin-kku','reviewer-kku-01','s01-author-1','s05-author-1','s09-author-1','reviewer-pending','reviewer-suspended','partner-approved','partner-pending','closure-partner-active','closure-partner-revoked']
  out('Initial synthetic Demo credentials only; user-changed passwords remain unchanged.')
  for key in preferred:
   if key in identities:
    v=identities[key];out(key+' | '+v['role']+' | '+v['email'])
  key=input('Account key to display privately, list for all keys, or blank to exit: ').strip()
  if key=='list':
   for k,v in identities.items():
    if k!='platform':out(k+' | '+v['role']+' | '+v['email'])
   key=input('Account key (blank exits): ').strip()
  if key:
   if key=='platform':fail('USE_YOUR_CURRENT_INSTALLER_ADMINISTRATOR_PASSWORD')
   if key not in identities:fail('UNKNOWN_DEMO_ACCOUNT')
   out('Email: '+identities[key]['email']+'\nPassword: '+identities[key]['password'])
  return

 if a.action=='credentials':
  if not sys.stdin.isatty():fail('PRIVATE_ROTATION_REQUIRES_INTERACTIVE_TTY')
  if (LOCAL/'credential-handoff.json').exists():fail('HANDOFF_ALREADY_RECORDED_USE_ACCOUNT_SECURITY')
  import getpass
  password=getpass.getpass('New administrator password (hidden): ')
  if len(password)<16 or password!=getpass.getpass('Confirm new password (hidden): '):fail('PASSWORD_LENGTH_OR_CONFIRMATION')
  runtime_contract(st)
  result=subprocess.run(['node','scripts/rotate.mjs'],input=password,text=True,cwd=ROOT,capture_output=True)
  if result.returncode:fail('CREDENTIAL_ROTATION_FAILED_NO_SECRET_PRINTED')
  out('[PASS] Initial bootstrap secret retired through normal authenticated change-password API');return
 if a.action in ['stop','uninstall']:stop(st);return
 if a.action=='status':out(json.dumps({'completed':st['completed'],'AI':'enabled' if st['features']['ai']['enabled'] else 'explicitly disabled','mail':st['features']['mail']['mode'],'demo':'installed' if 'DEMO' in st['completed'] else 'not installed','data_retained':True}));return
 if a.action=='doctor':ownership(st);runtime_contract(st);listeners(st);node(st,'doctor');return
 if a.action=='start':start(st);return
 started=False
 for step in ['INSTALL_DEPS','DATABASE_READY','MIGRATE','BOOTSTRAP_ADMIN','DEMO','BUILD','ACCEPTANCE']:
  if step in st['completed']:continue
  if step=='INSTALL_DEPS':
   run(['corepack','pnpm','install','--frozen-lockfile'],'dependencies',env=dependency_environment());run(['python3','scripts/verify-binary.py'],'binary-verification');run(['corepack','pnpm','build:packages'],'build-packages')
  elif step=='DATABASE_READY':
   compose(st,'config','--quiet');compose(st,'up','-d');ownership(st)
   for attempt in range(150):
    q=subprocess.run(['docker','exec',st['project']+'-postgres-1','pg_isready','-U','capstone_bootstrap','-d','capstone_local'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if q.returncode==0:break
    time.sleep(.3)
   else:fail('DATABASE_NOT_READY')
  elif step=='MIGRATE':node(st,'migrate')
  elif step=='BOOTSTRAP_ADMIN':node(st,'bootstrap')
  elif step=='DEMO':
   if not st['demo']:continue
   try:run(['node','--conditions=react-server','--import','tsx','scripts/demo/preflight.mts'],'demo-preflight')
   except RuntimeError:
    if not previous_demo:st['demo']=False;save(STATE,st)
    raise
   stop_applications(st)
   run(['node','--conditions=react-server','--import','tsx','scripts/demo/run.mts'],'demo-install')
   runtime=read(LOCAL/'runtime.json');runtime['CAPSTONE_SYNTHETIC_DEMO']='true';save(LOCAL/'runtime.json',runtime)
  elif step=='BUILD':
   run(['corepack','pnpm','--filter','./apps/web','--filter','./apps/upload','--filter','./apps/worker','--workspace-concurrency','1','-r','build'],'build-apps',env={**os.environ,'CAPSTONE_AI_DATA_DIR':st['ai_root']})
  elif step=='ACCEPTANCE':start(st);started=True
  journal(st,step)
 if 'ACCEPTANCE' in st['completed'] and not started:start(st)
 out(f"READY | http://127.0.0.1:{st['ports']['web']}/en\nLocal Mailpit: http://127.0.0.1:{st['ports']['mail_ui']}\nInitial administrator credential: private .local/accounts/bootstrap-admin.json (not printed); choose your password with scripts/credentials.sh.\nAI: {'enabled and preflight verified' if st['features']['ai']['enabled'] else 'explicitly disabled; partial-feature profile'} | Mail: {st['features']['mail']['mode']} | Existing synthetic Demo: {'installed' if st['demo'] else 'not selected'}\nUse bash scripts/doctor.sh; stop/uninstall retain all data.")

if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:out('STOPPED | Installation data retained. Rerun install --resume when ready.');sys.exit(130)
 except (RuntimeError,subprocess.SubprocessError,FileNotFoundError,BlockingIOError) as e:out('STOP | '+str(e));sys.exit(1)
