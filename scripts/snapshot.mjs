import {readFile,writeFile,readdir}from'node:fs/promises';import{createRequire}from'node:module';import{createHash}from'node:crypto';
const {Client}=createRequire(process.cwd()+'/packages/db/package.json')('pg'),cfg=JSON.parse(await readFile('.local/database/config.json','utf8'));
const db=new Client({connectionString:`postgresql://capstone_migrator:${cfg.passwords.migration}@127.0.0.1:${cfg.developmentPort}/capstone_local`});await db.connect();await db.query('BEGIN READ ONLY');
const digest=x=>createHash('sha256').update(x).digest('hex'),tables=[];
for(const name of ['users','auth_accounts','projects','project_versions','storage_objects','project_submissions','audit_logs','notifications']){const rows=(await db.query('SELECT to_jsonb(t)::text row FROM app.'+name+' t ORDER BY to_jsonb(t)::text')).rows;tables.push({name,count:rows.length,sha256:digest(JSON.stringify(rows))});}
const migrations=(await db.query('SELECT id,hash FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
const objects=[];for(const name of await readdir('.local/storage')){try{const bytes=await readFile('.local/storage/'+name);objects.push({name,bytes:bytes.length,sha256:digest(bytes)});}catch{}}
await db.query('ROLLBACK');await db.end();const result={tables,migration_records:migrations.length,migration_hash:digest(JSON.stringify(migrations)),objects:objects.sort((a,b)=>a.name.localeCompare(b.name))};
await writeFile('.local/persistence-'+process.argv[2]+'.json',JSON.stringify(result,null,2));
if(process.argv[2]==='after'){
 const before=JSON.parse(await readFile('.local/persistence-before.json','utf8'));if(JSON.stringify(before)!==JSON.stringify(result))throw Error('PERSISTENCE_FINGERPRINT_CHANGED');
 const record=JSON.parse(await readFile('.local/qa-private-record.json','utf8')),state=JSON.parse(await readFile('.local/installation.json','utf8')),base='http://127.0.0.1:'+state.ports.web;
 const res=await fetch(base+record.path,{headers:{Cookie:record.authorCookie}});if(res.status!==200||digest(Buffer.from(await res.arrayBuffer()))!==record.bytes_sha256)throw Error('RESTORED_AUTH_OR_ORIGINAL_READ_FAILED');
 const anon=await fetch(base+record.path);if(anon.status!==404)throw Error('ANONYMOUS_DENIAL_CHANGED');
 console.log('PERSISTENCE_PASS | 8 table hashes + migration ledger + originals + authenticated same-byte read + anonymous404');
}else console.log('BEFORE_PERSISTENCE_FINGERPRINT_RECORDED');
