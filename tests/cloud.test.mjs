import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {freshState} from '../web/core.js';import {protectState,revealState} from '../server/vault.mjs';
const master=crypto.randomBytes(32).toString('hex');
test('server-side vault encryption binds ciphertext to owner',()=>{const s=freshState();const text=protectState(s,'owner-a',master);assert.ok(!text.includes('Наличные'));assert.deepEqual(revealState(text,'owner-a',master),s);assert.throws(()=>revealState(text,'owner-b',master));assert.throws(()=>revealState(text,'owner-a',crypto.randomBytes(32).toString('hex')));});
test('real Neon: signup, sessions, isolation, revision conflict, CSRF and logout',{timeout:180000,skip:!process.env.DATABASE_URL},async()=>{
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4179';const u=new URL(process.env.DATABASE_URL);u.searchParams.set('sslmode','verify-full');const pool=new Pool({connectionString:u.toString(),max:1});const users=[];
 const id=crypto.randomUUID().slice(0,8),password=crypto.randomBytes(24).toString('base64url');
 const a={cookie:'',ip:'198.51.100.41'},b={cookie:'',ip:'198.51.100.42'};
 async function call(client,path,method='GET',body,origin=base){const r=await fetch(base+path,{method,headers:{Origin:origin,'x-forwarded-for':client?.ip||'198.51.100.43',...(client?.cookie?{Cookie:client.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const c of r.headers.getSetCookie())if(c.split(';')[0].includes('session_token='))client.cookie=c.split(';')[0];const json=await r.json();return{status:r.status,json};}
 try{
  for(const [client,suffix]of[[a,'a'],[b,'b']]){const r=await call(client,'/api/auth/sign-up/email','POST',{name:'ASDTrecker QA '+suffix,email:`qa-${id}-${suffix}@example.invalid`,password});assert.equal(r.status,200,JSON.stringify(r.json));assert.ok(r.json.user.id);users.push(r.json.user.id);assert.ok(client.cookie);}
  assert.equal((await call(null,'/api/vault')).status,401);
  const sa=freshState();sa.accounts[0].name='Private A '+id;
  let r=await call(a,'/api/vault','PUT',{state:sa,revision:0,userId:users[1]});assert.equal(r.status,200);assert.equal(r.json.revision,1);
  assert.equal((await call(b,'/api/vault')).json.state,null);
  assert.equal((await call(a,'/api/vault')).json.state.accounts[0].name,'Private A '+id);
  assert.equal((await call(a,'/api/vault','PUT',{state:sa,revision:0})).status,409);
  assert.equal((await call(a,'/api/vault','PUT',{state:sa,revision:1},'https://attacker.example')).status,403);
  assert.equal((await call(a,'/api/vault','PUT',{state:{version:1},revision:1})).status,400);
  const row=(await pool.query('SELECT ciphertext FROM finance_vault WHERE user_id=$1',[users[0]])).rows[0];assert.ok(!row.ciphertext.includes('Private A'));
  const newPassword=crypto.randomBytes(24).toString('base64url');r=await call(a,'/api/auth/change-password','POST',{currentPassword:password,newPassword,revokeOtherSessions:true});assert.equal(r.status,200,JSON.stringify(r.json));
  assert.equal((await call(a,'/api/auth/sign-out','POST',{})).status,200);assert.equal((await call(a,'/api/vault')).status,401);
  r=await call(a,'/api/auth/sign-in/email','POST',{email:`qa-${id}-a@example.invalid`,password:newPassword});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal((await call(a,'/api/vault')).json.revision,1);
 }finally{for(const user of users)await pool.query('DELETE FROM "user" WHERE id=$1',[user]);await pool.end();}
});
