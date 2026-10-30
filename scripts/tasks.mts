import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {randomBytes} from 'node:crypto';
import {applyMigrations} from '@capstone/db/migration';import{localSecret,bootstrapAdmin}from'../tools/auth/local.js';import{databaseUrl,loadLocalDatabaseConfig}from'../tools/local-infrastructure.js';
const root=process.cwd(),state=JSON.parse(await readFile('.local/installation.json','utf8')),config=await loadLocalDatabaseConfig();
process.env.APP_ENV='local';process.env.WORKSPACE_ROOT=root;
if(state.root!==root)throw Error('FOREIGN_ROOT');const task=process.argv[2];
if(task==='migrate'){
 await applyMigrations(databaseUrl(config,'migration'),resolve('packages/db/migrations'));
 console.log('MIGRATIONS_APPLIED');
}else if(task==='bootstrap'){
 await localSecret();await bootstrapAdmin(state.admin_email);
 if(await readFile('.local/runtime.json').then(()=>true,()=>false)){console.log('EXISTING_PRIVATE_CONFIGURATION_RETAINED');process.exit(0);}
 const origin='http://127.0.0.1:'+state.ports.web;await mkdir('.local/storage',{recursive:true,mode:0o700});await mkdir('.local/ai',{recursive:true,mode:0o700});
 const key=randomBytes(32).toString('base64url');await writeFile('.local/ai-token',randomBytes(32).toString('base64url'),{mode:0o600});
 const env={APP_ENV:'local',WORKSPACE_ROOT:root,DATABASE_URL:databaseUrl(config,'runtime'),JOB_DATABASE_URL:databaseUrl(config,'jobs'),AUTH_SECRET:await localSecret(),AUTH_BASE_URL:origin,PRIVATE_STORAGE_ROOT:resolve('.local/storage'),AI_ENABLED:'false',CAPSTONE_AI_BASE_URL:'http://127.0.0.1:16660',CAPSTONE_AI_TOKEN_FILE:resolve('.local/ai-token'),CAPSTONE_AI_DATA_DIR:state.ai_root,ACCOUNT_MAIL_MODE:'capture',ACCOUNT_MAIL_APP_ORIGIN:origin,ACCOUNT_MAIL_ENCRYPTION_KEY:key,ACCOUNT_MAIL_KEY_ID:'v1',ACCOUNT_MAIL_FROM_ADDRESS:'accounts@capstone.local',ACCOUNT_MAIL_CAPTURE_ROOT:resolve('.local/mail'),UPLOAD_INTERNAL_URL:'http://127.0.0.1:'+state.ports.upload,UPLOAD_BROWSER_ORIGIN:origin,COMMITTEE_MAIL_MODE:'mailpit',MAILPIT_HOST:'127.0.0.1',MAILPIT_PORT:String(state.ports.smtp)};
 await writeFile('.local/runtime.json',JSON.stringify(env),{mode:0o600});console.log('SECURE_FIRST_ADMIN_AND_PRIVATE_CONFIG_READY');
}else if(task==='doctor'){
 const origin='http://127.0.0.1:'+state.ports.web;
 for(const role of ['web','upload','worker']){
  let ok=false;for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:'+state.ports[role]+'/health/ready',{signal:AbortSignal.timeout(1500)});if(r.status===200){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ok)throw Error('NOT_READY_'+role);
 }
 const mailHealth=await fetch('http://127.0.0.1:'+state.ports.mail_ui+'/livez');if(mailHealth.status!==200)throw Error('OWNED_MAIL_CAPTURE_NOT_READY');
 const admin=JSON.parse(await readFile('.local/accounts/bootstrap-admin.json','utf8'));
 const login=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password:admin.password})});if(login.status!==200)throw Error('LOGIN_FAILED');const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const taskRead=await fetch(origin+'/api/onboarding?command=00000000-0000-4000-8000-000000000000',{headers:{Cookie:cookie}});if(taskRead.status!==200)throw Error('AUTHORIZED_READ_FAILED');
 for(const path of ['/en','/ar','/en/catalogue'])if((await fetch(origin+path)).status!==200)throw Error('PUBLIC_PAGE_FAILED');
 await fetch(origin+'/api/auth/sign-out',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}'});
 console.log('READY | Web Upload Worker | real HTTP login + permitted administrative receipt read | EN AR catalogue');
}
