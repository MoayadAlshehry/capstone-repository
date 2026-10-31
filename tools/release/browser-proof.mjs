/** Actual Chromium UI checks in isolated profiles; no production/browser state. */
import{chromium}from'@playwright/test';import{readFile,writeFile,mkdir}from'node:fs/promises';import assert from'node:assert/strict';import{verifyOwned}from'../../scripts/verify-owned.mjs';
const{base,state}=await verifyOwned(),out='.local/release-browser';await mkdir(out,{recursive:true,mode:0o700});const browser=await chromium.launch({headless:true,chromiumSandbox:true});const cases=[];const hasDemo=state.completed.includes('DEMO');
try{
 for(const width of (process.argv.includes('--roles-only')?[]:[1280,360]))for(const theme of ['light','dark'])for(const locale of ['en','ar']){
  const label=`${locale}-${theme}-${width}`,context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],failed=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()});});page.on('request',r=>requests.push(new URL(r.url()).pathname));
  await page.addInitScript(({theme})=>localStorage.setItem('capstone.ui.theme.v1',theme),{theme});
  try{
   await page.goto(base+'/'+locale,{waitUntil:'domcontentloaded'});
   if(hasDemo)await page.getByRole('heading',{name:'WadiWatch: Flood-Aware Route Planning for Aseer',exact:true}).first().waitFor({state:'visible'});
   else await page.getByRole('heading',{level:1}).waitFor({state:'visible'});
   const notice=locale==='en'?'Sample projects, author identities and assessments are fictional. No university endorsement is implied.':'المشاريع وأسماء مؤلفيها والتقييمات المعروضة أمثلة افتراضية، ولا تعني اعتمادًا من الجامعات.';
   assert.equal(await page.getByText(notice,{exact:true}).count(),hasDemo?1:0);
   const height=await page.evaluate(()=>document.documentElement.scrollHeight);for(let y=0;y<height;y+=700)await page.mouse.wheel(0,700);await page.getByRole('heading',{level:1}).first().scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(locale=>{const e=document.querySelector('a[href="/'+locale+'"]'),r=e?.getBoundingClientRect();return{inner:innerWidth,scroll:document.documentElement.scrollWidth,dir:document.documentElement.dir,lang:document.documentElement.lang,theme:document.documentElement.dataset.theme,logo:r?{x:r.x,y:r.y,width:r.width}:null,resetDialog:!!document.getElementById('demo-reset-title')};},locale);
   assert.equal(geometry.theme,theme);assert.equal(geometry.dir,'ltr');assert.equal(geometry.lang,locale);assert(geometry.scroll<=geometry.inner+1,'Page overflow');assert(!geometry.resetDialog);assert(!requests.some(p=>p.startsWith('/__demo/status')),'Public Demo must not poll private reset');assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
   await page.screenshot({path:out+'/'+label+'.png',fullPage:true});
   if(hasDemo){await page.getByText(notice,{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-notice.png',fullPage:false});}
   cases.push({id:label,status:'PASS',geometry,console_errors:errors,failed_requests:failed,no_private_reset_requests:true,screenshot:label+'.png',...(hasDemo?{notice_screenshot:label+'-notice.png'}:{})});
  }catch(e){cases.push({id:label,status:'FAIL',reason:e.message,console_errors:errors,failed_requests:failed});}finally{await context.close();}
 }
 for(const width of [1280,360])for(const theme of ['light','dark']){const en=cases.find(c=>c.id===`en-${theme}-${width}`),ar=cases.find(c=>c.id===`ar-${theme}-${width}`);if(en?.status==='PASS'&&ar?.status==='PASS'){assert(en.geometry.logo&&ar.geometry.logo);assert(Math.abs(en.geometry.logo.x-ar.geometry.logo.x)<=2);assert(Math.abs(en.geometry.logo.width-ar.geometry.logo.width)<=2);}}
 if(hasDemo){
  const book=JSON.parse(await readFile('.local/demo/identities.json','utf8')),examples=JSON.parse(await readFile('.local/demo/scenarios.json','utf8')),admin=JSON.parse(await readFile('.local/accounts/bootstrap-admin.json','utf8'));const faculty=Object.keys(book).find(k=>book[k].id===examples.S04.supervisor);
  for(const [label,person,project]of [['student-lead',book['s01-author-1'],'AtlasDesk: Study Planning Workspace'],['supervisor',book[faculty],'DataBridge: Supervisor Assessment'],['partner',book['closure-partner-active'],null],['university-admin',book['admin-kku'],null],['platform-admin',admin,null]]){
   const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base+'/en/login',{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:/email/i}).fill(person.email);await page.getByLabel('Password',{exact:true}).fill(person.password);
    await Promise.all([page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000}),page.getByRole('button',{name:/^Sign in/}).click()]);await page.getByRole('main').waitFor({state:'visible'});
    let openedProject=false;
    if(project){const link=page.getByRole('link',{name:new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first();try{await link.waitFor({state:'visible',timeout:10000});await link.click();openedProject=true;}catch{}}
    await page.screenshot({path:out+'/'+label+'.png',fullPage:true});assert.deepEqual(errors,[]);cases.push({id:label,status:'PASS',actual_ui_login:true,opened_original_project:openedProject,path:new URL(page.url()).pathname,headings:await page.getByRole('heading').allTextContents(),console_errors:errors,screenshot:label+'.png',scope:'Role landing and linked project when present; service/permission workflows are recorded separately'});
   }catch(e){cases.push({id:label,status:'FAIL',reason:e.message.replaceAll(person.password,'[REDACTED]')});}finally{await context.close();}
  }
 }
}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({source_root_owned:true,chromium_sandbox:true,synthetic_only:true,profile:hasDemo?'EXISTING_DEMO':'CLEAN',cases},null,2),{mode:0o600});console.log(JSON.stringify({browser_cases:cases.length,pass:cases.filter(c=>c.status==='PASS').length,fail:cases.filter(c=>c.status!=='PASS').length}));if(cases.some(c=>c.status!=='PASS'))process.exitCode=1;
