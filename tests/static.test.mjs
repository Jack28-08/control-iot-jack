import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('frontend keeps credentials in memory without persistent storage',()=>{
 const files=['../index.html','../js/config.js','../js/api.js','../js/main.js','../js/ui.js'];
 for(const file of files){
  assert.doesNotMatch(read(file), /(?:localStorage|sessionStorage|indexedDB|document\.cookie)/);
  assert.doesNotMatch(read(file), /(?:X-API-Key|api[_-]?key)["']?\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i);
 }
});
test('relative assets usable from GitHub Pages subdirectory',()=>{
 const html=read('../index.html');
 for(const relative of ['./assets/favicon.svg','./css/styles.css','./js/main.js']) assert.ok(html.includes(relative));
});
test('footer includes exact required credits',()=>assert.match(read('../index.html'),/Desarrollado por José Héctor Rosales Cabrera · 2026/));
test('no direct database connection or invented GET movement',()=>{
 const api=read('../js/api.js');
 assert.doesNotMatch(api,/mysql:\/\/|rds\.amazonaws\.com/i);
 assert.match(api,/method:'POST'/);
});
