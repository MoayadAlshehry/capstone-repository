/** Synthetic-only logical recovery rehearsal into a newly created owned DB. */
import{readFile,writeFile,mkdir,lstat,readdir,cp,open}from'node:fs/promises';import{execFileSync}from'node:child_process';import{createHash,randomBytes}from'node:crypto';import{createRequire}from'node:module';import{resolve,dirname}from'node:path';import assert from'node:assert/strict';import{verifyOwned}from'../../scripts/verify-owned.mjs';
if(process.env.CAPSTONE_RELEASE_BACKUP_TEST!=='1')throw Error('EXPLICIT_DISPOSABLE_RECOVERY_TEST_REQUIRED');
const{state}=await verifyOwned(),root=process.cwd(),runtime=JSON.parse(await readFile('.local/runtime.json','utf8')),cfg=JSON.parse(await readFile('.local/database/config.json','utf8'));assert.equal(runtime.APP_ENV,'local');assert.equal(runtime.PRIVATE_STORAGE_ROOT,resolve(root,'.local/storage'));const url=new URL(runtime.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,String(state.ports.db));assert.equal(url.pathname,'/capstone_local');url.username='capstone_migrator';url.password=cfg.passwords.migration;
const{Client}=createRequire(root+'/packages/db/package.json')('pg'),hash=b=>createHash('sha256').update(b).digest('hex'),name='capstone_kit_restore_'+randomBytes(6).toString('hex'),directory=resolve(root,'.local/recovery-proofs',name);assert(directory.startsWith(resolve(root,'.local/recovery-proofs')+'/'));await noLinks(directory);await mkdir(dirname(directory),{recursive:true,mode:0o700});await mkdir(directory,{mode:0o700});await noLinks(runtime.PRIVATE_STORAGE_ROOT);
async function noLinks(path){for(let p=resolve(path);;p=dirname(p)){try{assert(!(await lstat(p)).isSymbolicLink(),'Recovery paths must not contain symlinks');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}}
async function fingerprint(database){
 const u=new URL(url);u.pathname='/'+database;const c=new Client({connectionString:u.href});await c.connect();
 try{
  await c.query('BEGIN READ ONLY');
  const tables=(await c.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN('app','jobs','drizzle') AND table_type='BASE TABLE' ORDER BY table_schema,table_name")).rows,output=[];
  for(const table of tables){
   assert(/^[a-z0-9_]+$/.test(table.table_schema+table.table_name));
   await c.query(`DECLARE fingerprint_rows NO SCROLL CURSOR FOR SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') row_sha FROM "${table.table_schema}"."${table.table_name}" t ORDER BY 1`);
   const digest=createHash('sha256');let count=0;
   for(;;){const rows=(await c.query('FETCH FORWARD 1000 FROM fingerprint_rows')).rows;if(!rows.length)break;for(const row of rows){digest.update(row.row_sha+'\n');count++;}}
   await c.query('CLOSE fingerprint_rows');output.push({table:table.table_schema+'.'+table.table_name,count,sha256:digest.digest('hex')});
  }
  const functions=(await c.query("SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','jobs') AND p.prokind='f' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)")).rows;
  await c.query('ROLLBACK');return{tables:output,effective_functions:functions.length,function_acl_sha256:hash(JSON.stringify(functions))};
 }finally{await c.end();}
}
async function objects(path,base=path,result=[]){for(const n of await readdir(path)){const p=path+'/'+n,s=await lstat(p);assert(!s.isSymbolicLink());if(s.isDirectory())await objects(p,base,result);else{assert(s.isFile());result.push({path:p.slice(base.length+1),bytes:s.size,sha256:hash(await readFile(p))});}}return result.sort((a,b)=>a.path.localeCompare(b.path));}
let proof;
try{
 execFileSync('bash',['scripts/stop.sh'],{stdio:'pipe'});
 const container=state.project+'-postgres-1';for(const role of ['postgres','mailpit']){const r=JSON.parse(execFileSync('docker',['inspect',state.project+'-'+role+'-1'],{encoding:'utf8'}))[0];assert.equal(r.Config.Labels['io.capstone.kit.owner'],state.owner);}
 execFileSync('docker',['compose','-p',state.project,'-f',resolve('.local/compose.yaml'),'up','-d','--no-recreate'],{stdio:'pipe'});for(let i=0;i<100;i++){try{execFileSync('docker',['exec',container,'pg_isready','-U','capstone_bootstrap','-d','capstone_local'],{stdio:'pipe'});break;}catch{if(i===99)throw Error('OWNED_DB_NOT_READY');await new Promise(r=>setTimeout(r,100));}}
 const before=await fingerprint('capstone_local'),sourceObjects=await objects(runtime.PRIVATE_STORAGE_ROOT),dump=directory+'/synthetic.dump',out=await open(dump,'wx',0o600);
 try{execFileSync('docker',['exec',container,'pg_dump','-U','capstone_bootstrap','-d','capstone_local','-Fc'],{stdio:['ignore',out.fd,'pipe']});}finally{await out.close();}
 execFileSync('docker',['exec',container,'psql','-U','capstone_bootstrap','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE ${name} OWNER capstone_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C.UTF-8'`],{stdio:'pipe'});
 const input=await open(dump,'r');try{execFileSync('docker',['exec','-i',container,'pg_restore','-U','capstone_bootstrap','--exit-on-error','-d',name],{stdio:[input.fd,'pipe','pipe'],maxBuffer:4_000_000});}finally{await input.close();}
 await cp(runtime.PRIVATE_STORAGE_ROOT,directory+'/storage',{recursive:true,force:false,errorOnExist:true});const after=await fingerprint(name),restoredObjects=await objects(directory+'/storage');assert.deepEqual(after,before);assert.deepEqual(restoredObjects,sourceObjects);
 proof={status:'PASS_LOGICAL_DB_AND_ORIGINALS_RECOVERY',new_blank_restore_target:true,source_writers_stopped:true,tables_verified:before.tables.length,effective_functions_verified:before.effective_functions,function_acl_sha256:before.function_acl_sha256,all_table_fingerprints_equal:true,original_objects_verified:sourceObjects.length,original_set_sha256:hash(JSON.stringify(sourceObjects)),dump_sha256:hash(await readFile(dump)),backup_and_recovery_secrets_exported:false,restore_target_exposed_as_http:false,scope:'Full app/jobs/drizzle table fingerprints and originals copied into an independently new local target; private configuration remains protected in the source instance. Cross-host relocation/HTTP boot of restore target is not claimed.'};
}finally{execFileSync('bash',['scripts/start.sh'],{stdio:'pipe',timeout:300000});}
await writeFile('.local/backup-recovery-proof.json',JSON.stringify(proof,null,2),{mode:0o600});console.log(JSON.stringify(proof));
