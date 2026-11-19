import express from 'express';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {validateState} from '../web/core.js';
export function createApp({auth,repository,config,staticDir,rates}){
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');res.set('X-Frame-Options','DENY');if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store, private');next();});
 app.get('/api/health',(_req,res)=>res.json({status:'ok',version:'1.4.0',storage:'Neon Postgres'}));
 app.get('/api/rates',async(_req,res,next)=>{try{if(!rates)return res.status(503).json({error:'RATES_UNAVAILABLE'});res.json(await rates());}catch(e){next(e);}});
 // Auth owns the request body and performs its own CSRF/origin checks.
 app.all('/api/auth/{*path}',toNodeHandler(auth));
 app.use('/api',express.json({limit:'3mb',strict:true}));
 app.use('/api/vault',async(req,res,next)=>{try{
   if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
   if(req.method==='PUT'&&!config.trustedOrigins.includes(req.get('origin')))return res.status(403).json({error:'INVALID_ORIGIN'});
   const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
   if(!session)return res.status(401).json({error:'UNAUTHENTICATED'});
   req.userId=session.user.id;if(!await repository.allow(req.userId))return res.status(429).set('Retry-After','60').json({error:'RATE_LIMITED'});next();
 }catch(e){next(e);}});
 app.get('/api/vault',async(req,res,next)=>{try{res.json(await repository.get(req.userId));}catch(e){next(e);}});
 app.put('/api/vault',async(req,res,next)=>{try{const {state,revision}=req.body||{};if(!Number.isSafeInteger(revision)||revision<0||revision>=2147483647)return res.status(400).json({error:'INVALID_REVISION'});try{validateState(state);}catch{return res.status(400).json({error:'INVALID_STATE'});}const result=await repository.put(req.userId,state,revision);if(!result)return res.status(409).json({error:'VERSION_CONFLICT'});res.json(result);}catch(e){next(e);}});
 app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 if(staticDir)app.use(express.static(staticDir,{etag:false,maxAge:0}));
 app.use((err,_req,res,_next)=>{const status=err.type==='entity.too.large'?413:err instanceof SyntaxError?400:503;res.status(status).json({error:status===413?'PAYLOAD_TOO_LARGE':status===400?'INVALID_JSON':'SERVICE_UNAVAILABLE'});});
 return app;
}
