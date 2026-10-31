/** Test-only owned loopback fault boundary. Never installed as an app service. */
import{createServer}from'node:http';import{readFile,writeFile}from'node:fs/promises';import{Readable}from'node:stream';import{pipeline}from'node:stream/promises';import{isIP}from'node:net';
if(process.env.CAPSTONE_RELEASE_MODEL_FAILURE_TEST!=='1')throw Error('EXPLICIT_LOCAL_FAILURE_TEST_REQUIRED');
const root=process.cwd(),state=JSON.parse(await readFile('.local/installation.json','utf8')),runtime=JSON.parse(await readFile('.local/runtime.json','utf8'));if(state.root!==root||runtime.APP_ENV!=='local')throw Error('OWNED_LOCAL_SOURCE_REQUIRED');
const upstream=new URL(runtime.CAPSTONE_AI_BASE_URL);if(upstream.protocol!=='http:'||upstream.pathname!=='/'||upstream.search||upstream.username||upstream.password||!isIP(upstream.hostname)||!/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(upstream.hostname))throw Error('EXISTING_PRIVATE_MODEL_ENDPOINT_REQUIRED');
const token=(await readFile(runtime.CAPSTONE_AI_TOKEN_FILE,'utf8')).trim(),mode='.local/model-harness-mode.json',proof='.local/model-harness-proof.json';let forwarded=0,blocked=0;
await writeFile(mode,JSON.stringify({fail:false}),{mode:0o600});
const server=createServer(async(req,res)=>{const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 try{
  if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end('{}');return;}
  const allowed=req.method==='GET'&&req.url==='/v1/models'||req.method==='POST'&&['/v1/embeddings','/v1/chat/completions','/api/v1/chat'].includes(req.url);if(!allowed){res.writeHead(404);res.end('{}');return;}
  const{fail}=JSON.parse(await readFile(mode,'utf8'));if(fail&&req.method==='POST'){blocked++;await save();res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"OWNED_SYNTHETIC_FAILURE"}');return;}
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>256000){res.writeHead(413);res.end('{}');return;}chunks.push(chunk);}
  forwarded++;await save();const r=await fetch(new URL(req.url,upstream),{method:req.method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}),signal:controller.signal});res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')??'application/json'});if(r.body)await pipeline(Readable.fromWeb(r.body),res);else res.end();
 }catch{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end();}
});
async function save(){await writeFile(proof,JSON.stringify({forwarded_correctly_authenticated_positive_requests:forwarded,synthetic_failures_stopped_locally:blocked,request_bodies_tokens_and_model_reasoning_logged:false,production_model_configuration_changed:false}),{mode:0o600});}
server.listen(0,'127.0.0.1',async()=>{const address=server.address();await save();await writeFile('.local/model-harness.json',JSON.stringify({pid:process.pid,start:(await readFile('/proc/self/stat','utf8')).split(' ')[21],root,port:address.port,bind:address.address,owner:state.owner}),{mode:0o600});console.log('OWNED_LOOPBACK_MODEL_FAILURE_HARNESS_READY');});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
