import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.cpSync(path.join(root,'web'),path.join(root,'dist'),{recursive:true});console.log('Static frontend ready in dist/. No server secrets included.');
