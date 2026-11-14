export function readConfig(env=process.env){
 const url=env.BETTER_AUTH_URL;
 if(!env.DATABASE_URL||!env.BETTER_AUTH_SECRET||!env.DATA_ENCRYPTION_KEY||!url)throw new Error('SERVER_NOT_CONFIGURED');
 if(env.BETTER_AUTH_SECRET.length<32||!/^[a-f0-9]{64}$/i.test(env.DATA_ENCRYPTION_KEY))throw new Error('SERVER_NOT_CONFIGURED');
 const origin=new URL(url).origin;
 if(new URL(origin).protocol!=='https:'&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw new Error('INVALID_AUTH_ORIGIN');
 return {databaseUrl:env.DATABASE_URL,secret:env.BETTER_AUTH_SECRET,encryptionKey:env.DATA_ENCRYPTION_KEY,origin,secure:origin.startsWith('https:'),trustedOrigins:[origin,'https://appassets.androidplatform.net']};
}
