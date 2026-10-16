(function () {
  'use strict';
  const STORAGE = 'chaenggim-notifications-v1';
  const API = '/api/notifications';
  const serverEnabled = window.ChaenggimConfig?.serverApi === true;
  const serverRequired = 'GitHub Pages에서는 푸시 알림을 사용할 수 없어요. 서버 배포 후 켤 수 있어요.';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  let record = null,storageBlocked = false,configuration = null,configError = false,loadedAt = 0;
  let registration = null,preloading = null,busy = false,syncing = false,consent = false,message = '';
  let generation = 0,syncTimer = null,lastSignature = '',serverWrite = Promise.resolve(),deleteRetryAt = 0;
  let testRetryUntil = 0,testRetryTimer = null;

  function readRecord() {
    let serialized;
    try {serialized = localStorage.getItem(STORAGE);} catch {storageBlocked = true;return;}
    try {
      const value = JSON.parse(serialized);
      if(value?.version === 1 && /^[A-Za-z0-9_-]{20,100}$/.test(value.deviceId) && /^[A-Za-z0-9_-]{43,128}$/.test(value.deviceToken)) {
        record = {version:1,deviceId:value.deviceId,deviceToken:value.deviceToken,enabled:value.enabled === true,pendingDelete:value.pendingDelete === true};
      }
    } catch {}
  }
  function saveRecord(value) {
    try {
      if(value) {
        const serialized = JSON.stringify(value);
        localStorage.setItem(STORAGE,serialized);
        if(localStorage.getItem(STORAGE) !== serialized)throw new Error();
      } else localStorage.removeItem(STORAGE);
      record = value;
      storageBlocked = false;
    } catch { storageBlocked = true;throw new Error('STORAGE_UNAVAILABLE'); }
  }
  function encode(bytes) {return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decode(value) {
    if(typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value))throw new Error('INVALID_CONFIGURATION');
    const binary = atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
    const bytes = Uint8Array.from(binary,char=>char.charCodeAt(0));
    if(bytes.length !== 65 || bytes[0] !== 4)throw new Error('INVALID_CONFIGURATION');
    return bytes;
  }
  function newRecord() {
    return {version:1,deviceId:encode(crypto.getRandomValues(new Uint8Array(24))),deviceToken:encode(crypto.getRandomValues(new Uint8Array(32))),enabled:false,pendingDelete:false};
  }
  function isIos() {return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;}
  function standalone() {return navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;}
  function supportIssue() {
    if(!serverEnabled)return serverRequired;
    if(!window.isSecureContext)return '보안 연결에서 알림을 사용할 수 있어요. HTTPS 주소로 접속해 주세요.';
    if(isIos() && !standalone())return '아이폰·아이패드는 공유 메뉴에서 홈 화면에 추가한 뒤, 추가된 앱을 열어 알림을 켜 주세요.';
    if(!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator) || !window.crypto?.getRandomValues)return '이 브라우저에서는 웹 알림을 지원하지 않아요. 알림을 지원하는 브라우저에서 열어 주세요.';
    if(Notification.permission === 'denied')return '알림이 차단되어 있어요. 기기의 설정에서 챙김 알림을 허용해 주세요.';
    if(storageBlocked)return '이 브라우저에서 알림 연결 정보를 저장할 수 없어요. 저장 공간 사용을 허용한 뒤 다시 시도해 주세요.';
    return '';
  }
  function readSnapshot() {try {return window.ChaenggimProfile?.getSnapshot();}catch {return null;}}
  function dailyTime() {const value=readSnapshot()?.dailyNotificationTime;return validTime(value) ? value : '07:00';}
  function timeLabel(value) {
    const [hour,minute]=value.split(':').map(Number);
    return (hour<12 ? '오전 ' : '오후 ')+(hour%12 || 12)+'시'+(minute ? ' '+minute+'분' : '');
  }
  function profile() {
    const snapshot = readSnapshot();
    const location = snapshot?.location;
    if(!location || !finite(location.latitude) || !finite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180)return null;
    if(!Array.isArray(snapshot.schedules) || snapshot.schedules.length > 32)return null;
    const schedules = snapshot.schedules.map(schedule=>{
      const item = {id:schedule.id,kind:schedule.kind,name:schedule.name,purpose:schedule.purpose,start:schedule.start,end:schedule.end,enabled:schedule.enabled !== false,excludeHoliday:schedule.excludeHoliday === true};
      if(item.kind === 'once')item.date = schedule.date;
      else item.days = Array.isArray(schedule.days) ? [...schedule.days] : [];
      return item;
    });
    let timezone = snapshot.timezone || snapshot.timeZone || 'Asia/Seoul';
    try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch {timezone = 'Asia/Seoul';}
    return {location:{latitude:location.latitude,longitude:location.longitude,name:String(location.name || '').slice(0,160),...(['gps','manual'].includes(location.source) ? {source:location.source} : {})},schedules,preference:['cold','normal','hot'].includes(snapshot.preference) ? snapshot.preference : 'normal',dailyNotificationTime:validTime(snapshot.dailyNotificationTime) ? snapshot.dailyNotificationTime : '07:00',timezone,leadMinutes:30};
  }
  async function request(path,{method='GET',body,identity,timeout=12000}={}) {
    if(!serverEnabled)throw new Error('SERVER_REQUIRED');
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),timeout);
    const headers = {accept:'application/json'};
    if(body !== undefined)headers['content-type'] = 'application/json';
    if(identity) {headers['x-device-id'] = identity.deviceId;headers.authorization = 'Bearer '+identity.deviceToken;}
    try {
      const response = await fetch(API+path,{method,headers,cache:'no-store',credentials:'same-origin',signal:controller.signal,...(body !== undefined ? {body:JSON.stringify(body)} : {})});
      let data;
      try { data = await response.json(); } catch {throw new Error('CONNECTION_FAILED');}
      if(!response.ok) {
        const error = new Error(typeof data?.code === 'string' ? data.code : 'CONNECTION_FAILED');
        if(Number.isInteger(data?.retryAfterSeconds) && data.retryAfterSeconds>=0 && data.retryAfterSeconds<=3600)error.retryAfterSeconds=data.retryAfterSeconds;
        else {const seconds=response.headers.get('retry-after');if(/^\d{1,4}$/.test(seconds || '') && Number(seconds)<=3600)error.retryAfterSeconds=Number(seconds);}
        if(typeof data?.reason === 'string')error.reason=data.reason;
        throw error;
      }
      return data;
    } catch(error) {if(error?.name === 'AbortError')throw new Error('CONNECTION_FAILED');throw error instanceof Error ? error : new Error('CONNECTION_FAILED');}
    finally {clearTimeout(timer);}
  }
  async function findRegistration() {
    if(!('serviceWorker' in navigator))return null;
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      if(existing)return existing;
      let timer;
      try {return await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>{timer = setTimeout(()=>resolve(null),4500);})]);}
      finally {clearTimeout(timer);}
    } catch {return null;}
  }
  function preload(force=false) {
    if(!serverEnabled)return Promise.resolve();
    if(preloading)return preloading;
    if(!force && loadedAt && Date.now()-loadedAt < 60000)return Promise.resolve();
    loadedAt = Date.now();
    preloading = Promise.all([
      request('/config',{timeout:8000}).then(value=>{
        if(!value || typeof value !== 'object')throw new Error('INVALID_CONFIGURATION');
        if(value.available === true)decode(value.publicKey);
        configuration = {available:value.available === true,deliveryReady:value.deliveryReady === true,publicKey:value.publicKey,leadMinutes:30};
        configError = false;
      }).catch(()=>{configuration = null;configError = true;}),
      findRegistration().then(value=>{registration = value;})
    ]).finally(()=>{preloading = null;render();queueSync();queueDelete();});
    render();
    return preloading;
  }
  function availability() {
    const issue = supportIssue();
    if(issue)return issue;
    if(configError)return '알림 서버에 연결하지 못했어요. 잠시 후 다시 연결해 주세요.';
    if(!configuration)return '알림 연결을 확인하고 있어요.';
    if(configuration.available !== true || configuration.deliveryReady !== true)return '자동 알림 서비스를 준비하고 있어요. 연결이 완료되면 켤 수 있어요.';
    if(!registration)return '앱의 알림 기능을 준비하고 있어요. 잠시 후 다시 연결해 주세요.';
    if(!profile())return '위치를 먼저 설정해 주세요. 알림은 마지막으로 연결한 위치를 기준으로 보내요.';
    return '';
  }
  function render() {
    const enabled = serverEnabled && record?.enabled === true;
    const pending = serverEnabled && record?.pendingDelete === true;
    const issue = availability();
    const status = busy ? '알림 연결을 변경하고 있어요.' : message || (pending ? '알림은 꺼졌어요. 서버에 저장된 정보 삭제를 완료하려면 다시 연결해 주세요.' : enabled ? issue || (syncing ? '바뀐 설정을 알림에 반영하고 있어요.' : '알림이 켜져 있어요.') : issue || '알림이 꺼져 있어요.');
    const disabled = busy || !enabled && (pending || !!issue || !consent);
    const time = dailyTime(),retrySeconds = Math.max(0,Math.ceil((testRetryUntil-Date.now())/1000));
    const policy='기온·날씨·옷차림·챙길 것을 알려드려요. 일정이 있는 날은 출발 30분 전, 일정이 없는 날은 '+timeLabel(time)+'에 보내요.';
    const testLabel=retrySeconds>0 ? retrySeconds+'초 뒤 다시 테스트' : '테스트 알림 보내기';
    const markup = '<div class="notification-title"><h2>외출 알림</h2><button type="button" role="switch" aria-checked="'+enabled+'" class="notification-toggle" data-notification-action="'+(enabled ? 'off' : 'on')+'" '+(disabled ? 'disabled' : '')+'><span aria-hidden="true" class="notification-switch-track"><span></span></span><span>'+(enabled ? '알림 끄기' : '알림 켜기')+'</span></button></div>'
      +'<p class="notification-policy">'+policy+'</p>'
      +'<label class="notification-time"><span>일정 없는 날 알림 시간</span><input type="time" step="60" required value="'+time+'" data-notification-time aria-label="일정 없는 날 알림 시간" '+(serverEnabled ? '' : 'disabled')+'></label>'
      +(!serverEnabled ? '' : enabled ? '<p class="notification-privacy">마지막으로 연결한 위치와 저장한 일정·체감 설정을 사용해요. 알림을 끄면 서버에서 삭제해요.</p>' : pending ? '' : '<label class="notification-consent"><input type="checkbox" data-notification-consent '+(consent ? 'checked' : '')+' '+(busy ? 'disabled' : '')+'><span>알림을 위해 위치·일정·체감 설정을 서버에 저장하는 데 동의해요.</span></label>')
      +'<p class="notification-status" data-notification-status role="status" aria-live="polite">'+escape(status)+'</p>'
      +'<div class="notification-actions">'+(enabled && !issue ? '<button type="button" class="text-action" data-notification-action="test" '+(busy || syncing || retrySeconds>0 ? 'disabled' : '')+'>'+testLabel+'</button>' : '')
      +(serverEnabled && !busy && (pending || configError || !registration || configuration && (!configuration.available || !configuration.deliveryReady)) ? '<button type="button" class="text-action" data-notification-action="retry">다시 연결</button>' : '')+'</div>';
    document.querySelectorAll('[data-notification-settings]').forEach(host=>{
      if(host.dataset.notificationMarkup === markup)return;
      const focused = host.contains(document.activeElement) ? document.activeElement : null;
      const focusAction = focused?.getAttribute('data-notification-action');
      const focusConsent = focused?.hasAttribute('data-notification-consent');
      const focusTime = focused?.hasAttribute('data-notification-time');
      if(focusTime) {
        // Preserve the native mobile time picker while status/cooldown changes.
        host.querySelector('.notification-policy').textContent=policy;
        host.querySelector('[data-notification-status]').textContent=status;
        const testButton=host.querySelector('[data-notification-action=test]');
        if(testButton) {testButton.textContent=testLabel;testButton.disabled=busy || syncing || retrySeconds>0;}
        return;
      }
      host.innerHTML = markup;
      host.dataset.notificationMarkup = markup;
      if(focusAction)host.querySelector('[data-notification-action="'+focusAction+'"]')?.focus({preventScroll:true});
      else if(focusConsent)host.querySelector('[data-notification-consent]')?.focus({preventScroll:true});
      else if(focusTime)host.querySelector('[data-notification-time]')?.focus({preventScroll:true});
    });
  }
  function friendly(error) {
    if(error?.message==='TEST_RATE_LIMITED')return '테스트 알림은 '+Math.max(1,error.retryAfterSeconds || 60)+'초 뒤 다시 보낼 수 있어요.';
    if(error?.message==='PUSH_UNAVAILABLE') {
      const reasons={BAD_AUTHORIZATION:'알림 발송 인증을 확인하고 있어요.',INVALID_VAPID:'알림 발송 인증을 확인하고 있어요.',BAD_PAYLOAD:'알림 내용을 전송하지 못했어요.',SUBSCRIPTION_EXPIRED:'기기의 알림 연결이 만료됐어요.',PUSH_RATE_LIMITED:'기기의 알림 서비스가 요청을 잠시 제한하고 있어요.',PUSH_PROVIDER_UNAVAILABLE:'기기의 알림 서비스가 잠시 응답하지 않아요.',PUSH_NETWORK_ERROR:'알림 서비스에 연결하지 못했어요.'};
      return (reasons[error.reason] || '기기로 알림을 보내지 못했어요.')+' '+Math.max(1,error.retryAfterSeconds || 10)+'초 뒤 다시 시도해 주세요.';
    }
    return ({STORAGE_UNAVAILABLE:'알림 연결 정보를 저장하지 못했어요. 브라우저 저장 공간을 허용해 주세요.',TEST_RATE_LIMITED:'테스트 알림은 1분 뒤 다시 보낼 수 있어요.',UNAUTHORIZED:'알림 연결이 만료됐어요. 알림을 껐다가 다시 켜 주세요.',SUBSCRIPTION_EXPIRED:'알림 연결이 만료됐어요. 다시 켜 주세요.',INVALID_LOCATION:'위치를 다시 연결한 뒤 시도해 주세요.',INVALID_SCHEDULE:'일정을 확인한 뒤 다시 시도해 주세요.',INVALID_CONFIGURATION:'알림 서비스 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.',DELIVERY_PAUSED:'자동 알림 연결이 잠시 중단되어 있어요. 다시 연결해 주세요.'})[error?.message] || '알림을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  async function subscription() {return registration ? registration.pushManager.getSubscription() : null;}
  async function unsubscribe() {try {const value = await subscription();return value ? await value.unsubscribe() !== false : true;}catch {return false;}}
  async function enable() {
    if(busy || record?.enabled || !consent || availability() || record?.pendingDelete)return;
    // Request synchronously from the explicit button gesture, before any await.
    let permission;
    try {permission = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();}
    catch {message = '알림 권한 창을 열지 못했어요. 기기의 알림 설정을 확인해 주세요.';render();return;}
    busy = true;message = '';render();
    let identity = record,posted = false;
    try {
      if(await permission !== 'granted') {message = '알림이 허용되지 않았어요. 원할 때 다시 켤 수 있어요.';return;}
      identity = identity || newRecord();
      saveRecord({...identity,enabled:false,pendingDelete:false});
      let value = await subscription();
      if(value) {await value.unsubscribe();value = null;}
      if(!value)value = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(configuration.publicKey)});
      const snapshot = profile();
      if(!snapshot)throw new Error('INVALID_LOCATION');
      posted = true;
      serverWrite = request('/subscription',{method:'POST',body:{...snapshot,deviceId:identity.deviceId,deviceToken:identity.deviceToken,subscription:value.toJSON()}});
      const saved = await serverWrite;
      if(saved.enabled !== true || saved.deliveryReady !== true) {if(configuration)configuration.deliveryReady = false;throw new Error('DELIVERY_PAUSED');}
      generation++;
      saveRecord({...identity,enabled:true,pendingDelete:false});
      lastSignature = JSON.stringify(snapshot);
      consent = false;
      message = '알림이 켜졌어요. 일정과 날씨에 맞춰 알려드릴게요.';
    } catch(error) {
      await unsubscribe();
      if(identity && posted) {
        try {await request('/subscription',{method:'DELETE',identity});saveRecord(null);}
        catch {try {saveRecord({...identity,enabled:false,pendingDelete:true});}catch {}}
      } else if(identity) {try {saveRecord(null);}catch {}}
      message = friendly(error);
    } finally {busy = false;render();queueSync();}
  }
  async function disable() {
    if(!serverEnabled || busy || !record)return;
    generation++;clearTimeout(syncTimer);syncTimer = null;
    busy = true;message = '';lastSignature = '';
    const identity = {...record,enabled:false,pendingDelete:true};
    try {saveRecord(identity);} catch {record = identity;}
    render();
    // A deletion must follow any in-flight profile write, so an older response
    // cannot recreate a subscription after the user switches notifications off.
    await serverWrite.catch(()=>{});
    const browserStopped = await unsubscribe();
    try {
      await request('/subscription',{method:'DELETE',identity});
      saveRecord(null);
      message = '알림을 껐어요. 서버에 저장된 위치와 일정도 삭제했어요.';
    } catch(error) {
      if(error?.message === 'UNAUTHORIZED' || error?.message === 'SUBSCRIPTION_EXPIRED') {
        try {saveRecord(null);} catch {record = null;}
        message = '알림을 껐어요.';
      } else {
        deleteRetryAt = Date.now()+30000;
        message = browserStopped ? '브라우저 알림을 껐어요. 연결이 돌아오면 서버에 저장된 정보 삭제를 다시 시도해요.' : '알림 해제를 완료하지 못했어요. 다시 연결해 주세요.';
      }
    } finally {busy = false;render();}
  }
  function queueDelete() {
    if(serverEnabled && record?.pendingDelete && !busy && configuration?.available && Date.now() >= deleteRetryAt)void disable();
  }
  function queueSync() {
    if(!record?.enabled || busy || syncing || !configuration?.available || !configuration.deliveryReady || !registration || supportIssue())return;
    const snapshot = profile();
    if(!snapshot || JSON.stringify(snapshot) === lastSignature)return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(()=>{syncTimer = null;void syncProfile();},700);
  }
  async function syncProfile() {
    if(!serverEnabled || !record?.enabled || busy || syncing)return;
    const snapshot = profile();
    if(!snapshot)return;
    const signature = JSON.stringify(snapshot);
    if(signature === lastSignature)return;
    const identity = {...record},operation = generation;
    syncing = true;render();
    try {
      if(Notification.permission !== 'granted')throw new Error('SUBSCRIPTION_EXPIRED');
      const value = await subscription();
      if(!value)throw new Error('SUBSCRIPTION_EXPIRED');
      if(operation !== generation || !record?.enabled)return;
      serverWrite = request('/subscription',{method:'POST',body:{...snapshot,deviceId:identity.deviceId,deviceToken:identity.deviceToken,subscription:value.toJSON()}});
      const saved = await serverWrite;
      if(operation !== generation || !record?.enabled)return;
      if(saved.enabled !== true || saved.deliveryReady !== true) {if(configuration)configuration.deliveryReady = false;throw new Error('DELIVERY_PAUSED');}
      lastSignature = signature;message = '';
    } catch(error) {
      if(operation !== generation || !record?.enabled)return;
      message = friendly(error);
      if(['UNAUTHORIZED','SUBSCRIPTION_EXPIRED'].includes(error?.message)) {
        await unsubscribe();
        try {await request('/subscription',{method:'DELETE',identity});saveRecord(null);}
        catch(cleanupError) {
          if(['UNAUTHORIZED','SUBSCRIPTION_EXPIRED'].includes(cleanupError?.message)) {try {saveRecord(null);} catch {record = null;}}
          else {try {saveRecord({...identity,enabled:false,pendingDelete:true});} catch {record = {...identity,enabled:false,pendingDelete:true};}deleteRetryAt = Date.now()+30000;}
        }
        consent = false;lastSignature = '';
      }
    } finally {syncing = false;render();if(lastSignature === signature)queueSync();}
  }
  async function test() {
    if(busy || syncing || !record?.enabled || availability() || Date.now()<testRetryUntil)return;
    busy = true;message = '';render();
    try {const result = await request('/test',{method:'POST',identity:record,body:{}});message = result.sent === true ? '테스트 알림을 보냈어요. 기기의 상단 알림이나 잠금화면을 확인해 주세요.' : '테스트 알림을 보내지 못했어요.';if(result.sent===true)setTestRetry(result.retryAfterSeconds ?? 60);}
    catch(error) {
      message = friendly(error);
      if(error?.retryAfterSeconds!==undefined || ['PUSH_UNAVAILABLE','TEST_RATE_LIMITED'].includes(error?.message))setTestRetry(error.retryAfterSeconds ?? (error.message==='TEST_RATE_LIMITED' ? 60 : 10));
      if(error?.message==='SUBSCRIPTION_EXPIRED') {await unsubscribe();try {saveRecord(null);}catch {record=null;}consent=false;lastSignature='';}
    }
    finally {busy = false;render();}
  }
  function setTestRetry(seconds) {
    if(!Number.isInteger(seconds) || seconds<0 || seconds>3600)return;
    testRetryUntil=Date.now()+seconds*1000;clearTimeout(testRetryTimer);
    const tick=()=>{render();if(Date.now()<testRetryUntil)testRetryTimer=setTimeout(tick,1000);else testRetryTimer=null;};
    if(seconds>0)testRetryTimer=setTimeout(tick,1000);
  }
  function refresh() {render();if(!serverEnabled)return;void preload();queueSync();queueDelete();}
  document.addEventListener('change',event=>{
    if(!serverEnabled)return;
    if(event.target.matches?.('[data-notification-consent]') && event.target.closest('[data-notification-settings]')) {consent = event.target.checked;render();}
    if(event.target.matches?.('[data-notification-time]') && event.target.closest('[data-notification-settings]')) {
      const value=event.target.value;
      if(!validTime(value)) {event.target.value=dailyTime();message='알림 시간을 시:분으로 선택해 주세요.';render();return;}
      event.target.dispatchEvent(new CustomEvent('chaenggim:daily-notification-time',{bubbles:true,detail:{value}}));
      const saved=readSnapshot()?.dailyNotificationTime===value;
      if(!saved)event.target.value=dailyTime();
      message=saved ? '일정 없는 날은 '+timeLabel(value)+'에 알려드릴게요.' : '알림 시간을 저장하지 못했어요. 다시 선택해 주세요.';
      render();queueSync();
    }
  });
  document.addEventListener('focusout',event=>{if(event.target.matches?.('[data-notification-time]'))queueMicrotask(render);});
  document.addEventListener('click',event=>{
    if(!serverEnabled)return;
    const button = event.target.closest?.('[data-notification-action]');
    if(!button || button.disabled || !button.closest('[data-notification-settings]'))return;
    const action = button.dataset.notificationAction;
    if(action === 'on')void enable();
    else if(action === 'off')void disable();
    else if(action === 'test')void test();
    else if(action === 'retry') {message = '';deleteRetryAt = 0;void preload(true).then(()=>{queueDelete();queueSync();render();});}
  });
  window.ChaenggimNotifications = Object.freeze({refresh});
  readRecord();
  refresh();
})();
