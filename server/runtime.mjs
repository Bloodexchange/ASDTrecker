import {Pool} from 'pg';
import {readConfig} from './config.mjs';
import {createAuth} from './auth.mjs';
import {createVaultRepository} from './vault.mjs';
import {createApp} from './app.mjs';
import {createRatesService} from './rates.mjs';
let instance;
export function runtime(staticDir){if(instance)return instance;const config=readConfig();const dbUrl=new URL(config.databaseUrl);dbUrl.searchParams.set('sslmode','verify-full');const pool=new Pool({connectionString:dbUrl.toString(),max:3,idleTimeoutMillis:15000,connectionTimeoutMillis:12000,allowExitOnIdle:true});pool.on('error',()=>{});const auth=createAuth(pool,config);instance={app:createApp({auth,repository:createVaultRepository(pool,config.encryptionKey),config,staticDir,rates:createRatesService(pool)}),auth,pool};return instance;}
