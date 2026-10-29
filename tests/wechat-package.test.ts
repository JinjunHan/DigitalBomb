import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, openSync, ftruncateSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const MiB=1024*1024;
function check(main:number,resources:number){
 const dir=mkdtempSync(join(tmpdir(),'bomb-package-'));
 try {
  mkdirSync(join(dir,'resources'));
  writeFileSync(join(dir,'game.json'),JSON.stringify({subpackages:[{name:'resources',root:'resources'}]}));
  for(const [file,size]of [['main.bin',main],['resources/data.bin',resources]] as const){const fd=openSync(join(dir,file),'w');ftruncateSync(fd,size);closeSync(fd);}
  return spawnSync(process.execPath,[resolve('scripts/check-wechat-size.mjs'),'--root',dir],{encoding:'utf8'});
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('package guard accepts a small main package and total with device-debug headroom',()=>{const r=check(2*MiB,25*MiB);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/total:/);});
test('package guard counts subpackages toward the 30 MiB device-debug ceiling',()=>{const r=check(2*MiB,29*MiB);assert.notEqual(r.status,0);assert.match(r.stderr,/30 MiB device-debug limit/);});
test('package guard rejects builds that consume the 2 MiB safety margin',()=>{const r=check(2*MiB,27*MiB);assert.notEqual(r.status,0);assert.match(r.stderr,/28 MiB budget/);});
test('package guard still enforces the independent 4 MiB main-package ceiling',()=>{const r=check(5*MiB,MiB);assert.notEqual(r.status,0);assert.match(r.stderr,/main package exceeds 4 MB/);});
