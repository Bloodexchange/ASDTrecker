import {runtime} from '../server/runtime.mjs';
export default function handler(req,res){try{return runtime().app(req,res);}catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'SERVER_NOT_CONFIGURED'}));}}
