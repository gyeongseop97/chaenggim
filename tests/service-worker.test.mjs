import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('push icons, links, cache cleanup and window reuse remain inside the GitHub project scope', async()=>{
  const scope='https://example.github.io/chaenggim/';
  const handlers={},shown=[],opened=[],deleted=[];
  const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,...options})},addEventListener:(name,handler)=>{handlers[name]=handler;},clients:{claim:async()=>{},matchAll:async()=>[{url:'https://example.github.io/another-app/',focus(){throw Error('Wrong app window');}}],openWindow:async url=>opened.push(url)}};
  const prefix='chaenggim-shell-'+encodeURIComponent('/chaenggim/')+'-';
  const caches={keys:async()=>[prefix+'old',prefix+'github-export-v1','chaenggim-shell-%2Fanother-app%2F-old'],delete:async name=>deleted.push(name)};
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,caches,URL,console});
  async function dispatch(name,extra={}){let pending;handlers[name]({...extra,waitUntil(promise){pending=promise;}});await pending;}
  await dispatch('activate');assert.deepEqual(deleted,[prefix+'old']);
  await dispatch('push',{data:{json:()=>({title:'챙김',body:'예시',url:'https://malicious.invalid/'})}});
  assert.equal(shown[0].icon,scope+'assets/icons/icon-192.png');
  assert.equal(shown[0].badge,scope+'assets/icons/favicon-32.png');
  assert.equal(shown[0].data.url,scope);
  await dispatch('notificationclick',{notification:{close(){},data:{url:'https://example.github.io/another-app/'}}});
  assert.deepEqual(opened,[scope]);
});
