"""Small supported AI/mail onboarding; secrets stay in owned 0600 state."""
from pathlib import Path
import os,json,ipaddress,urllib.request,urllib.error,urllib.parse,time,math,secrets
GENERATION='qwen/qwen3.5-9b';EMBEDDING='text-embedding-qwen3-embedding-0.6b'
ENDPOINTS={'US':'https://cpaas.zoho.com/v1.1/email','EU':'https://cpaas.zoho.eu/v1.1/email','IN':'https://cpaas.zoho.in/v1.1/email','AU':'https://cpaas.zoho.com.au/v1.1/email','JP':'https://cpaas.zoho.jp/v1.1/email','CN':'https://cpaas.zoho.com.cn/v1.1/email'}
LEGACY_US='https://api.zeptomail.com/v1.1/email'
def endpoint(value):
 try:
  u=urllib.parse.urlsplit(value);ip=ipaddress.IPv4Address(u.hostname);port=u.port or 80
  allowed=any(ip in ipaddress.ip_network(n) for n in ['127.0.0.0/8','10.0.0.0/8','192.168.0.0/16','172.16.0.0/12'])
  if u.scheme!='http' or u.path not in ['','/'] or u.username or u.password or u.query or u.fragment or not allowed or not 1<=port<=65535:raise ValueError()
  return f'http://{ip}:{port}'
 except (ValueError,TypeError):raise RuntimeError('AI_ENDPOINT_MUST_MATCH_EXISTING_PRIVATE_IPV4_HTTP_CONTRACT') from None
def private_file(path):
 p=Path(path).absolute()
 for item in [p,*p.parents]:
  if item.is_symlink():raise RuntimeError('SETTINGS_SYMLINK_REFUSED')
 s=p.stat()
 if not p.is_file() or s.st_uid!=os.getuid() or s.st_mode&0o077:raise RuntimeError('SETTINGS_INPUT_REQUIRES_OWNED_0600_FILE')
 return p
def token_from(path):
 token=private_file(path).read_text(encoding='utf-8-sig').strip()
 if not 1<=len(token)<=4096 or not token.isascii() or any(c.isspace() or ord(c)<32 for c in token):raise RuntimeError('INVALID_PRIVATE_MODEL_TOKEN')
 return token
def save(path,value):
 p=Path(path);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 for item in [p,*p.parents]:
  if item.is_symlink():raise RuntimeError('SETTINGS_SYMLINK_REFUSED')
 tmp=p.with_name(p.name+'.'+secrets.token_hex(8)+'.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:f.write(value if isinstance(value,str) else json.dumps(value,indent=2))
 os.replace(tmp,p);p.chmod(0o600)
def model_probe(base,token):
 base=endpoint(base);client=urllib.request.build_opener(urllib.request.ProxyHandler({}));headers={'Content-Type':'application/json','Authorization':'Bearer '+token};started=time.monotonic()
 def request(path,body=None):
  req=urllib.request.Request(base+path,headers=headers,data=None if body is None else json.dumps(body).encode(),method='GET' if body is None else 'POST')
  try:return client.open(req,timeout=120)
  except (urllib.error.URLError,TimeoutError,OSError):raise RuntimeError('AI_SERVICE_UNAVAILABLE_OR_AUTH_REJECTED') from None
 with request('/v1/models') as r:models=json.loads(r.read(2_000_000))
 ids={m.get('id') for m in models.get('data',[]) if isinstance(m,dict)}
 if not {GENERATION,EMBEDDING}<=ids:raise RuntimeError('AI_REQUIRED_MODEL_IDS_NOT_AVAILABLE')
 with request('/v1/embeddings',{'model':EMBEDDING,'input':['Synthetic installation readiness check.'],'encoding_format':'float'}) as r:emb=json.loads(r.read(2_000_000))
 try:v=emb['data'][0]['embedding'];valid=len(emb['data'])==1 and len(v)==1024 and all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) for x in v) and sum(x*x for x in v)>0
 except (KeyError,TypeError,IndexError):valid=False
 if not valid:raise RuntimeError('AI_EMBEDDING_REQUIRES_1024_FINITE_NONZERO_COMPONENTS')
 schema={'type':'object','properties':{'status':{'type':'string','enum':['ready']}},'required':['status'],'additionalProperties':False}
 with request('/v1/chat/completions',{'model':GENERATION,'temperature':0,'reasoning_effort':'none','max_tokens':96,'messages':[{'role':'system','content':'Return the requested JSON object only.'},{'role':'user','content':'Return {"status":"ready"}.'}],'response_format':{'type':'json_schema','json_schema':{'name':'installation_readiness','strict':True,'schema':schema}},'stream':False}) as r:chat=json.loads(r.read(100_000))
 try:valid=json.loads(chat['choices'][0]['message']['content'])=={'status':'ready'} and not chat['choices'][0]['message'].get('reasoning_content')
 except (KeyError,TypeError,IndexError,ValueError):valid=False
 if not valid:raise RuntimeError('AI_STRUCTURED_GENERATION_CONTRACT_NOT_READY')
 text='';ended=False;size=0
 with request('/api/v1/chat',{'model':GENERATION,'system_prompt':'Respond briefly.','input':'Reply READY only.','reasoning':'off','max_output_tokens':96,'context_length':16384,'temperature':0,'store':False,'stream':True}) as r:
  for line in r:
   size+=len(line)
   if size>200_000:raise RuntimeError('AI_PREFLIGHT_RESPONSE_LIMIT')
   if not line.startswith(b'data:'):continue
   try:event=json.loads(line[5:])
   except ValueError:continue
   if event.get('type')=='error':raise RuntimeError('AI_NATIVE_API_NOT_READY')
   if event.get('type')=='message.delta':text+=event.get('content','')
   if event.get('type')=='chat.end':ended=True
 if not ended or not text.strip():raise RuntimeError('AI_NATIVE_API_DID_NOT_COMPLETE')
 return {'generation_model':GENERATION,'embedding_model':EMBEDDING,'vector_dimensions':1024,'finite_nonzero_vectors':True,'actual_structured_generation':True,'actual_native_stream_generation':True,'seconds':round(time.monotonic()-started,3)}
