import {getMigrations} from 'better-auth/db/migration';import {runtime} from '../server/runtime.mjs';import {financeSchema} from '../server/vault.mjs';
import {ratesSchema} from '../server/rates.mjs';
const {auth,pool}=runtime();try{const migration=await getMigrations(auth.options);await migration.runMigrations();await pool.query(financeSchema);await pool.query(ratesSchema);console.log('Migration complete: auth, sessions, rate limits, encrypted financial vaults, public exchange snapshots.');}finally{await pool.end();}
