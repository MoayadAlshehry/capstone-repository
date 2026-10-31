/** Opt-in additive loader of the existing synthetic dataset. No reset/restore. */
import{readFile,readdir,lstat}from'node:fs/promises';
import{resolve}from'node:path';import{createHash}from'node:crypto';import{createRequire}from'node:module';
import{ownedInstallation,database,emptyStorage}from'./ownership.js';import{privateRoot,privateJson,savePrivate,sourceRoot,safePath,type DemoIdentity}from'./store.js';
import{factoryVersion,projectSpecs}from'./scenarios.js';import{verifyAssetInputs}from'./assets.js';import{demoContext}from'./context.js';
import{buildIdentities}from'./identities.js';import{buildProject,type MadeProject}from'./projects.js';import{completeExternal}from'./complete-external.js';
import{buildWorkflowExamples}from'./workflow-examples.js';import{buildClosureExamples}from'./closure-examples.js';import{verifyDatabase}from'./verify.js';import{verifyClosure}from'./verify-closure.js';
type Journal={version:string;owner:string;assetManifest:string;completed:string[];ready:boolean};
const installation=await ownedInstallation();const assetManifest=createHash('sha256').update(await readFile(resolve(sourceRoot,'demo/ASSET_MANIFEST.json'))).digest('hex');
let journal:Journal|undefined;
try{const path=resolve(privateRoot,'journal.json');await safePath(path);const s=await lstat(path);if(!s.isFile()||s.mode&0o077||s.uid!==process.getuid?.())throw Error('DEMO_PRIVATE_JOURNAL_REQUIRED');journal=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(journal&&(journal.owner!==installation.state.owner||journal.version!==factoryVersion||journal.assetManifest!==assetManifest))throw Error('DEMO_FOREIGN_OR_CHANGED_JOURNAL');
if(journal?.ready){console.log('DEMO_ALREADY_INSTALLED | Existing data and user edits retained; no writes or reseeding');process.exit(0);}
await ownedInstallation(true);await verifyAssetInputs();
const{Client}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('pg');const lock=new Client({connectionString:installation.migration,connectionTimeoutMillis:2000});await lock.connect();
try{
 if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",['public-demo-'+installation.state.owner])).rows[0].locked)throw Error('DEMO_ALREADY_RUNNING');
 if(!journal){
  const counts=(await lock.query("SELECT (SELECT count(*)::int FROM app.users) users,(SELECT count(*)::int FROM app.users WHERE role_code='platform_admin' AND email=$1) initial_admins,(SELECT count(*)::int FROM app.universities) universities,(SELECT count(*)::int FROM app.projects) projects,(SELECT count(*)::int FROM app.storage_objects) objects",[installation.state.admin_email])).rows[0];
  if(counts.users!==1||counts.initial_admins!==1||counts.universities||counts.projects||counts.objects||!await emptyStorage(installation.runtime.PRIVATE_STORAGE_ROOT))throw Error('DEMO_REQUIRES_NEW_BLANK_INSTALL_NO_EXISTING_USER_DATA');
  try{if((await readdir(privateRoot)).length)throw Error('DEMO_UNJOURNALED_DIRECTORY_REFUSED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  journal={version:factoryVersion,owner:installation.state.owner,assetManifest,completed:[],ready:false};await savePrivate('journal.json',journal);
 }
 async function stage(name:string,run:()=>Promise<unknown>){if(journal!.completed.includes(name))return;await run();journal!.completed.push(name);await savePrivate('journal.json',journal);console.log('DEMO_STAGE_COMPLETED | '+name);if(process.env.CAPSTONE_INSTALL_TEST_STOP_AFTER_DEMO===name)throw Error('CONTROLLED_DEMO_INSTALL_INTERRUPTION');}
 await stage('identities',async()=>{const x=await demoContext();try{return await buildIdentities(x);}finally{await x.close();}});
 await stage('existing-core-projects',async()=>{const x=await demoContext();try{const{tenants}=await privateJson<any>('tenants.json',()=>{throw Error('DEMO_TENANTS_REQUIRED');});const records=await privateJson<Record<string,MadeProject>>('projects.json',()=>({}));for(const p of projectSpecs){records[p.id]=await buildProject(x,p,tenants);await savePrivate('projects.json',records);console.log('DEMO_PROJECT_COMPLETED | '+p.id);}return{core:50};}finally{await x.close();}});
 await stage('existing-external-assessments',async()=>completeExternal(await demoContext()));
 await stage('existing-workflow-examples',async()=>buildWorkflowExamples(await demoContext()));
 await stage('existing-partner-and-onboarding-examples',async()=>{
  const before=await verifyDatabase(installation.migration,installation.runtime.DATABASE_URL);
  await buildClosureExamples(await demoContext());
  const after=await verifyDatabase(installation.migration,installation.runtime.DATABASE_URL);
  if(before.normalizedDigest!==after.normalizedDigest)throw Error('DEMO_CORE_CHANGED_BY_WORKFLOW_EXTENSION');
 });
 await stage('retire-generated-outbound-intents',async()=>{
  const identities=await privateJson<Record<string,DemoIdentity>>('identities.json',()=>({}));const ids=Object.values(identities).filter(i=>i.key!=='platform'&&i.id).map(i=>i.id);
  const records={...await privateJson<Record<string,MadeProject>>('projects.json',()=>({})),...await privateJson<Record<string,MadeProject>>('scenarios.json',()=>({}))};const projects=Object.values(records).map(p=>p.project);
  await database(installation.migration,async c=>{await c.query('BEGIN');try{
   await c.query("UPDATE app.account_email_outbox SET state='expired',ciphertext=NULL,lease=NULL,lease_until=NULL,code='SYNTHETIC_INSTALL_FINISHED' WHERE user_id=ANY($1::uuid[]) AND state IN('queued','failed','unknown') AND ciphertext IS NOT NULL",[ids]);
   await c.query("UPDATE app.committee_mail_outbox SET state='expired',ciphertext=NULL,lease=NULL,lease_until=NULL,code='SYNTHETIC_INSTALL_FINISHED' WHERE invite_id IN(SELECT i.id FROM app.committee_invitations i JOIN app.evaluation_cases ec ON ec.id=i.case_id WHERE ec.project_id=ANY($1::uuid[])) AND state IN('queued','failed','unknown') AND ciphertext IS NOT NULL",[projects]);
   await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}});
 });
 const core=await verifyDatabase(installation.migration,installation.runtime.DATABASE_URL),closure=await verifyClosure(installation.migration,true);await savePrivate('verification.json',{core,closure,assets:{files:540,originalBytesUnchanged:true},generatedOnly:true,noPrivateReset:true});
 journal.ready=true;await savePrivate('journal.json',journal);console.log('DEMO_READY | Existing 50 showcase + 10 workflow projects; real service-generated assessments; private credentials in .local/demo/identities.json');
}finally{await lock.end();}
