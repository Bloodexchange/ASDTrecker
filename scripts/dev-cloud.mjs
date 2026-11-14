import {runtime} from '../server/runtime.mjs';import path from 'node:path';
const port=Number(process.env.PORT||4179);const {app}=runtime(path.resolve(import.meta.dirname,'../web'));app.listen(port,'127.0.0.1',()=>console.log(`ASDTrecker account server: http://127.0.0.1:${port}`));
