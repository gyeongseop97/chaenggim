import { sendWebPush, isAllowedPushEndpoint, pushBase64Url, pushDecodeBase64Url } from './push-crypto.mjs';

const notificationEncoder=new TextEncoder();
const notificationPurposes=new Set(['daily','commute','exercise','walk','trip','appointment']);
const notificationDayMs=86400000;
const notificationLeadMinutes=30;
const notificationBatchLimit=100;
const notificationMaxBody=65536;
const notificationProviderReasons=new Set(['BadTtl','BadUrgency','BadWebPushRequest','BadWebPushTopic','VapidPkHashMismatch','IdleTimeout','BadAuthorizationHeader','BadJwtToken','BadVapidPublicKey','BadPath','MethodNotAllowed','PayloadTooLarge','TooManyRequests','InternalServerError','ServiceUnavailable','Shutdown']);
function notificationJson(body,status=200,headers={}) {
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
}
function notificationError(code,status=400) {const error=new Error(code);error.status=status;error.notificationPublic=true;return error;}
function notificationClean(value,max) {return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';}
function notificationValidDate(value) {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function notificationValidTime(value) {return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
function notificationValidId(value) {return typeof value==='string'&&/^[A-Za-z0-9_-]{20,100}$/.test(value);}
function notificationValidToken(value) {return typeof value==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(value);}
async function notificationHash(value) {return pushBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',notificationEncoder.encode(value))));}
function notificationSame(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  let difference=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return difference===0;
}
function notificationConfiguration(env) {
  let validKeys=false;
  try {
    const key=pushDecodeBase64Url(env.VAPID_PUBLIC_KEY);
    const privateKey=typeof env.VAPID_PRIVATE_JWK==='string'?JSON.parse(env.VAPID_PRIVATE_JWK):env.VAPID_PRIVATE_JWK;
    validKeys=key.length===65&&key[0]===4&&privateKey?.kty==='EC'&&privateKey.crv==='P-256'&&pushDecodeBase64Url(privateKey.d).length===32&&privateKey.x===pushBase64Url(key.slice(1,33))&&privateKey.y===pushBase64Url(key.slice(33));
  } catch {}
  const available=!!env.WEATHER_DB?.prepare&&validKeys;
  return {available,deliveryReady:available&&env.PUSH_SCHEDULER_READY==='true',publicKey:available?env.VAPID_PUBLIC_KEY:null,leadMinutes:notificationLeadMinutes};
}
async function notificationReadBody(request) {
  if(Number(request.headers.get('content-length'))>notificationMaxBody)throw notificationError('BODY_TOO_LARGE',413);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw notificationError('JSON_REQUIRED',415);
  const reader=request.body?.getReader();
  if(!reader)throw notificationError('INVALID_JSON');
  let length=0;const chunks=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>notificationMaxBody){await reader.cancel();throw notificationError('BODY_TOO_LARGE',413);}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!result||typeof result!=='object'||Array.isArray(result))throw notificationError('INVALID_JSON');
    return result;
  } catch(error) {if(error?.status)throw error;throw notificationError('INVALID_JSON');}
  finally {reader.releaseLock();}
}
function notificationSameOrigin(request) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)throw notificationError('ORIGIN_DENIED',403);
}
function notificationAuthValues(request,body={}) {
  return {deviceId:request.headers.get('x-device-id')||body.deviceId,deviceToken:request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1]||body.deviceToken};
}
async function notificationAuthenticate(request,env,body) {
  const {deviceId,deviceToken}=notificationAuthValues(request,body);
  if(!notificationValidId(deviceId)||!notificationValidToken(deviceToken))throw notificationError('UNAUTHORIZED',401);
  const tokenHash=await notificationHash(deviceToken);
  const device=await env.WEATHER_DB.prepare('SELECT * FROM weather_notification_devices WHERE device_id = ?').bind(deviceId).first();
  if(!device||!notificationSame(device.token_hash,tokenHash))throw notificationError('UNAUTHORIZED',401);
  return device;
}
function notificationNormalizeSchedule(value) {
  if(!value||typeof value!=='object'||typeof value.id!=='string'||!value.id||value.id.length>100||!['repeat','once'].includes(value.kind)||!notificationPurposes.has(value.purpose)||!notificationValidTime(value.start)||!notificationValidTime(value.end)||value.start>=value.end)throw notificationError('INVALID_SCHEDULE');
  const name=notificationClean(value.name,41);
  if(!name||name.length>40||/[\u0000-\u001f\u007f]/.test(value.id))throw notificationError('INVALID_SCHEDULE');
  const schedule={id:value.id,kind:value.kind,name,purpose:value.purpose,start:value.start,end:value.end,enabled:value.enabled!==false,excludeHoliday:value.excludeHoliday===true};
  if(value.kind==='once'){
    if(!notificationValidDate(value.date))throw notificationError('INVALID_SCHEDULE');
    schedule.date=value.date;
  } else {
    if(!Array.isArray(value.days)||!value.days.length||value.days.length>7||!value.days.every(day=>Number.isInteger(day)&&day>=0&&day<7))throw notificationError('INVALID_SCHEDULE');
    schedule.days=[...new Set(value.days)].sort();
  }
  return schedule;
}
async function notificationNormalizeRegistration(body) {
  if(!notificationValidId(body.deviceId)||!notificationValidToken(body.deviceToken))throw notificationError('INVALID_DEVICE');
  const endpoint=body.subscription?.endpoint;
  if(!isAllowedPushEndpoint(endpoint))throw notificationError('INVALID_PUSH_ENDPOINT');
  let p256dh,auth;
  try {
    p256dh=pushDecodeBase64Url(body.subscription.keys.p256dh);auth=pushDecodeBase64Url(body.subscription.keys.auth);
    if(p256dh.length!==65||p256dh[0]!==4||auth.length!==16)throw new Error();
    await crypto.subtle.importKey('raw',p256dh,{name:'ECDH',namedCurve:'P-256'},false,[]);
  } catch {throw notificationError('INVALID_PUSH_KEY');}
  const latitude=body.location?.latitude??body.location?.lat;
  const longitude=body.location?.longitude??body.location?.lon;
  if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw notificationError('INVALID_LOCATION');
  const location={latitude,longitude,name:notificationClean(body.location.name,160)};
  if(['gps','manual'].includes(body.location.source))location.source=body.location.source;
  const timeZone=body.timezone||body.timeZone||'Asia/Seoul';
  if(typeof timeZone!=='string'||timeZone.length>100)throw notificationError('INVALID_TIMEZONE');
  try {new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw notificationError('INVALID_TIMEZONE');}
  if(!Array.isArray(body.schedules)||body.schedules.length>32)throw notificationError('INVALID_SCHEDULE');
  const schedules=body.schedules.map(notificationNormalizeSchedule);
  if(new Set(schedules.map(schedule=>schedule.id)).size!==schedules.length)throw notificationError('INVALID_SCHEDULE');
  if(!['cold','normal','hot'].includes(body.preference))throw notificationError('INVALID_PREFERENCE');
  if(body.leadMinutes!==undefined&&body.leadMinutes!==notificationLeadMinutes)throw notificationError('INVALID_LEAD_TIME');
  const dailyNotificationTime=body.dailyNotificationTime??'07:00';
  if(!notificationValidTime(dailyNotificationTime))throw notificationError('INVALID_DAILY_NOTIFICATION_TIME');
  return {deviceId:body.deviceId,tokenHash:await notificationHash(body.deviceToken),endpoint,p256dh:pushBase64Url(p256dh),auth:pushBase64Url(auth),location,schedules,preference:body.preference,timeZone,dailyNotificationTime};
}
async function notificationRemoveDevice(db,deviceId) {
  await db.batch([
    db.prepare('DELETE FROM weather_notification_deliveries WHERE device_id = ?').bind(deviceId),
    db.prepare('DELETE FROM weather_notification_devices WHERE device_id = ?').bind(deviceId)
  ]);
}
function notificationSubscription(device) {return {endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}};}
export async function handleNotificationRequest(request,env={},deps={}) {
  const path=new URL(request.url).pathname;
  const suffix=path.slice('/api/notifications'.length);
  if(!path.startsWith('/api/notifications/'))return notificationJson({code:'NOT_FOUND'},404);
  if(suffix==='/config')return request.method==='GET'?notificationJson(notificationConfiguration(env)):notificationJson({code:'METHOD_NOT_ALLOWED'},405);
  if(!['/subscription','/test','/tick'].includes(suffix))return notificationJson({code:'NOT_FOUND'},404);
  try {
    if(suffix==='/tick'){
      if(request.method!=='POST')return notificationJson({code:'METHOD_NOT_ALLOWED'},405);
      const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      if(typeof env.PUSH_ADMIN_TOKEN!=='string'||env.PUSH_ADMIN_TOKEN.length<32||!notificationSame(bearer,env.PUSH_ADMIN_TOKEN))return notificationJson({code:'UNAUTHORIZED'},401);
      return notificationJson(await runNotificationTick(env,deps));
    }
    if(!notificationConfiguration(env).available)return notificationJson({code:'NOT_CONFIGURED'},503);
    if(request.method!=='GET')notificationSameOrigin(request);
    if(suffix==='/subscription'&&request.method==='POST'){
      const registration=await notificationNormalizeRegistration(await notificationReadBody(request));
      const db=env.WEATHER_DB;
      const existing=await db.prepare('SELECT token_hash FROM weather_notification_devices WHERE device_id = ?').bind(registration.deviceId).first();
      if(existing&&!notificationSame(existing.token_hash,registration.tokenHash))return notificationJson({code:'UNAUTHORIZED'},401);
      const endpointDevice=await db.prepare('SELECT device_id FROM weather_notification_devices WHERE endpoint = ?').bind(registration.endpoint).first();
      if(endpointDevice&&endpointDevice.device_id!==registration.deviceId)return notificationJson({code:'SUBSCRIPTION_EXISTS'},409);
      const now=typeof deps.now==='function'?deps.now():Date.now();
      await db.prepare(`INSERT INTO weather_notification_devices
        (device_id,token_hash,endpoint,p256dh,auth,location_json,schedules_json,preference,time_zone,lead_minutes,daily_notification_time,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(device_id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,location_json=excluded.location_json,schedules_json=excluded.schedules_json,preference=excluded.preference,time_zone=excluded.time_zone,lead_minutes=excluded.lead_minutes,daily_notification_time=excluded.daily_notification_time,updated_at=excluded.updated_at`)
        .bind(registration.deviceId,registration.tokenHash,registration.endpoint,registration.p256dh,registration.auth,JSON.stringify(registration.location),JSON.stringify(registration.schedules),registration.preference,registration.timeZone,notificationLeadMinutes,registration.dailyNotificationTime,now,now).run();
      return notificationJson({enabled:true,leadMinutes:notificationLeadMinutes,dailyNotificationTime:registration.dailyNotificationTime,deliveryReady:env.PUSH_SCHEDULER_READY==='true'});
    }
    if(suffix==='/subscription'&&request.method==='GET'){
      const device=await notificationAuthenticate(request,env);
      return notificationJson({enabled:true,leadMinutes:device.lead_minutes,dailyNotificationTime:device.daily_notification_time,lastSentAt:device.last_sent_at||null,deliveryReady:env.PUSH_SCHEDULER_READY==='true'});
    }
    if(suffix==='/subscription'&&request.method==='DELETE'){
      const body=request.headers.get('content-type')?await notificationReadBody(request):{};
      const device=await notificationAuthenticate(request,env,body);
      await notificationRemoveDevice(env.WEATHER_DB,device.device_id);
      return notificationJson({enabled:false});
    }
    if(suffix==='/test'&&request.method==='POST'){
      const body=request.headers.get('content-type')?await notificationReadBody(request):{};
      let device;
      const adminBearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      const targetId=request.headers.get('x-device-id');
      const approvedAdmin=typeof env.PUSH_ADMIN_TOKEN==='string'&&env.PUSH_ADMIN_TOKEN.length>=32&&notificationSame(adminBearer,env.PUSH_ADMIN_TOKEN)&&body.approved===true&&notificationValidId(targetId);
      if(approvedAdmin){
        // A server operator can only send this fixed test to one explicitly approved device.
        device=await env.WEATHER_DB.prepare('SELECT * FROM weather_notification_devices WHERE device_id = ?').bind(targetId).first();
        if(!device)throw notificationError('UNAUTHORIZED',401);
      }else device=await notificationAuthenticate(request,env,body);
      const now=typeof deps.now==='function'?deps.now():Date.now();
      const claimed=await env.WEATHER_DB.prepare('UPDATE weather_notification_devices SET last_test_at = ?,test_retry_at = ? WHERE device_id = ? AND COALESCE(test_retry_at,last_test_at+60000,0) <= ? RETURNING device_id').bind(now,now+60000,device.device_id,now).first();
      if(!claimed){
        const latest=await env.WEATHER_DB.prepare('SELECT last_test_at,test_retry_at FROM weather_notification_devices WHERE device_id = ?').bind(device.device_id).first();
        const retryAt=latest?.test_retry_at??(latest?.last_test_at?latest.last_test_at+60000:now+60000);
        const retryAfterSeconds=Math.max(1,Math.min(60,Math.ceil((retryAt-now)/1000)));
        return notificationJson({code:'TEST_RATE_LIMITED',retryAfterSeconds},429,{'retry-after':String(retryAfterSeconds)});
      }
      const payload={title:'챙김 테스트 알림',body:'일정이 있는 날은 외출 30분 전, 일정이 없는 날은 '+device.daily_notification_time+'에 날씨와 옷차림을 알려드릴게요.',tag:'chaenggim-test',url:'/',icon:'/assets/icons/icon-192.png',badge:'/assets/icons/icon-192.png'};
      let sent;
      try{sent=await sendWebPush(notificationSubscription(device),payload,env,{fetch:deps.fetch,now,ttl:120,urgency:'high',topic:'chaenggim-test'});}
      catch{sent={ok:false,status:0,retryable:false,reason:'UNKNOWN'};}
      const diagnostic={};
      if(approvedAdmin){
        if(Number.isInteger(sent.providerStatus)&&(sent.providerStatus===0||sent.providerStatus>=100&&sent.providerStatus<=599))diagnostic.providerStatus=sent.providerStatus;
        if(notificationProviderReasons.has(sent.providerReason))diagnostic.providerReason=sent.providerReason;
        if(['AbortError','TimeoutError','TypeError','NetworkError','Error'].includes(sent.transportErrorName))diagnostic.transportErrorName=sent.transportErrorName;
        if(sent.transportErrorCode==='UNSUPPORTED_REQUEST_OPTION')diagnostic.transportErrorCode=sent.transportErrorCode;
        if(typeof sent.timedOut==='boolean')diagnostic.timedOut=sent.timedOut;
      }
      if(sent.expired){await notificationRemoveDevice(env.WEATHER_DB,device.device_id);return notificationJson({code:'SUBSCRIPTION_EXPIRED',enabled:false,...diagnostic},410);}
      const completedAt=typeof deps.now==='function'?deps.now():Date.now();
      const retryAfterSeconds=sent.ok?60:10;
      await env.WEATHER_DB.prepare('UPDATE weather_notification_devices SET last_test_at = ?,test_retry_at = ? WHERE device_id = ? AND last_test_at = ?').bind(completedAt,completedAt+retryAfterSeconds*1000,device.device_id,now).run();
      if(sent.ok)return notificationJson({sent:true,retryAfterSeconds,...diagnostic});
      const reasons=['BAD_AUTHORIZATION','INVALID_VAPID','BAD_PAYLOAD','SUBSCRIPTION_EXPIRED','PUSH_RATE_LIMITED','PUSH_PROVIDER_UNAVAILABLE','PUSH_NETWORK_ERROR','UNKNOWN'];
      const reason=reasons.includes(sent.reason)?sent.reason:'UNKNOWN';
      return notificationJson({code:'PUSH_UNAVAILABLE',reason,retryable:sent.retryable===true,retryAfterSeconds,...diagnostic},502,{'retry-after':String(retryAfterSeconds)});
    }
    return notificationJson({code:'METHOD_NOT_ALLOWED'},405);
  } catch(error) {return notificationJson({code:error?.notificationPublic===true?error.message:'NOTIFICATION_UNAVAILABLE'},error?.notificationPublic===true?error.status:503);}
}

