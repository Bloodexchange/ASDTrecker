import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {validateState} from '../web/core.js';
export function protectState(state,userId,master){
 validateState(state);const key=createHmac('sha256',Buffer.from(master,'hex')).update('ASDTrecker:user:'+userId).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(state),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')});
}
export function revealState(text,userId,master){const b=JSON.parse(text);if(b.v!==1)throw Error('INVALID_VAULT');const key=createHmac('sha256',Buffer.from(master,'hex')).update('ASDTrecker:user:'+userId).digest(),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(b.iv,'base64'));decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(Buffer.from(b.tag,'base64'));return validateState(JSON.parse(Buffer.concat([decipher.update(Buffer.from(b.data,'base64')),decipher.final()]).toString('utf8')));}
export const financeSchema=`
CREATE TABLE IF NOT EXISTS finance_vault (
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 ciphertext TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_rate_limit (
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 window_start BIGINT NOT NULL,
 requests INTEGER NOT NULL
);`;
export function createVaultRepository(pool,master){return {
 async get(userId){const {rows}=await pool.query('SELECT ciphertext, revision, updated_at FROM finance_vault WHERE user_id = $1',[userId]);if(!rows[0])return {state:null,revision:0};return {state:revealState(rows[0].ciphertext,userId,master),revision:rows[0].revision,updatedAt:rows[0].updated_at};},
 async put(userId,state,revision){const encrypted=protectState(state,userId,master);const result=revision===0?await pool.query('INSERT INTO finance_vault (user_id,ciphertext,revision) VALUES ($1,$2,1) ON CONFLICT (user_id) DO NOTHING RETURNING revision, updated_at',[userId,encrypted]):await pool.query('UPDATE finance_vault SET ciphertext=$2,revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$3 RETURNING revision,updated_at',[userId,encrypted,revision]);return result.rows[0]?{revision:result.rows[0].revision,updatedAt:result.rows[0].updated_at}:null;},
 async allow(userId){const bucket=Math.floor(Date.now()/60000);const {rows}=await pool.query(`INSERT INTO finance_rate_limit(user_id,window_start,requests) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET window_start=$2,requests=CASE WHEN finance_rate_limit.window_start=$2 THEN finance_rate_limit.requests+1 ELSE 1 END RETURNING requests`,[userId,bucket]);return rows[0].requests<=60;}
};}
