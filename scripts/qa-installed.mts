import {semesterFixture} from '../tools/semester/release-installed-fixture.js';import{readFile,writeFile}from'node:fs/promises';import{randomUUID,createHash}from'node:crypto';
const state=JSON.parse(await readFile('.local/installation.json','utf8')),base='http://127.0.0.1:'+state.ports.web;
const f=await semesterFixture(4060,base),observations=[];
try{
 const s=await f.semester.state(f.lead.actor,f.made.id),bytes=Buffer.from('Stage6 entirely synthetic original.\n');
 const headers={Origin:base,Cookie:f.lead.cookie,'Tus-Resumable':'1.0.0'};
 const metadata={project:f.made.id,version:s.project.version,path:'evidence/stage6.txt',fingerprint:'stage6-'+randomUUID(),correlation:randomUUID()};
 const made=await fetch(base+'/files/tus',{method:'POST',headers:{...headers,'Upload-Length':String(bytes.length),'Upload-Metadata':Object.entries(metadata).map(([k,v])=>k+' '+Buffer.from(v).toString('base64')).join(',')}});
 observations.push({test:'web proxy genuine tus creation',status:made.status,expected:201});if(made.status!==201)throw Error('TUS_CREATE_FAILED');
 const location=new URL(made.headers.get('Location')!,base);if(!['127.0.0.1','localhost'].includes(location.hostname))throw Error('NONLOCAL_UPLOAD_LOCATION');
 const uploaded=await fetch(location,{method:'PATCH',headers:{...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':'0'},body:bytes});observations.push({test:'native resumable PATCH',status:uploaded.status,expected:204});if(uploaded.status!==204)throw Error('TUS_PATCH_FAILED');
 let files=[];for(let i=0;i<50;i++){const list=await fetch(base+'/api/native-files?'+new URLSearchParams({project:f.made.id,version:s.project.version}),{headers:{Cookie:f.lead.cookie}});const data=await list.json();files=data.files??[];if(files.length)break;await new Promise(r=>setTimeout(r,100));}
 if(files.length!==1)throw Error('FINALIZED_ORIGINAL_REQUIRED');const file=files[0];const path='/api/native-files?'+new URLSearchParams({project:f.made.id,version:s.project.version,file:file.id,mode:'original'});
 for(const [label,cookie,expected]of [['own author',f.author.cookie,200],['anonymous','',404]]as const){const response=await fetch(base+path,{headers:{Cookie:cookie}});observations.push({test:label+' original',status:response.status,expected});if(response.status!==expected)throw Error('ORIGINAL_PERMISSION_FAILED');if(expected===200&&createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw Error('ORIGINAL_HASH_MISMATCH');}
 const pub=await fetch(base+'/api/public-files?'+new URLSearchParams({project:f.made.id,version:s.project.version,file:file.id,mode:'original'}));observations.push({test:'public cannot read private project original',status:pub.status,expected:404});if(pub.status!==404)throw Error('PUBLIC_PRIVATE_ORIGINAL_EXPOSURE');
 const ai=await fetch(base+'/api/ai');observations.push({test:'AI off truthful endpoint',status:ai.status,expected:404});if(ai.status!==404)throw Error('AI_OFF_FAILED');
 await writeFile('.local/qa-private-record.json',JSON.stringify({project:f.made.id,version:s.project.version,file:file.id,authorCookie:f.author.cookie,leadCookie:f.lead.cookie,bytes_sha256:createHash('sha256').update(bytes).digest('hex'),path}),{mode:0o600});
 await writeFile('.local/qa-observations.json',JSON.stringify(observations,null,2));console.log('INSTALLED_APPLICATION_ORIGINAL_PERMISSIONS_AND_PROXY_VERIFIED');
}finally{await f.disconnect();}
