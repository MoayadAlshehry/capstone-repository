import {readFile,lstat,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,} from 'node:crypto';
import {createRequire} from 'node:module';
import type pg from 'pg';
import {sourceRoot,safePath} from './store.js';
export async function ownedInstallation(requireStopped=false){
 if(process.cwd()!==sourceRoot||!['local','test'].includes(process.env['APP_ENV']??'local'))throw Error('DEMO_LOCAL_OWNED_SOURCE_REQUIRED');
 async function read(name:string){const p=resolve(sourceRoot,'.local',name);await safePath(p);const s=await lstat(p);if(!s.isFile()||s.mode&0o077||s.uid!==process.getuid?.())throw Error('DEMO_PRIVATE_CONFIG');return JSON.parse(await readFile(p,'utf8'));}
 const state=await read('installation.json'),runtime=await read('runtime.json'),db=await read('database/config.json');
 if(state.root!==sourceRoot||state.schema!==1||state.demo!==true||!/^capstone-kit-[a-f0-9]{12}$/.test(state.project)||db.workspaceRoot!==sourceRoot||db.developmentPort!==state.ports.db)throw Error('DEMO_NOT_OPTED_IN_OR_FOREIGN_STATE');
 const labels={'io.capstone.kit.owner':state.owner,'io.capstone.kit.root':createHash('sha256').update(sourceRoot).digest('hex')};
 for(const role of ['postgres','mailpit']){const r=JSON.parse(execFileSync('docker',['inspect',state.project+'-'+role+'-1'],{encoding:'utf8'}))[0];if(!Object.entries(labels).every(([k,v])=>r.Config.Labels[k]===v)||!r.State.Running)throw Error('DEMO_OWNED_CONTAINER_REQUIRED');
  const port=role==='postgres'?'5432/tcp':'8025/tcp';if(r.NetworkSettings.Ports[port]?.some((p:{HostIp:string})=>p.HostIp!=='127.0.0.1'))throw Error('DEMO_CONTAINER_NOT_LOOPBACK');}
 for(const [key,role] of [['DATABASE_URL','capstone_runtime'],['JOB_DATABASE_URL','capstone_jobs']] as const){const u=new URL(runtime[key]);if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.port!==String(state.ports.db)||u.pathname!=='/capstone_local'||u.username!==role||u.search||u.hash)throw Error('DEMO_FOREIGN_DATABASE_REFUSED');}
 if(runtime.WORKSPACE_ROOT!==sourceRoot||runtime.APP_ENV!=='local'||runtime.PRIVATE_STORAGE_ROOT!==resolve(sourceRoot,'.local/storage')||runtime.AUTH_BASE_URL!=='http://127.0.0.1:'+state.ports.web)throw Error('DEMO_RUNTIME_DRIFT');
 if(requireStopped)for(const role of ['web','upload','worker']){try{const r=await read(role+'.process.json'),now=(await readFile('/proc/'+r.pid+'/stat','utf8')).split(' ')[21];if(now===r.start)throw Error('DEMO_REQUIRES_STOPPED_OWNED_APP');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 const migration=`postgresql://capstone_migrator:${db.passwords.migration}@127.0.0.1:${state.ports.db}/capstone_local`;
 return {state,runtime,migration};
}
export async function database<T>(url:string,work:(c:pg.Client)=>Promise<T>){const o=await ownedInstallation();if(![o.migration,o.runtime.DATABASE_URL,o.runtime.JOB_DATABASE_URL].includes(url))throw Error('DEMO_DATABASE_URL_NOT_OWNED');const {Client}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('pg') as typeof pg;const c=new Client({connectionString:url,connectionTimeoutMillis:2000});await c.connect();try{return await work(c);}finally{await c.end();}}
export const digest=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function emptyStorage(path:string):Promise<boolean>{await safePath(path);const stat=await lstat(path);if(!stat.isDirectory())return false;for(const name of await readdir(path)){const p=resolve(path,name),s=await lstat(p);if(s.isSymbolicLink()||!s.isDirectory()||!await emptyStorage(p))return false;}return true;}
