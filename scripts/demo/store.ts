/** Per-install private journal/credentials, never a shared credential dataset. */
import {lstat,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
export const sourceRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const privateRoot=resolve(sourceRoot,'.local/demo');
export async function safePath(path:string) {
 let current=resolve(path);
 for(;;){try{if((await lstat(current)).isSymbolicLink())throw Error('DEMO_SYMLINK_REFUSED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const p=dirname(current);if(p===current)break;current=p;}
}
export async function privateJson<T>(name:string,initial:()=>T):Promise<T>{
 if(!/^[A-Za-z0-9_-]+\.json$/.test(name))throw Error('INVALID_PRIVATE_NAME');
 await safePath(privateRoot);await mkdir(privateRoot,{recursive:true,mode:0o700});
 const dir=await lstat(privateRoot);if(!dir.isDirectory()||dir.mode&0o077||dir.uid!==process.getuid?.())throw Error('DEMO_PRIVATE_DIRECTORY');
 const file=resolve(privateRoot,name);await safePath(file);
 try{const s=await lstat(file);if(!s.isFile()||s.mode&0o077||s.uid!==process.getuid?.())throw Error('DEMO_PRIVATE_FILE');return JSON.parse(await readFile(file,'utf8')) as T;}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const v=initial();await writeFile(file,JSON.stringify(v,null,2),{flag:'wx',mode:0o600});return v;}
}
export async function savePrivate(name:string,value:unknown){
 if(!/^[A-Za-z0-9_-]+\.(json|md)$/.test(name))throw Error('INVALID_PRIVATE_NAME');
 await privateJson('store.json',()=>({version:1}));const file=resolve(privateRoot,name);await safePath(file);
 const tmp=file+'.'+randomBytes(8).toString('hex');await writeFile(tmp,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx',mode:0o600});await rename(tmp,file);
}
export interface DemoIdentity{key:string;email:string;name:string;password:string;id?:string;university?:string;role:string;}
export async function credential(key:string,name:string,role:string,university?:string){
 const all=await privateJson<Record<string,DemoIdentity>>('identities.json',()=>({}));const prior=all[key];
 if(prior){if(prior.name!==name||prior.role!==role||prior.university!==university)throw Error('IDENTITY_DEFINITION_DRIFT');return prior;}
 const person:DemoIdentity={key,email:key+'.p53@capstone.local',name,password:randomBytes(24).toString('base64url'),role,...(university?{university}:{})};all[key]=person;await savePrivate('identities.json',all);return person;
}
