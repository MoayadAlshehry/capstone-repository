import {readFile}from'node:fs/promises';
const root=process.cwd(),state=JSON.parse(await readFile('.local/installation.json','utf8')),role=process.argv[2];if(state.root!==root||!['web','upload','worker'].includes(role))throw Error('INVALID_OWNED_LAUNCH');
Object.assign(process.env,JSON.parse(await readFile('.local/runtime.json','utf8')));for(const key of ['FFMPEG_BIN','FFMPEG_BINARY_RELEASE','FFMPEG_BINARIES_URL'])delete process.env[key];process.env.BIND_HOST='127.0.0.1';process.env.SERVICE_PORT=String(state.ports[role]);
if(role==='web'){process.env.PORT=String(state.ports.web);process.argv=[process.execPath,root+'/apps/web/server.mjs','--port',String(state.ports.web)];await import(root+'/apps/web/server.mjs');}else await import(root+'/apps/'+role+'/dist/main.js');