def guidance(code):
 print('AI NOT READY | '+code,flush=True)
 print('Start LM Studio and its local server; load '+GENERATION+' and '+EMBEDDING+'. Serve the exact IDs, 1024-dimensional embeddings and a 16384-token generation context. Do not download weights automatically or expose the server publicly.\nOfficial setup: https://lmstudio.ai/docs/developer/core/server\nModels: https://lmstudio.ai/docs/app/basics/download-model\nIf WSL cannot reach Windows localhost, use an already working private endpoint; this installer never changes networking/firewall. See MODEL_REQUIREMENTS.md.',flush=True)
def parse_mail(value):
 if not isinstance(value,dict) or set(value)-{'mode','region','endpoint','from_address','from_name','app_origin','agent_key'}:raise RuntimeError('UNSUPPORTED_MAIL_CONFIGURATION_FIELDS')
 if value=={'mode':'capture'}:return value
 if value.get('mode')!='zoho':raise RuntimeError('APPROVED_PROVIDER_MODE_MUST_BE_ZOHO')
 region=value.get('region','US');target=value.get('endpoint',ENDPOINTS.get(region));key=value.get('agent_key','');address=value.get('from_address','');name=value.get('from_name','Capstone Repository');origin=value.get('app_origin','')
 u=urllib.parse.urlsplit(origin)
 if region not in ENDPOINTS or target not in [ENDPOINTS[region],LEGACY_US if region=='US' else ENDPOINTS[region]]:raise RuntimeError('MAIL_ENDPOINT_NOT_APPROVED')
 if not isinstance(key,str) or not 20<=len(key)<=512 or key.startswith('REPLACE_') or any(c.isspace() or ord(c)<32 for c in key):raise RuntimeError('INVALID_PRIVATE_PROVIDER_KEY')
 if not isinstance(address,str) or not 3<=len(address)<=254 or address.count('@')!=1 or address.lower().endswith('.local') or any(c.isspace() or c in '<>' for c in address):raise RuntimeError('INVALID_PROVIDER_SENDER')
 if not isinstance(name,str) or len(name)>120 or any(ord(c)<32 for c in name):raise RuntimeError('INVALID_PROVIDER_FROM_NAME')
 if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ['', '/'] or origin.endswith('/'):raise RuntimeError('PROVIDER_REQUIRES_EXISTING_HTTPS_APPLICATION_ORIGIN')
 return {'mode':'zoho','region':region,'endpoint':target,'from_address':address,'from_name':name,'app_origin':origin,'agent_key':key}
