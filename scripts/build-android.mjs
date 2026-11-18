import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const sourceRoot=path.resolve(import.meta.dirname,'..'),tools=process.env.ASD_TOOLS||'C:/Users/Public/ASDTreckerTools';
// aapt2 on Windows cannot reliably open Unicode paths. Stage only our own sources under ASCII.
const root=path.join(tools,'build-workspace');fs.mkdirSync(root,{recursive:true});
fs.cpSync(path.join(sourceRoot,'android/app/src'),path.join(root,'android/app/src'),{recursive:true});
fs.cpSync(path.join(sourceRoot,'web'),path.join(root,'web'),{recursive:true});
const sdk=process.env.ANDROID_HOME||path.join(tools,'sdk');const java=process.env.JAVA_HOME||path.join(tools,'java',fs.readdirSync(path.join(tools,'java')).find(n=>n.startsWith('jdk-')));
const bin=path.join(sdk,'build-tools/35.0.0'),platform=path.join(sdk,'platforms/android-35/android.jar'),out=path.join(root,'android/build'),main=path.join(root,'android/app/src/main');
for(const name of ['gen','classes','dex'])fs.mkdirSync(path.join(out,name),{recursive:true});fs.mkdirSync(path.join(root,'releases'),{recursive:true});
const env={...process.env,JAVA_HOME:java,PATH:path.join(java,'bin')+path.delimiter+process.env.PATH};
function run(exe,args,opts={}){console.log(path.basename(exe),args.filter(x=>!String(x).includes('pass:')).join(' '));const r=spawnSync(exe,args,{cwd:root,env,stdio:'inherit',...opts});if(r.status!==0)throw Error(`${path.basename(exe)} failed: ${r.status} ${r.error||''}`);}
const j=(name,args)=>run(path.join(java,'bin',name+'.exe'),args);
run(path.join(bin,'aapt2.exe'),['compile','--dir',path.join(main,'res'),'-o',path.join(out,'resources.zip')]);
run(path.join(bin,'aapt2.exe'),['link','-o',path.join(out,'unsigned.apk'),'-I',platform,'--manifest',path.join(main,'AndroidManifest.xml'),'--java',path.join(out,'gen'),'-A',path.join(root,'web'),'--min-sdk-version','26','--target-sdk-version','35',path.join(out,'resources.zip')]);
const javaFiles=[path.join(main,'java/com/asdtrecker/app/ReminderService.java'),path.join(main,'java/com/asdtrecker/app/MainActivity.java'),path.join(out,'gen/com/asdtrecker/app/R.java')];
j('javac',['-encoding','UTF-8','--release','8','-classpath',platform,'-d',path.join(out,'classes'),...javaFiles]);
j('jar',['cf',path.join(out,'classes.jar'),'-C',path.join(out,'classes'),'.']);
j('java',['-cp',path.join(bin,'lib/d8.jar'),'com.android.tools.r8.D8','--min-api','26','--lib',platform,'--output',path.join(out,'dex'),path.join(out,'classes.jar')]);
j('jar',['uf',path.join(out,'unsigned.apk'),'-C',path.join(out,'dex'),'classes.dex']);
run(path.join(bin,'zipalign.exe'),['-f','-p','4',path.join(out,'unsigned.apk'),path.join(out,'aligned.apk')]);
// The private release key stays outside the source and APK. Keep this directory for future updates.
const signing=path.join(process.env.LOCALAPPDATA||tools,'ASDTreckerSigning');fs.mkdirSync(signing,{recursive:true});
const ks=path.join(signing,'release.jks'),secret=path.join(signing,'password.txt');
if(!fs.existsSync(ks)){if(!fs.existsSync(secret))fs.writeFileSync(secret,crypto.randomBytes(32).toString('base64url'));env.ASD_SIGN_PASS=fs.readFileSync(secret,'utf8').trim();j('keytool',['-genkeypair','-keystore',ks,'-alias','asdtrecker','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=ASDTrecker, OU=Personal, O=ASDTrecker, C=UZ','-storepass:env','ASD_SIGN_PASS','-keypass:env','ASD_SIGN_PASS']);}
env.ASD_SIGN_PASS=fs.readFileSync(secret,'utf8').trim();
const version=JSON.parse(fs.readFileSync(path.join(sourceRoot,'package.json'),'utf8')).version;
const apk=path.join(root,`releases/ASDTrecker-${version}.apk`);
j('java',['-jar',path.join(bin,'lib/apksigner.jar'),'sign','--ks',ks,'--ks-key-alias','asdtrecker','--ks-pass','env:ASD_SIGN_PASS','--key-pass','env:ASD_SIGN_PASS','--out',apk,path.join(out,'aligned.apk')]);
j('java',['-jar',path.join(bin,'lib/apksigner.jar'),'verify','--verbose','--print-certs',apk]);
run(path.join(bin,'aapt2.exe'),['dump','badging',apk]);
fs.writeFileSync(apk+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex')+'  '+path.basename(apk)+'\n');
fs.mkdirSync(path.join(sourceRoot,'releases'),{recursive:true});for(const file of [apk,apk+'.sha256'])fs.copyFileSync(file,path.join(sourceRoot,'releases',path.basename(file)));console.log('APK ready:',path.join(sourceRoot,'releases',path.basename(apk)));
