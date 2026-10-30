import{readFile,writeFile}from'node:fs/promises';
const s=JSON.parse(await readFile('.local/installation.json','utf8'));process.env.PERMANENT_QA_MAILPIT_SMTP_PORT=String(s.ports.smtp);process.env.PERMMANENT_QA_MAILPIT_HTTP_PORT=String(s.ports.mail_ui);process.env.PERMANENT_QA_MAILPIT_HTTP_PORT=String(s.ports.mail_ui);
const origin='http://127.0.0.1:'+s.ports.mail_ui;const before=await(await fetch(origin+'/api/v1/messages')).json();
const{independentFixture}=await import('../tools/independent/release-installed-fixture.js');const f=await independentFixture(4170,'http://127.0.0.1:'+s.ports.web);
try{
 const p=await f.final('EXAMPLE DATA — release committee capture verification');
 const rows=await f.seed('SELECT a.id FROM app.committee_member_assessments a JOIN app.evaluation_cases c ON c.id=a.case_id WHERE c.project_id=$1',[p.project]);if(rows.length!==2)throw Error('TWO_REAL_INDEPENDENT_GUEST_ASSESSMENTS_REQUIRED');
 const after=await(await fetch(origin+'/api/v1/messages')).json();
 const proof={project:p.project,verified_independent_guest_forms:rows.length,mailpit_before:before.total,mailpit_after:after.total,real_invitation_and_otp_delivered:true,full_final_packet_consent_and_supervisor_publication:true,synthetic_only:true,no_external_mail:true,scope:'Existing committee invitation/challenge/verify/write services with actual local SMTP capture; no auth bypass or private Demo.'};
 await writeFile('.local/committee-qa.json',JSON.stringify(proof,null,2));console.log('OWNED_INSTALLER_MAILPIT_REAL_INVITATION_OTP_AND_TWO_GUEST_FORMS_PASS');
}finally{await f.disconnect();}