def configure(root,local,state,args,interactive=False):
 prior=state.get('features');explicit=any(getattr(args,k,None) is not None for k in ['ai','ai_base_url','ai_token_file','mail_config'])
 if prior and not explicit:return prior
 enabled=getattr(args,'ai',None)
 if enabled is None:enabled=prior['ai']['enabled'] if prior else True
 base=endpoint(getattr(args,'ai_base_url',None) or (prior['ai']['base_url'] if prior else 'http://127.0.0.1:1234'));tokenfile=local/'ai-token'
 if getattr(args,'ai_token_file',None):token=token_from(args.ai_token_file)
 elif tokenfile.exists():token=token_from(tokenfile)
 else:token=secrets.token_urlsafe(32)
 proof=None
 while enabled:
  try:proof=model_probe(base,token);break
  except (RuntimeError,ValueError) as e:
   guidance(str(e))
   if not interactive:raise RuntimeError('AI_PREFLIGHT_BLOCKED | Start/load models and rerun --resume, configure an existing --ai-base-url/--ai-token-file, or choose --ai-off explicitly. AI was not silently disabled.') from None
   choice=input('[R]etry / [C]onfigure endpoint or private token file / [D]isable AI explicitly / [E]xit: ').strip().lower()
   if choice=='r':continue
   if choice=='c':
    base=endpoint(input('Existing local/private model endpoint [http://127.0.0.1:1234]: ').strip() or 'http://127.0.0.1:1234')
    secret_path=input('Owned0600 model API-token file (blank keeps current token for a server without authentication): ').strip()
    if secret_path:token=token_from(secret_path)
   elif choice=='d':enabled=False
   elif choice=='e':raise RuntimeError('INSTALLATION_STOPPED_BY_OPERATOR')
 save(tokenfile,token)
 mail=prior['mail'] if prior else {'mode':'capture'}
 provider_file=getattr(args,'mail_config',None)
 if interactive and not prior and not provider_file:
  choice=input('Mail: [L]ocal capture + Mailpit (default) / [P]reconfigured approved provider: ').strip().lower()
  if choice=='p':provider_file=input('Owned0600 provider configuration JSON path (see example): ').strip()
 if provider_file:mail=parse_mail(json.loads(private_file(provider_file).read_text(encoding='utf-8-sig')))
 result={'ai':{'enabled':bool(enabled),'base_url':base,'token_file':str(tokenfile),'windows_memory_check':True,'preflight':proof},'mail':mail}
 print('AI: '+('enabled; actual generation+embedding preflight passed' if enabled else 'explicitly disabled — partial-feature profile'),flush=True)
 print('Mail: '+('approved provider configured; external delivery still requires operator validation' if mail['mode']=='zoho' else 'local account capture + loopback committee Mailpit; not external inbox delivery'),flush=True)
 return result
def runtime_settings(state,root):
 f=state['features'];ai=f['ai'];mail=f['mail'];origin='http://127.0.0.1:'+str(state['ports']['web'])
 result={'AI_ENABLED':str(ai['enabled']).lower(),'CAPSTONE_AI_BASE_URL':ai['base_url'],'CAPSTONE_AI_TOKEN_FILE':ai['token_file'],'CAPSTONE_AI_DATA_DIR':state['ai_root'],'CAPSTONE_AI_WINDOWS_MEMORY_CHECK':str(ai['windows_memory_check']).lower(),'CAPSTONE_SYNTHETIC_DEMO':str('DEMO' in state.get('completed',[])).lower()}
 if mail['mode']=='capture':result.update({'ACCOUNT_MAIL_MODE':'capture','ACCOUNT_MAIL_APP_ORIGIN':origin,'ACCOUNT_MAIL_FROM_ADDRESS':'accounts@capstone.local','ACCOUNT_MAIL_FROM_NAME':'Capstone Repository','ACCOUNT_MAIL_CAPTURE_ROOT':str(root/'.local/mail'),'COMMITTEE_MAIL_MODE':'mailpit','MAILPIT_HOST':'127.0.0.1','MAILPIT_PORT':str(state['ports']['smtp'])})
 else:result.update({'ACCOUNT_MAIL_MODE':'zoho','ACCOUNT_MAIL_APP_ORIGIN':mail['app_origin'],'ACCOUNT_MAIL_FROM_ADDRESS':mail['from_address'],'ACCOUNT_MAIL_FROM_NAME':mail['from_name'],'ACCOUNT_MAIL_REGION':mail['region'],'ACCOUNT_MAIL_ENDPOINT':mail['endpoint'],'ACCOUNT_MAIL_AGENT_KEY':mail['agent_key'],'COMMITTEE_MAIL_MODE':'provider'})
 return result
