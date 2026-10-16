/* Cache the app shell only. Location and weather API responses stay on the network. */
const APP_ROOT = new URL('./',self.registration.scope);
const CACHE_PREFIX = 'chaenggim-shell-'+encodeURIComponent(APP_ROOT.pathname)+'-';
const CACHE = CACHE_PREFIX+'github-export-v1';
const SHELL = [
  './app-config.js',
  './', './index.html', './weather-live.js', './weather-live.css', './weather-glass.css', './weather-optics.js', './weather-optics.css', './weather-card.js', './weather-card.css', './weather-layout.css', './weather-navigation.css', './weather-navigation.js', './weather-air.css',
  './weather-chart.js', './weather-chart.css',
  './weather-advice.js', './weather-solar.js', './weather-personal.css', './weather-notifications.js', './weather-notifications.css',
  './pwa-install.js', './pwa-install.css', './manifest.webmanifest',
  './assets/lucide.min.js', './assets/icons/icon-192.png',
  './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png', './assets/icons/favicon-32.png', './apple-touch-icon.png',
  './assets/icons/icon-192.png?v=20261015-2', './assets/icons/icon-512.png?v=20261015-2',
  './assets/icons/icon-maskable-512.png?v=20261015-2', './apple-touch-icon.png?v=20261015-2',
  './assets/icons/favicon-32.png?v=20261015-2'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==APP_ROOT.origin||!url.pathname.startsWith(APP_ROOT.pathname)) return;
  const navigation=request.mode==='navigate';
  const root=new URL('./',self.registration.scope).pathname;
  if(navigation&&![root,root+'index.html',root+'qa-preview.html'].includes(url.pathname))return;
  if(!navigation&&!['script','style','image','manifest'].includes(request.destination))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const response=await fetch(request);
      if(response.ok&&response.type!=='opaque') await cache.put(request,response.clone()).catch(()=>{});
      return response;
    } catch(error) {
      const cached=await cache.match(request);
      if(cached)return cached;
      if(navigation){const shell=await cache.match(new URL('./index.html',self.registration.scope).href);if(shell)return shell;}
      throw error;
    }
  })());
});

function appUrl(value) {
  try {
    const url=new URL(value||'./',APP_ROOT);
    if(url.origin===APP_ROOT.origin&&url.pathname.startsWith(APP_ROOT.pathname))return url;
  }catch{}
  return new URL(APP_ROOT);
}

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json()||{};}catch{}
  const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
  const title=clean(payload.title,100)||'챙김 · 오늘의 날씨';
  const body=clean(payload.body,1200)||'오늘의 날씨와 외출 준비를 확인해 보세요.';
  const url=appUrl(payload.url);
  event.waitUntil(self.registration.showNotification(title,{body,icon:new URL('assets/icons/icon-192.png',APP_ROOT).href,badge:new URL('assets/icons/favicon-32.png',APP_ROOT).href,tag:clean(payload.tag,180)||'chaenggim-weather',data:{url:url.href}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=appUrl(event.notification.data?.url);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){const current=new URL(client.url);if(current.origin===APP_ROOT.origin&&current.pathname.startsWith(APP_ROOT.pathname)&&'focus'in client){await client.navigate(url.href);return client.focus();}}
    return self.clients.openWindow(url.href);
  })());
});
