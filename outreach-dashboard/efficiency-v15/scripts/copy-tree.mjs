import fs from 'node:fs';
import path from 'node:path';
// Portable copy without Node's native recursive cp path (Windows crash observed).
// Do not follow links or silently skip unsupported artifacts.
export function copyTree(source,destination){
 const stat=fs.lstatSync(source);
 if(stat.isSymbolicLink())throw Error('Build refuses symbolic link: '+source);
 if(stat.isDirectory()){
  fs.mkdirSync(destination,{recursive:true});
  for(const name of fs.readdirSync(source))copyTree(path.join(source,name),path.join(destination,name));
 }else if(stat.isFile()){
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);
 }else throw Error('Unsupported build artifact: '+source);
}
