import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),vc=process.env.VERCEL_CLI_PATH||'C:/Users/Public/ASDTreckerTools/cloud-cli/node_modules/vercel/dist/vc.js';
const configDir=path.join(root,'.cloud');fs.mkdirSync(configDir,{recursive:true});const secretPath=path.join(configDir,'server-secrets.json');
const linkage=JSON.parse(fs.readFileSync(path.join(root,'.vercel/project.json'),'utf8'));if(linkage.projectName!=='asdtrecker')throw Error('Verify the intended ASDTrecker project before configuring secrets.');
if(!fs.existsSync(secretPath)){const check=spawnSync(process.execPath,[vc,'api',`/v9/projects/${linkage.projectId}/env`],{cwd:root,encoding:'utf8'});if(check.status!==0)throw Error('Could not verify existing server configuration; refusing to rotate keys.');const existing=JSON.parse(check.stdout);if((existing.envs||[]).some(e=>['DATA_ENCRYPTION_KEY','BETTER_AUTH_SECRET'].includes(e.key)))throw Error('Server keys already exist. Restore the original local secret backup; do not generate replacements for an existing vault.');}
const values=fs.existsSync(secretPath)?JSON.parse(fs.readFileSync(secretPath,'utf8')):{BETTER_AUTH_SECRET:crypto.randomBytes(48).toString('base64url'),DATA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(secretPath,JSON.stringify(values));
values.BETTER_AUTH_URL='https://asdtrecker.vercel.app';
for(const [key,value] of Object.entries(values))for(const target of ['production','development']){
 const args=[vc,'env','add',key,'--environment',target,'--type',key==='BETTER_AUTH_URL'||target==='development'?'config':'secret','--force','--yes'];const r=spawnSync(process.execPath,args,{cwd:root,input:value,encoding:'utf8'});if(r.status!==0){console.error('Could not set '+key+' for '+target);process.exit(1);}console.log('Configured '+key+' for '+target);
}
const r=spawnSync(process.execPath,[vc,'env','pull','.env.local','--yes'],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(1);
fs.writeFileSync(path.join(configDir,'public.json'),JSON.stringify({origin:values.BETTER_AUTH_URL}));
console.log('Server configuration ready. No secret values were printed.');