function notificationLocalParts(now,timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(part=>[part.type,part.value]));
}
function notificationLocalDate(now,timeZone) {const parts=notificationLocalParts(now,timeZone);return parts.year+'-'+parts.month+'-'+parts.day;}
function notificationNextDate(date) {return new Date(Date.parse(date+'T12:00:00Z')+notificationDayMs).toISOString().slice(0,10);}
function notificationZonedTimestamp(date,time,timeZone) {
  const target=Date.parse(date+'T'+time+':00Z');
  let candidate=target;
  for(let step=0;step<4;step++){
    const parts=notificationLocalParts(candidate,timeZone);
    const local=Date.parse(parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second+'Z');
    const difference=target-local;
    if(!difference)return candidate;
    candidate+=difference;
  }
  const parts=notificationLocalParts(candidate,timeZone);
  return parts.year+'-'+parts.month+'-'+parts.day===date&&parts.hour+':'+parts.minute===time?candidate:NaN;
}
async function notificationUpcoming(device,now,deps) {
  const schedules=JSON.parse(device.schedules_json);
  const today=notificationLocalDate(now,device.time_zone);
  const due=[];
  for(const date of [today,notificationNextDate(today)]){
    const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
    const holiday=typeof deps.isHoliday==='function'?await deps.isHoliday(date,device.time_zone):false;
    const daySchedules=schedules.filter(schedule=>schedule.enabled&&(schedule.kind==='once'?schedule.date===date:schedule.days.includes(weekday)&&!(schedule.excludeHoliday&&holiday)));
    if(date===today&&!daySchedules.length){
      const dailyTime=notificationZonedTimestamp(date,notificationValidTime(device.daily_notification_time)?device.daily_notification_time:'07:00',device.time_zone);
      // Keep the original daily key so editing the time cannot resend today's summary.
      if(now>=dailyTime&&now<=dailyTime+30*60000)due.push({schedule:null,date,departure:dailyTime+30*60000+1000,occurrenceKey:date+'|daily0700',daily:true});
    }
    for(const schedule of daySchedules){
      const departure=notificationZonedTimestamp(date,schedule.start,device.time_zone);
      // Delayed checks catch up before departure, never after the outing has begun.
      if(!Number.isFinite(departure)||departure<=now||departure-now>notificationLeadMinutes*60000)continue;
      due.push({schedule,date,departure,occurrenceKey:date+'|'+schedule.id+'|'+notificationLeadMinutes});
    }
  }
  return due.sort((a,b)=>a.departure-b.departure);
}
function notificationSummary(analysis,forecast,occurrence) {
  const dailyIndex=occurrence.daily&&Array.isArray(forecast.daily?.time)?forecast.daily.time.indexOf(occurrence.date):-1;
  const dailyLow=dailyIndex>=0?forecast.daily.temperature_2m_min?.[dailyIndex]:null;
  const dailyHigh=dailyIndex>=0?forecast.daily.temperature_2m_max?.[dailyIndex]:null;
  const low=Number.isFinite(dailyLow)?dailyLow:analysis.low,high=Number.isFinite(dailyHigh)?dailyHigh:analysis.high;
  const range=Number.isFinite(low)&&Number.isFinite(high)
    ?Math.round(low)===Math.round(high)?Math.round(low)+'°':Math.round(low)+'–'+Math.round(high)+'°':'기온 확인 중';
  const conditions=[...new Set((forecast.rows||[]).filter(row=>row.date===occurrence.date&&(occurrence.daily||row.hour>=Math.floor(analysis.window?.startHour??0)&&row.hour<=(analysis.window?.endHour??24))).map(row=>notificationClean(row.condition,20)).filter(value=>value&&value!=='날씨 정보'))];
  const weather=conditions.sort((a,b)=>Number(/눈|비|뇌우/.test(b))-Number(/눈|비|뇌우/.test(a))).slice(0,2).join(' · ')||notificationClean(forecast.current?.condition,20)||'예보 확인';
  const clothes=(analysis.outfitPieces||[]).filter(value=>typeof value==='string').slice(0,5).map(value=>notificationClean(value,50)).join(' · ');
  const preparations=(analysis.prepItems||[]).map(item=>notificationClean(typeof item==='string'?item:item?.name,50)).filter(Boolean).slice(0,4).join(' · ');
  const time=occurrence.daily?'오늘':occurrence.schedule.start+'–'+occurrence.schedule.end;
  return notificationClean([time+' '+range+' · '+weather+'.',clothes?'옷차림: '+clothes+'.':'',preparations?'챙길 것: '+preparations+'.':'챙길 것: 추가 준비물은 없어요.'].filter(Boolean).join(' '),500);
}
async function notificationClaim(db,deviceId,occurrenceKey,now) {
  const deliveryId=await notificationHash(deviceId+'\0'+occurrenceKey);
  await db.prepare(`INSERT INTO weather_notification_deliveries (delivery_id,device_id,occurrence_key,status,attempts,retry_at,lock_until,created_at)
    VALUES (?,?,?,'queued',0,0,0,?) ON CONFLICT(device_id,occurrence_key) DO NOTHING`).bind(deliveryId,deviceId,occurrenceKey,now).run();
  return db.prepare(`UPDATE weather_notification_deliveries SET status='pending',attempts=attempts+1,lock_until=?
    WHERE delivery_id=? AND attempts<3 AND retry_at<=? AND lock_until<=? AND status IN ('queued','retry','pending') RETURNING delivery_id,attempts`)
    .bind(now+120000,deliveryId,now,now).first();
}
export async function runNotificationTick(env={},deps={},options={}) {
  if(!notificationConfiguration(env).available)throw notificationError('NOT_CONFIGURED',503);
  const advice=deps.advice||globalThis.ChaenggimAdvice;
  if(typeof deps.weatherForLocation!=='function'||typeof advice?.analyze!=='function')throw notificationError('NOTIFICATION_DEPENDENCY_MISSING',503);
  const now=Number.isFinite(options.now)?options.now:typeof deps.now==='function'?deps.now():Date.now();
  const db=env.WEATHER_DB;
  const stats={ok:true,checked:0,due:0,sent:0,skipped:0,retried:0,expired:0,failed:0};
  await db.prepare('DELETE FROM weather_notification_deliveries WHERE created_at < ?').bind(now-35*notificationDayMs).run();
  const result=await db.prepare('SELECT * FROM weather_notification_devices ORDER BY last_checked_at,device_id LIMIT ?').bind(notificationBatchLimit).all();
  const devices=result.results||[];
  const forecasts=new Map();
  const started=Date.now();
  async function checkDevice(device) {
    if(Date.now()-started>23000)return;
    stats.checked++;
    await db.prepare('UPDATE weather_notification_devices SET last_checked_at = ? WHERE device_id = ?').bind(now,device.device_id).run();
    try {
      const due=await notificationUpcoming(device,now,deps);
      if(!due.length)return;
      stats.due+=due.length;
      const location=JSON.parse(device.location_json);
      const key=location.latitude.toFixed(3)+','+location.longitude.toFixed(3);
      if(!forecasts.has(key))forecasts.set(key,Promise.resolve().then(()=>deps.weatherForLocation(location,env,{now})));
      const forecast=await forecasts.get(key);
      for(const occurrence of due){
        const analysis=advice.analyze({rows:forecast?.rows||[],current:forecast?.current,now,date:occurrence.date,timeZone:device.time_zone,schedule:occurrence.schedule,preference:device.preference});
        if(!analysis?.valid||analysis.basis!=='forecast'){stats.skipped++;continue;}
        const claim=await notificationClaim(db,device.device_id,occurrence.occurrenceKey,now);
        if(!claim)continue;
        const payload={title:occurrence.daily?'오늘의 챙김':notificationClean(occurrence.schedule.name,40)+' 전 챙김',body:notificationSummary(analysis,forecast,occurrence),tag:'chaenggim-'+claim.delivery_id.slice(0,24),url:'/',icon:'/assets/icons/icon-192.png',badge:'/assets/icons/icon-192.png',...(occurrence.daily?{}:{departureAt:occurrence.departure})};
        let sent;
        try {sent=await sendWebPush(notificationSubscription(device),payload,env,{fetch:deps.fetch,now,ttl:Math.max(1,Math.floor((occurrence.departure-now)/1000)),topic:claim.delivery_id.slice(0,32)});}
        catch {sent={ok:false,status:0,expired:false,retryable:false};}
        if(sent.ok){
          await db.batch([
            db.prepare("UPDATE weather_notification_deliveries SET status='sent',sent_at=?,lock_until=0,last_error=NULL WHERE delivery_id=?").bind(now,claim.delivery_id),
            db.prepare('UPDATE weather_notification_devices SET last_sent_at=? WHERE device_id=?').bind(now,device.device_id)
          ]);stats.sent++;
        } else if(sent.expired){await notificationRemoveDevice(db,device.device_id);stats.expired++;break;}
        else {
          const retryable=sent.retryable&&claim.attempts<3;
          const retryAt=now+(sent.retryAfterSeconds||60)*1000;
          await db.prepare('UPDATE weather_notification_deliveries SET status=?,retry_at=?,lock_until=0,last_error=? WHERE delivery_id=?')
            .bind(retryable?'retry':'failed',retryAt,'PUSH_'+(sent.status||'NETWORK'),claim.delivery_id).run();
          if(retryable)stats.retried++;else stats.failed++;
        }
      }
    } catch {stats.failed++;}
  }
  for(let offset=0;offset<devices.length;offset+=4)await Promise.all(devices.slice(offset,offset+4).map(checkDevice));
  return stats;
}
