import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { progressFiles, latestDate } from '../server/progress.mjs';
import { copyTree } from './copy-tree.mjs';
const root=process.cwd();
for(const p of ['dist/client','dist/server','dist/.openai']) fs.mkdirSync(path.join(root,p),{recursive:true});
copyTree(path.join(root,'web'),path.join(root,'dist/client'));
fs.copyFileSync(path.join(root,'web/outreach-dashboard.html'),path.join(root,'dist/client/index.html'));
fs.copyFileSync(path.join(root,'server/worker.mjs'),path.join(root,'dist/server/index.js'));
for(const file of ['state-merge.mjs','progress.mjs','model-router.mjs'])fs.copyFileSync(path.join(root,'server',file),path.join(root,'dist/server',file));
const baseline={};
for(const [file,global] of Object.entries(progressFiles)){
 const filename=path.join(root,'web',file);if(!fs.existsSync(filename))continue;
 const source=fs.readFileSync(filename,'utf8');
 const match=source.match(new RegExp('^\\s*window\\.'+global+'\\s*=\\s*([\\s\\S]*?)\\s*;?\\s*$'));
 if(!match)continue;
 try{const data=JSON.parse(match[1]);const compact=JSON.stringify(data);baseline[file]={hash:crypto.createHash('sha256').update(compact).digest('hex'),date:latestDate(data),source:'baseline'};
 fs.writeFileSync(path.join(root,'dist/client',file),'window.'+global+'='+compact+';');
 }catch{}
}
fs.writeFileSync(path.join(root,'dist/client/progress-baseline.json'),JSON.stringify(baseline));
fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
copyTree(path.join(root,'drizzle'),path.join(root,'dist/.openai/drizzle'));
console.log('Built existing dashboard with private state API.');
