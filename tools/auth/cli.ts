import {localSecret,bootstrapAdmin} from './local.js';
const action=process.argv[2];
if(action==='setup'){await localSecret();console.log('Private local auth secret ready');}
else if(action==='bootstrap'){const i=process.argv.indexOf('--email');if(i<0)throw Error('Explicit admin email required');await bootstrapAdmin(process.argv[i+1]!);console.log('Private initial administrator registry ready');}
else throw Error('Only setup/bootstrap supported; no private review/reset commands');
