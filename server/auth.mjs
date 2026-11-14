import {betterAuth} from 'better-auth';
export function createAuth(database,config){return betterAuth({
 appName:'ASDTrecker',baseURL:config.origin,basePath:'/api/auth',secret:config.secret,database,
 trustedOrigins:config.trustedOrigins,
 emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:true,requireEmailVerification:false},
 session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
 rateLimit:{enabled:true,storage:'database',window:60,max:60,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:3}}},
 advanced:{useSecureCookies:config.secure,cookiePrefix:'asdtrecker',defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:config.secure},ipAddress:{ipAddressHeaders:['x-vercel-forwarded-for','x-forwarded-for']}},
 logger:{level:'error'}
});}
