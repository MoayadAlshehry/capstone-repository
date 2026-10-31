/** Only the installer-owned loopback synthetic SMTP sink. */
export function demoMailpitApi(port:number){if(!Number.isInteger(port)||port<1024||port>65535)throw Error('DEMO_MAILPIT_PORT');return 'http://127.0.0.1:'+port;}
export function capturedCommitteeLink(text:string,origin:string){
 const candidates=text.match(/https?:\/\/[^\s<>]+/g)??[];
 for(const raw of candidates){try{const u=new URL(raw);if(u.origin===origin&&/^\/en\/committee\//.test(u.pathname)&&u.hash.startsWith('#token='))return u;}catch{}}
 throw Error('LOCAL_COMMITTEE_LINK_REQUIRED');
}
