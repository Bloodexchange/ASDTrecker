import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ratesConfig,fetchProvider} from '../server/rate-providers.mjs';

// The PowerShell launcher sends the hidden key over stdin, never in arguments or files.
const key = fs.readFileSync(0,'utf8').trim();
if (!key || key.length > 512 || /\s/.test(key)) throw Error('A valid API key is required on stdin.');
const config = ratesConfig({CURRENCYAPI_KEY:key,CURRENCYAPI_INTERVAL_SECONDS:process.argv[2]||'86400'});
const link=JSON.parse(fs.readFileSync('.vercel/project.json','utf8'));
if(link.projectId!=='prj_mMUI42v3VpjB7H4oy8Ww3C1PTIAV')throw Error('Wrong Vercel project. This script is for the original ASDTrecker.');
const cli=process.env.VERCEL_CLI_PATH||'C:/Users/Public/ASDTreckerTools/cloud-cli/node_modules/vercel/dist/vc.js';
function run(args,input){const r=spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});if(r.status!==0)throw Error('Vercel CLI failed. Check login and the linked project; no secret was printed.');return r.stdout;}
run(['project','inspect','--non-interactive']);
await fetchProvider(config); // Invalid keys fail before changing the deployed configuration.
run(['env','add','CURRENCYAPI_KEY','--environment','production','--type','secret','--force','--yes'],key);
run(['env','add','CURRENCYAPI_INTERVAL_SECONDS','--environment','production','--type','config','--force','--yes'],String(config.interval));
console.log('CurrencyAPI verified; production secret and interval configured. Deploying ASDTrecker...');
const output=run(['deploy','--prod','--yes']);
console.log(output.replaceAll(key,'[redacted]'));
console.log('Done. Open Courses in the app and check the actual quote time.');
