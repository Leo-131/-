import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {copyTree} from '../scripts/copy-tree.mjs';
test('portable build copy preserves nested binary data and updates existing output',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outreach-copy-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const src=path.join(dir,'source'),dst=path.join(dir,'output');
 fs.mkdirSync(path.join(src,'nested'),{recursive:true});
 fs.writeFileSync(path.join(src,'nested','asset.bin'),Buffer.from([0,255,1]));
 copyTree(src,dst);assert.deepEqual(fs.readFileSync(path.join(dst,'nested','asset.bin')),Buffer.from([0,255,1]));
 fs.writeFileSync(path.join(src,'nested','asset.bin'),'updated');copyTree(src,dst);
 assert.equal(fs.readFileSync(path.join(dst,'nested','asset.bin'),'utf8'),'updated');
 assert.throws(()=>copyTree(path.join(dir,'missing'),dst),/ENOENT/);
});
