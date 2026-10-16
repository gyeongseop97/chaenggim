// Web Push aes128gcm and VAPID, RFC 8291 / RFC 8292. No client secrets leave this module.
const pushEncoder = new TextEncoder();
const vapidCache = new Map();
const vapidCacheLifetime = 60*60*1000;
const pushProviderReasons = new Set(['BadTtl','BadUrgency','BadWebPushRequest','BadWebPushTopic','VapidPkHashMismatch','IdleTimeout','BadAuthorizationHeader','BadJwtToken','BadVapidPublicKey','BadPath','MethodNotAllowed','PayloadTooLarge','TooManyRequests','InternalServerError','ServiceUnavailable','Shutdown']);
const pushTransportNames = new Set(['AbortError','TimeoutError','TypeError','NetworkError','Error']);
const pushUnsupportedOptions = new Set(["The 'credentials' field on 'RequestInitializerDict' is not implemented.","The 'referrerPolicy' field on 'RequestInitializerDict' is not implemented."]);

export function pushBase64Url(bytes) {
  let binary='';
  for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function pushDecodeBase64Url(value) {
  if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)throw new Error('INVALID_PUSH_KEY');
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function pushConcat(...arrays) {
  const result=new Uint8Array(arrays.reduce((sum,array)=>sum+array.byteLength,0));
  let offset=0;
  for(const array of arrays){result.set(new Uint8Array(array),offset);offset+=array.byteLength;}
  return result;
}
async function pushHmac(key,data) {
  const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',imported,data));
}
export async function encryptWebPush(payload,subscription,options={}) {
  const message=typeof payload==='string'?pushEncoder.encode(payload):new Uint8Array(payload);
  if(message.byteLength>3993)throw new Error('PUSH_PAYLOAD_TOO_LARGE');
  const receiverRaw=pushDecodeBase64Url(subscription?.keys?.p256dh);
  const auth=pushDecodeBase64Url(subscription?.keys?.auth);
  if(receiverRaw.length!==65||receiverRaw[0]!==4||auth.length!==16)throw new Error('INVALID_PUSH_KEY');
  const receiver=await crypto.subtle.importKey('raw',receiverRaw,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const ephemeral=options.ephemeralKeyPair||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const senderRaw=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiver},ephemeral.privateKey,256));
  const salt=options.salt?new Uint8Array(options.salt):crypto.getRandomValues(new Uint8Array(16));
  if(salt.length!==16)throw new Error('INVALID_PUSH_SALT');
  const combining=await pushHmac(auth,shared);
  const ikm=await pushHmac(combining,pushConcat(pushEncoder.encode('WebPush: info\0'),receiverRaw,senderRaw,new Uint8Array([1])));
  const prk=await pushHmac(salt,ikm);
  const cek=(await pushHmac(prk,pushEncoder.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0,16);
  const nonce=(await pushHmac(prk,pushEncoder.encode('Content-Encoding: nonce\0\x01'))).slice(0,12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},key,pushConcat(message,new Uint8Array([2])));
  const header=new Uint8Array(86);
  header.set(salt);new DataView(header.buffer).setUint32(16,4096,false);header[20]=65;header.set(senderRaw,21);
  return pushConcat(header,new Uint8Array(ciphertext));
}
export async function createVapidAuthorization(endpoint,env,options={}) {
  const privateJwk=typeof env.VAPID_PRIVATE_JWK==='string'?JSON.parse(env.VAPID_PRIVATE_JWK):env.VAPID_PRIVATE_JWK;
  const publicKey=env.VAPID_PUBLIC_KEY;
  const point=pushDecodeBase64Url(publicKey);
  if(point.length!==65||point[0]!==4||privateJwk?.kty!=='EC'||privateJwk.crv!=='P-256'||!privateJwk.d||pushBase64Url(point.slice(1,33))!==privateJwk.x||pushBase64Url(point.slice(33))!==privateJwk.y)throw new Error('VAPID_NOT_CONFIGURED');
  const subject=env.VAPID_SUBJECT;
  if(typeof subject!=='string'||!subject.trim())throw new Error('INVALID_VAPID_SUBJECT');
  let contact;
  try{contact=new URL(subject);}catch{throw new Error('INVALID_VAPID_SUBJECT');}
  if(!['https:','mailto:'].includes(contact.protocol))throw new Error('INVALID_VAPID_SUBJECT');
  const now=Number.isFinite(options.now)?options.now:Date.now();
  const audience=new URL(endpoint).origin;
  const privateKey={...privateJwk};
  const fingerprint=pushBase64Url(await crypto.subtle.digest('SHA-256',pushEncoder.encode(JSON.stringify([privateKey.kty,privateKey.crv,privateKey.x,privateKey.y,privateKey.d]))));
  const cacheKey=JSON.stringify([audience,publicKey,subject,fingerprint]);
  const cached=options.cache===false?null:vapidCache.get(cacheKey);
  if(cached&&now>=cached.issuedAt&&now-cached.issuedAt<vapidCacheLifetime){
    vapidCache.delete(cacheKey);vapidCache.set(cacheKey,cached);
    return cached.promise;
  }
  const sign=async()=>{
    const head=pushBase64Url(pushEncoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
    const claims=pushBase64Url(pushEncoder.encode(JSON.stringify({aud:audience,exp:Math.floor(now/1000)+12*60*60,sub:subject})));
    const input=head+'.'+claims;
    const signingKey=await crypto.subtle.importKey('jwk',{...privateKey,key_ops:['sign'],ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,pushEncoder.encode(input)));
    if(signature.length!==64)throw new Error('UNSUPPORTED_VAPID_SIGNATURE');
    return 'vapid t='+input+'.'+pushBase64Url(signature)+', k='+publicKey;
  };
  const entry={issuedAt:now,promise:sign()};
  if(options.cache!==false){
    vapidCache.delete(cacheKey);
    while(vapidCache.size>=32)vapidCache.delete(vapidCache.keys().next().value);
    vapidCache.set(cacheKey,entry);
  }
  try{return await entry.promise;}
  catch(error){if(vapidCache.get(cacheKey)===entry)vapidCache.delete(cacheKey);throw error;}
}
export function isAllowedPushEndpoint(value) {
  try {
    if(typeof value!=='string'||value.length>2048)return false;
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||url.pathname==='/')return false;
    const host=url.hostname.toLowerCase();
    return host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='notify.windows.com'||host.endsWith('.notify.windows.com');
  } catch {return false;}
}
async function pushAwait(promise,signal) {
  let onAbort;
  const aborted=new Promise((resolve,reject)=>{
    onAbort=()=>reject(new DOMException('Push request timed out','AbortError'));
    if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});
  });
  try{return await Promise.race([promise,aborted]);}
  finally{signal.removeEventListener('abort',onAbort);}
}
async function pushReadProviderReason(response,signal) {
  const reader=response.body?.getReader?.();
  if(!reader)return undefined;
  const chunks=[];let length=0;
  try {
    for(let reads=0;length<4096&&reads<4096;reads++){
      const {done,value}=await pushAwait(reader.read(),signal);
      if(done)break;
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      const part=bytes.slice(0,4096-length);
      chunks.push(part);length+=part.byteLength;
    }
    const text=new TextDecoder().decode(pushConcat(...chunks));
    let reason;
    try{reason=JSON.parse(text)?.reason;}catch{}
    return typeof reason==='string'&&pushProviderReasons.has(reason)?reason:undefined;
  } finally {
    // Never wait on an untrusted stream's cancel callback past the request deadline.
    try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}
    try{reader.releaseLock();}catch{}
  }
}
function pushReason(status,providerReason) {
  if([404,410].includes(status))return 'SUBSCRIPTION_EXPIRED';
  if(['BadJwtToken','BadVapidPublicKey','VapidPkHashMismatch'].includes(providerReason))return 'INVALID_VAPID';
  if(providerReason==='BadAuthorizationHeader')return 'BAD_AUTHORIZATION';
  if(['BadTtl','BadUrgency','BadWebPushRequest','BadWebPushTopic','BadPath','MethodNotAllowed','PayloadTooLarge'].includes(providerReason))return 'BAD_PAYLOAD';
  if(status===429||providerReason==='TooManyRequests')return 'PUSH_RATE_LIMITED';
  if(status>=500||['IdleTimeout','InternalServerError','ServiceUnavailable','Shutdown'].includes(providerReason))return 'PUSH_PROVIDER_UNAVAILABLE';
  if([401,403].includes(status))return 'BAD_AUTHORIZATION';
  if(status===413)return 'BAD_PAYLOAD';
  return 'UNKNOWN';
}
function pushRetryAfter(response,now) {
  const retryHeader=response.headers?.get?.('retry-after');
  let retry=Number(retryHeader);
  if(!retryHeader||!Number.isFinite(retry))retry=(Date.parse(retryHeader||'')-now)/1000;
  return Number.isFinite(retry)?Math.max(30,Math.min(3600,retry)):60;
}
function pushLogFailure(result,startedAt) {
  // Endpoint paths are bearer capabilities. Provider text and caught error messages
  // can reflect them, so only known codes and a validated hostname reach logs.
  const safe={reason:result.reason,providerStatus:result.providerStatus,providerHost:result.providerHost,
    ...(result.providerReason?{providerReason:result.providerReason}:{}),
    ...(result.transportErrorName?{transportErrorName:result.transportErrorName}:{}),
    ...(result.transportErrorCode?{transportErrorCode:result.transportErrorCode}:{}),
    ...(result.timedOut?{timedOut:true}:{}),retryAfterSeconds:result.retryAfterSeconds,
    elapsedMs:Math.max(0,Math.round(performance.now()-startedAt))};
  try{console.warn('web_push_failed',safe);}catch{}
}
export async function sendWebPush(subscription,payload,env,options={}) {
  if(!isAllowedPushEndpoint(subscription?.endpoint))throw new Error('INVALID_PUSH_ENDPOINT');
  const body=await encryptWebPush(typeof payload==='string'?payload:JSON.stringify(payload),subscription);
  const authorization=await createVapidAuthorization(subscription.endpoint,env,options);
  const urgency=['very-low','low','normal','high'].includes(options.urgency)?options.urgency:'normal';
  const headers={'authorization':authorization,'content-type':'application/octet-stream','content-encoding':'aes128gcm','ttl':String(Math.max(0,Math.min(86400,options.ttl??900))),'urgency':urgency};
  if(typeof options.topic==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(options.topic))headers.topic=options.topic;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  const providerHost=new URL(subscription.endpoint).hostname;
  const startedAt=performance.now();
  let response;
  try {
    const fetchRequest=options.fetch||((...args)=>globalThis.fetch(...args));
    // workerd supports follow/manual. Manual also keeps VAPID credentials on this provider.
    response=await pushAwait(Promise.resolve().then(()=>fetchRequest(subscription.endpoint,{method:'POST',headers,body,signal:controller.signal,redirect:'manual'})),controller.signal);
    const result={ok:response.ok,status:response.status,providerStatus:response.status,providerHost,
      expired:[404,410].includes(response.status),retryable:response.status===429||response.status>=500,
      retryAfterSeconds:pushRetryAfter(response,options.now??Date.now())};
    if(response.ok)return result;
    const providerReason=await pushReadProviderReason(response,controller.signal);
    if(providerReason)result.providerReason=providerReason;
    result.reason=pushReason(response.status,providerReason);
    pushLogFailure(result,startedAt);
    return result;
  } catch(error) {
    const transportErrorName=pushTransportNames.has(error?.name)?error.name:'Error';
    const result={ok:false,status:response?.status||0,providerStatus:response?.status||0,providerHost,
      expired:[404,410].includes(response?.status),retryable:response?response.status===429||response.status>=500:true,
      retryAfterSeconds:response?pushRetryAfter(response,options.now??Date.now()):60,
      reason:response?pushReason(response.status):'PUSH_NETWORK_ERROR',transportErrorName,
      ...(pushUnsupportedOptions.has(error?.message)?{transportErrorCode:'UNSUPPORTED_REQUEST_OPTION'}:{}),
      timedOut:controller.signal.aborted};
    pushLogFailure(result,startedAt);
    return result;
  }
  finally {clearTimeout(timeout);}
}
