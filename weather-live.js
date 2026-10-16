(() => {
  'use strict';
  const root = document.getElementById('weather-ready-app');
  const main = root.querySelector('[data-main]');
  const toast = root.querySelector('[data-toast]');
  const STORAGE = 'chaenggim-weather-v5';
  const names = {daily:'일상',commute:'출근',exercise:'운동',walk:'산책',trip:'나들이',appointment:'약속'};
  const dayNames = ['월','화','수','목','금','토','일'];
  const state = {version:5,nav:'home',paletteIndex:0,locationMode:'gps',location:null,locationSetupDone:false,schedules:[],preference:'normal',dailyNotificationTime:'07:00'};
  let weather = null, forecast = [], air = null, airError = '', weatherError = '';
  let weatherLoading = false, gpsLoading = false, locationMessage = '', locationOpen = true;
  let editor = null, undo = null, toastTimer = null, lastOwnSnapshot = null;
  let searchQuery = '', searchResults = [], searchBusy = false, searchError = '';
  let requestId = 0, searchId = 0, locationIntent = 0;
  let forecastController = null, airController = null, searchController = null, addressController = null;
  let addressPendingIntent = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = (name, size=16) => '<i data-lucide="'+name+'" aria-hidden="true" style="width:'+size+'px;height:'+size+'px"></i>';
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const rounded = value => number(value) ? Math.round(value) : '—';
  const degrees = value => rounded(value) + (number(value) ? '°' : '');
  const percent = value => number(value) ? Math.round(value)+'%' : '—';
  const hour = value => { const [h,m] = value.split(':').map(Number); return h+m/60; };
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  const validLocation = value => value && number(value.latitude) && Math.abs(value.latitude)<=90 && number(value.longitude) && Math.abs(value.longitude)<=180 && typeof value.name==='string' && value.name.length<=160 && ['gps','manual'].includes(value.source);
  const isSchedule = value => value && typeof value.id==='string' && ['repeat','once'].includes(value.kind) && typeof value.name==='string' && value.name.trim().length>0 && value.name.length<=40 && Object.hasOwn(names,value.purpose) && validTime(value.start) && validTime(value.end) && hour(value.start)<hour(value.end) && (value.kind==='once' ? validDate(value.date) : Array.isArray(value.days) && value.days.length>0 && value.days.every(d=>Number.isInteger(d)&&d>=0&&d<7));
  const isDefaultSchedule = value => value.kind==='repeat'&&JSON.stringify([...value.days].sort())==='[0,1,2,3,4]'&&((value.id==='commute'&&value.name==='출근'&&value.purpose==='commute'&&value.start==='08:00'&&value.end==='18:00')||(value.id==='exercise'&&value.name==='운동'&&value.purpose==='exercise'&&value.start==='19:00'&&value.end==='20:00'));
  const wardrobe = [
    {n:'아이보리',c:'#f0eadc',light:9,neutral:true},{n:'화이트',c:'#f5f4ef',light:10,neutral:true},{n:'크림',c:'#e9dfcc',light:9,neutral:true},{n:'오트밀',c:'#d0c4b1',light:8,neutral:true},{n:'베이지',c:'#bca68a',light:7,neutral:true},{n:'토프',c:'#968a7d',light:6,neutral:true},{n:'카멜',c:'#ac875c',light:6,neutral:true},{n:'초콜릿',c:'#604a3c',light:3,neutral:true},{n:'블랙',c:'#292b2e',light:1,neutral:true},{n:'차콜',c:'#52565c',light:3,neutral:true},{n:'네이비',c:'#283c54',light:2,neutral:true},{n:'그레이',c:'#999d9e',light:6,neutral:true},{n:'라이트 그레이',c:'#cacbc7',light:8,neutral:true},{n:'연청',c:'#86a5bf',light:7,neutral:true},{n:'진청',c:'#42637f',light:3,neutral:true},{n:'세이지',c:'#9aaa92',light:7,neutral:false},{n:'올리브',c:'#647054',light:4,neutral:false},{n:'더스티 블루',c:'#8d9eaf',light:6,neutral:false},{n:'스카이 블루',c:'#aacbdc',light:8,neutral:false},{n:'더스티 핑크',c:'#b28b91',light:6,neutral:false},{n:'버건디',c:'#804350',light:3,neutral:false},
    {n:'코발트 블루',c:'#315fe8',light:5,neutral:false,vivid:true},{n:'에메랄드',c:'#15996f',light:5,neutral:false,vivid:true},{n:'코랄',c:'#f36b63',light:7,neutral:false,vivid:true},{n:'선샤인 옐로',c:'#f5c542',light:8,neutral:false,vivid:true},{n:'바이올렛',c:'#8c5be5',light:6,neutral:false,vivid:true},{n:'탠저린',c:'#f1843d',light:7,neutral:false,vivid:true},{n:'체리 레드',c:'#de4551',light:5,neutral:false,vivid:true},{n:'푸시아',c:'#d8509b',light:6,neutral:false,vivid:true},{n:'터쿼이즈',c:'#23afaa',light:6,neutral:false,vivid:true}
  ];
  const tops=wardrobe.filter(x=>!['카멜','토프'].includes(x.n));
  const bottoms=wardrobe.filter(x=>x.neutral&&x.n!=='화이트');
  const outers=wardrobe.filter(x=>!['화이트','연청','진청','스카이 블루','더스티 핑크'].includes(x.n));
  const paletteCandidates=[];
  for(const top of tops) for(const bottom of bottoms) for(const outer of outers) {
    if(top.n===bottom.n||outer.n===top.n||outer.n===bottom.n) continue;
    if([top,bottom,outer].filter(c=>!c.neutral).length>1) continue;
    if(Math.abs(top.light-bottom.light)<2&&Math.abs(outer.light-bottom.light)<3) continue;
    paletteCandidates.push([top,bottom,outer]);
  }
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const variedOrder=items=>{
    if(items.length<2)return items.slice();
    let step=137;
    while(gcd(step,items.length)!==1)step++;
    return items.map((_,i)=>items[i*step%items.length]);
  };
  // Rotate accent hues and garment roles; keep each outfit to one color accent.
  const vividGroups=wardrobe.filter(c=>c.vivid).map(accent=>{
    const top=variedOrder(paletteCandidates.filter(p=>p[0]===accent));
    const outer=variedOrder(paletteCandidates.filter(p=>p[2]===accent));
    return Array.from({length:Math.max(top.length,outer.length)},(_,i)=>[top[i],outer[i]]).flat().filter(Boolean);
  });
  const vividPalettes=[];
  for(let i=0;vividGroups.some(group=>group[i]);i++)for(const group of vividGroups)if(group[i])vividPalettes.push(group[i]);
  const preferred=vividPalettes.findIndex(p=>p[0].n==='코발트 블루'&&p[1].n==='네이비'&&p[2].n==='아이보리');
  if(preferred>0)[vividPalettes[0],vividPalettes[preferred]]=[vividPalettes[preferred],vividPalettes[0]];
  const calmPalettes=variedOrder(paletteCandidates.filter(p=>!p.some(c=>c.vivid)));
  const palettes=[];
  const paletteGroups=Math.min(Math.floor(vividPalettes.length/3),calmPalettes.length);
  for(let i=0;i<paletteGroups;i++)palettes.push(...vividPalettes.slice(i*3,i*3+3),calmPalettes[i]);
  const paletteStep=1;

  function hydrate(value) {
    const saved=value?.privateContent||value?.modelContent||value;
    if(!saved||![2,3,4,5].includes(saved.version)) return;
    if(['home','hourly','settings'].includes(saved.nav)) state.nav=saved.nav;
    if(Array.isArray(saved.schedules)) {
      const ids=new Set();
      state.schedules=saved.schedules.filter(isSchedule).filter(s=>!isDefaultSchedule(s)).filter(s=>{if(ids.has(s.id))return false;ids.add(s.id);return true;}).map(s=>({...s,enabled:s.enabled!==false,excludeHoliday:!!s.excludeHoliday}));
    }
    if(Number.isInteger(saved.paletteIndex)) state.paletteIndex=((saved.paletteIndex%palettes.length)+palettes.length)%palettes.length;
    if(['gps','manual'].includes(saved.locationMode)) state.locationMode=saved.locationMode;
    if(['cold','normal','hot'].includes(saved.preference))state.preference=saved.preference;
    if(validTime(saved.dailyNotificationTime))state.dailyNotificationTime=saved.dailyNotificationTime;
    if(validLocation(saved.location)) state.location={...saved.location};
    if(saved.locationSetupDone===true||validLocation(saved.location))state.locationSetupDone=true;
  }
  function persist() {
    const snapshot={...state};
    lastOwnSnapshot=JSON.stringify(snapshot);
    try { localStorage.setItem(STORAGE,lastOwnSnapshot); } catch {}
    window.ChaenggimNotifications?.refresh();
    if(window.openai?.setWidgetState&&new TextEncoder().encode(lastOwnSnapshot).length<14500) {
      window.openai.setWidgetState({modelContent:{version:5,location:state.location?.name||null,locationMode:state.locationMode,scheduleCount:state.schedules.length},privateContent:snapshot}).catch(()=>{});
    }
  }
  function clockContext() {
    let parts;
    try { parts=new Intl.DateTimeFormat('en-GB',{timeZone:weather?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()); }
    catch { parts=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()); }
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    const date=p.year+'-'+p.month+'-'+p.day;
    const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
    return {date,weekday,hour:Number(p.hour)+Number(p.minute)/60,time:p.hour+':'+p.minute,key:date+'T'+p.hour+':00',label:Number(p.month)+'월 '+Number(p.day)+'일 '+dayNames[weekday]+' · '+p.hour+':'+p.minute,holiday:false};
  }
  function condition(code) {
    if(code===0) return '맑음';
    if(code===1||code===2) return '구름 조금';
    if(code===3) return '흐림';
    if(code===45||code===48) return '안개';
    if([71,73,75,77,85,86].includes(code)) return '눈';
    if([95,96,97,99].includes(code)) return '뇌우';
    if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '비';
    return '날씨 정보';
  }
  const wet = value => ['비','눈','비/눈','뇌우'].includes(value);
  function forecastIcon(row) { return globalThis.ChaenggimChart?.weatherIcon(row)||'cloud'; }
  function forecastTone(row) { return globalThis.ChaenggimChart?.weatherTone(row)||'cloudy'; }
  async function fetchJson(url, controller) {
    const timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw new Error(response.status===429?'요청이 많아요. 잠시 후 다시 시도해 주세요.':'정보를 불러오지 못했어요. 다시 시도해 주세요.');
      const data=await response.json();
      if(data.error) throw new Error('날씨 서비스에서 정보를 보내지 못했어요. 다시 시도해 주세요.');
      return data;
    } finally { clearTimeout(timer); }
  }
  function normalizeWeather(data) {
    if(!data.current||!number(data.current.temperature_2m)||!Array.isArray(data.hourly?.time)||!Array.isArray(data.hourly?.temperature_2m)||!Array.isArray(data.daily?.time)) throw new Error('날씨 정보가 완전하지 않아요. 다시 불러와 주세요.');
    const rows=data.hourly.time.map((stamp,i)=>({stamp,date:stamp.slice(0,10),hour:Number(stamp.slice(11,13)),temp:data.hourly.temperature_2m[i],feels:data.hourly.apparent_temperature?.[i],rain:data.hourly.precipitation_probability?.[i],condition:condition(data.hourly.weather_code?.[i]),isDay:data.hourly.is_day?.[i]===1})).filter(row=>validDate(row.date)&&number(row.temp)&&Number.isInteger(row.hour));
    if(rows.length<24) throw new Error('시간별 예보가 부족해요. 다시 불러와 주세요.');
    return {timezone:data.timezone||'Asia/Seoul',current:{temp:data.current.temperature_2m,feels:data.current.apparent_temperature,condition:condition(data.current.weather_code),isDay:data.current.is_day===1,precipitation:data.current.precipitation,time:data.current.time},daily:data.daily,rows,fetchedAt:Date.now(),source:'open-meteo',warnings:[],warningStatus:'unavailable'};
  }
  const koreaCoordinates = location => location.latitude>=33&&location.latitude<=38.8&&location.longitude>=124&&location.longitude<=132;
  function normalizeKmaWeather(data) {
    const timestamp = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)&&validDate(value.slice(0,10));
    const safeCondition = value => ['맑음','구름 조금','구름 많음','흐림','안개','눈','비','비/눈','뇌우','날씨 정보'].includes(value)?value:'날씨 정보';
    if(data.source!=='kma'||data.timezone!=='Asia/Seoul'||!number(data.current?.temp)||!timestamp(data.current.time)||!Array.isArray(data.rows)||!Array.isArray(data.daily?.time))throw new Error('Invalid KMA weather response.');
    const rows=data.rows.filter(row=>row&&timestamp(row.stamp)&&row.stamp.endsWith(':00')&&row.date===row.stamp.slice(0,10)&&row.hour===Number(row.stamp.slice(11,13))&&number(row.temp)).map(row=>({stamp:row.stamp,date:row.date,hour:row.hour,temp:row.temp,feels:number(row.feels)?row.feels:null,rain:number(row.rain)&&row.rain>=0&&row.rain<=100?row.rain:null,condition:safeCondition(row.condition),isDay:row.isDay===true})).sort((a,b)=>a.stamp.localeCompare(b.stamp));
    const uniqueRows=rows.filter((row,index)=>index===0||row.stamp!==rows[index-1].stamp);
    if(uniqueRows.length<24)throw new Error('Incomplete KMA hourly forecast.');
    const daily={time:[],temperature_2m_max:[],temperature_2m_min:[],sunrise:[],sunset:[]};
    data.daily.time.forEach((date,index)=>{if(!validDate(date))return;daily.time.push(date);for(const field of ['temperature_2m_max','temperature_2m_min'])daily[field].push(number(data.daily[field]?.[index])?data.daily[field][index]:null);for(const field of ['sunrise','sunset'])daily[field].push(timestamp(data.daily[field]?.[index])?data.daily[field][index]:null);});
    if(!daily.time.length)throw new Error('Incomplete KMA daily forecast.');
    const warningTimestamp=value=>timestamp(value)?value:typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16):null;
    const warnings=(Array.isArray(data.warnings)?data.warnings:[]).filter(item=>item&&typeof item.title==='string'&&item.title.length<=120&&['주의보','경보'].includes(item.level)).slice(0,8).map(item=>({id:String(item.id||''),title:item.title,level:item.level,region:typeof (item.regionName||item.region)==='string'?(item.regionName||item.region).slice(0,120):'',issuedAt:warningTimestamp(item.issuedAt),effectiveAt:warningTimestamp(item.effectiveAt)}));
    return {timezone:'Asia/Seoul',current:{temp:data.current.temp,feels:number(data.current.feels)?data.current.feels:null,condition:safeCondition(data.current.condition),isDay:data.current.isDay===true,precipitation:number(data.current.precipitation)?data.current.precipitation:null,time:data.current.time},daily,rows:uniqueRows,fetchedAt:Date.now(),source:'kma',feelsSource:data.feelsSource==='calculated'?'calculated':null,warnings,warningStatus:data.warningStatus==='ok'?'ok':'unavailable'};
  }
  async function loadKmaForecast(location,controller) {
    const localController=new AbortController();
    const abort=()=>localController.abort();
    controller.signal.addEventListener('abort',abort,{once:true});
    if(controller.signal.aborted)localController.abort();
    const timer=setTimeout(abort,10000);
    try {
      const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),regionName:location.name==='현재 위치'?'':location.name});
      const response=await fetch('/api/weather?'+params,{signal:localController.signal,credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if(!response.ok){const error=new Error('KMA unavailable.');error.code=data?.code;throw error;}
      return normalizeKmaWeather(data);
    } finally {clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}
  }
  async function loadForecast(location,params,controller) {
    let fallbackCause='';
    if(window.ChaenggimConfig?.serverApi===true&&koreaCoordinates(location)) {
      if(/^https?:$/.test(window.location.protocol)) {
        try {return await loadKmaForecast(location,controller);}
        catch(error){if(controller.signal.aborted)throw error;fallbackCause=error.code==='KMA_KEY_MISSING'?'setup':'connection';}
      } else fallbackCause='setup';
    }
    const data=normalizeWeather(await fetchJson('https://api.open-meteo.com/v1/forecast?'+params,controller));
    return {...data,fallbackCause};
  }
  async function loadWeather(location=state.location) {
    if(!validLocation(location)) return;
    const id=++requestId;
    forecastController?.abort(); airController?.abort();
    forecastController=new AbortController(); airController=new AbortController();
    const weatherSignal=forecastController, airSignal=airController;
    const key=location.latitude+','+location.longitude;
    if(weather?.locationKey!==key) { weather=null;forecast=[];air=null; }
    weatherLoading=true;weatherError='';airError='';
    render();
    const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'temperature_2m,apparent_temperature,weather_code,is_day,precipitation',hourly:'temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day',daily:'temperature_2m_max,temperature_2m_min,sunrise,sunset',timezone:'auto',forecast_days:'3'});
    const aqParams=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'pm10,pm2_5',timezone:'auto'});
    await Promise.allSettled([
      (async()=>{
        try {
          const data=await loadForecast(location,params,weatherSignal);
          if(id!==requestId) return;
          weather={...data,locationKey:key};forecast=data.rows;weatherLoading=false;weatherError='';
        } catch(error) {
          if(id!==requestId) return;
          weatherLoading=false;
          weatherError=error.name==='AbortError'?'날씨 연결 시간이 초과됐어요. 다시 시도해 주세요.':(error instanceof TypeError?'인터넷 연결을 확인한 뒤 다시 시도해 주세요.':error.message);
        }
        if(!editor) render();
      })(),
      (async()=>{
        try {
          const data=await fetchJson('https://air-quality-api.open-meteo.com/v1/air-quality?'+aqParams,airSignal);
          if(id!==requestId) return;
          air=data.current&& (number(data.current.pm10)||number(data.current.pm2_5))?data.current:null;
          if(!air) airError='미세먼지 예보를 불러오지 못했어요.';
        } catch { if(id!==requestId)return; air=null;airError='미세먼지 예보를 불러오지 못했어요.'; }
        if(!editor) render();
      })()
    ]);
  }
  function chooseLocation(location) {
    if(!validLocation(location))return;
    locationIntent++;
    addressController?.abort();addressPendingIntent=0;
    searchId++;searchController?.abort();searchBusy=false;
    gpsLoading=false;locationMessage='';locationOpen=false;searchResults=[];searchError='';
    state.location=location;state.locationMode=location.source;state.locationSetupDone=true;
    persist();loadWeather(location);
  }
  function useGps() {
    const intent=++locationIntent;
    addressController?.abort();addressPendingIntent=0;
    gpsLoading=true;locationMessage='현재 위치를 찾고 있어요. 위치 권한을 허용해 주세요.';
    render();
    const fail=message=>{if(intent!==locationIntent)return;gpsLoading=false;locationMessage=message;locationOpen=true;render();};
    if(!window.isSecureContext) { fail('현재 위치는 HTTPS 또는 localhost에서 사용할 수 있어요. 지역을 직접 검색해 주세요.');return; }
    if(!navigator.geolocation) { fail('이 브라우저에서는 현재 위치를 가져올 수 없어요. 지역을 직접 검색해 주세요.');return; }
    navigator.geolocation.getCurrentPosition(position=>{
      if(intent!==locationIntent) return;
      const {latitude,longitude,accuracy}=position.coords;
      if(!number(latitude)||!number(longitude)) {fail('현재 위치를 확인하지 못했어요. 지역을 직접 검색해 주세요.');return;}
      const location={latitude,longitude,name:'현재 위치',source:'gps',accuracy:number(accuracy)?Math.round(accuracy):null};
      chooseLocation(location);
      resolveGpsAddress(location,locationIntent);
    },error=>fail(error.code===1?'위치 권한이 꺼져 있어요. 브라우저에서 허용하거나 지역을 직접 검색해 주세요.':error.code===3?'현재 위치를 찾는 시간이 초과됐어요. 다시 시도하거나 지역을 검색해 주세요.':'현재 위치를 확인하지 못했어요. 지역을 직접 검색해 주세요.'),{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
  }
  async function searchPlaces(form) {
    locationIntent++;gpsLoading=false;locationMessage='';
    addressController?.abort();addressPendingIntent=0;
    searchQuery=String(new FormData(form).get('place')||'').trim();
    const id=++searchId;searchController?.abort();searchController=new AbortController();
    searchResults=[];searchError='';
    if([...searchQuery].length<2) { searchError='지역 이름을 두 글자 이상 입력해 주세요.';render();root.querySelector('[name=place]')?.focus();return; }
    searchBusy=true;render();
    try {
      const cityAliases={'서울':'Seoul','서울시':'Seoul','서울특별시':'Seoul','부산':'Busan','부산시':'Busan','부산광역시':'Busan','대구':'Daegu','인천':'Incheon','광주':'Gwangju','대전':'Daejeon','울산':'Ulsan','세종':'Sejong','제주':'Jeju','제주시':'Jeju','제주도':'Jeju'};
      const params=new URLSearchParams({name:cityAliases[searchQuery]||searchQuery,count:'8',language:'ko',format:'json'});
      if(Object.hasOwn(cityAliases,searchQuery))params.set('countryCode','KR');
      const data=await fetchJson('https://geocoding-api.open-meteo.com/v1/search?'+params,searchController);
      if(id!==searchId)return;
      searchResults=(data.results||[]).filter(p=>number(p.latitude)&&number(p.longitude)&&typeof p.name==='string').map(p=>({latitude:p.latitude,longitude:p.longitude,name:[...new Set([p.name,p.admin1,p.country].filter(Boolean))].join(' · '),source:'manual'}));
      if(!searchResults.length) searchError='검색 결과가 없어요. 시·군·구 이름이나 영문 이름으로 검색해 주세요.';
    } catch(error) {if(id!==searchId)return;searchError=error.name==='AbortError'?'지역 검색 시간이 초과됐어요. 다시 시도해 주세요.':'지역 검색에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';}
    searchBusy=false;render();
  }
  function regionAddress(data) {
    const country=typeof data.countryName==='string'?data.countryName.trim():'';
    const clean=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' '):'';
    const administrative=(Array.isArray(data.localityInfo?.administrative)?data.localityInfo.administrative:[])
      .filter(item=>item&&typeof item.name==='string'&&(!number(item.adminLevel)||item.adminLevel>2))
      .sort((a,b)=>(a.order||0)-(b.order||0)).map(item=>clean(item.name)).filter(name=>name&&name!==country);
    const parts=administrative.length?[clean(data.principalSubdivision),...administrative]:[data.principalSubdivision,data.city].map(clean);
    parts.push(clean(data.locality));
    if(data.countryCode!=='KR'&&country)parts.unshift(country);
    const seen=new Set(),result=[];
    for(const part of parts) {
      if(!part)continue;
      // Avoid '서울특별시 서울' when the provider uses both long and short names.
      const key=/^(서울|부산|대구|인천|광주|대전|울산|세종)(특별자치시|특별시|광역시|시)?$/.test(part)?part.replace(/(특별자치시|특별시|광역시|시)$/,''):part;
      if(!seen.has(key)){seen.add(key);result.push(part);}
    }
    return result.join(' ').slice(0,160);
  }
  function locationName() {
    const selected=state.location;
    if(!selected)return '위치를 선택해 주세요';
    if(selected.source==='gps'&&selected.name==='현재 위치')return addressPendingIntent===locationIntent?'현재 위치 · 주소 확인 중…':'현재 위치 · 주소 확인 불가';
    return selected.name;
  }
  function renderLocationLabel() {
    root.querySelectorAll('[data-header-location], [data-current-address]').forEach(label=>{label.textContent=locationName();label.title=locationName();});
  }
  async function resolveGpsAddress(location,intent) {
    // This endpoint is used only with a fresh browser Geolocation result, never saved/manual coordinates.
    addressController=new AbortController();
    const controller=addressController;
    addressPendingIntent=intent;
    renderLocationLabel();
    try {
      const params=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),localityLanguage:'ko'});
      const data=await fetchJson('https://api.bigdatacloud.net/data/reverse-geocode-client?'+params,controller);
      if(intent!==locationIntent||state.location!==location)return;
      if(typeof data.lookupSource==='string'&&/ip/i.test(data.lookupSource)&&!/reverse/i.test(data.lookupSource))throw new Error('Address is not GPS based.');
      const address=regionAddress(data);
      if(!address)throw new Error('Address unavailable.');
      state.location.name=address;persist();
      if(koreaCoordinates(location)&&/^https?:$/.test(window.location.protocol))loadWeather(location);
    } catch { /* The weather remains usable if address lookup is unavailable. */ }
    finally {
      if(intent===locationIntent&&state.location===location){
        addressPendingIntent=0;
        renderLocationLabel();
        const meta=main.querySelector('[data-hourly-location]');if(meta)meta.textContent=locationName()+' · 앞으로 24시간';
      }
    }
  }
  function airGrade(value,cutoffs) {
    if(!number(value)||value<0)return {label:'정보 없음',level:'unknown'};
    const concentration=Math.round(value);
    const index=cutoffs.findIndex(limit=>concentration<=limit);
    return [{label:'좋음',level:'good'},{label:'보통',level:'normal'},{label:'나쁨',level:'bad'},{label:'매우 나쁨',level:'very-bad'}][index<0?3:index];
  }
  function airMarkup() {
    if(!air)return '<div class="air-quality" aria-label="미세먼지 예보">'+icon('wind')+'<span>'+esc(airError||'미세먼지 예보를 불러오는 중…')+'</span></div>';
    const pm10=airGrade(air.pm10,[30,80,150]),pm25=airGrade(air.pm2_5,[15,35,75]);
    return '<div class="air-quality" aria-label="미세먼지 '+pm10.label+' · 초미세먼지 '+pm25.label+'">'+icon('wind')+'<div class="air-pollutants"><span>미세먼지 <b data-air-pm10 data-level="'+pm10.level+'">'+pm10.label+'</b></span><span>초미세먼지 <b data-air-pm25 data-level="'+pm25.level+'">'+pm25.label+'</b></span></div></div>';
  }
  function todaySchedules(sc=clockContext()) {
    return state.schedules.filter(s=>s.enabled&&(s.kind==='once'?s.date===sc.date:s.days.includes(sc.weekday)&&!(sc.holiday&&s.excludeHoliday))).sort((a,b)=>hour(a.start)-hour(b.start)||(a.kind!==b.kind?(a.kind==='once'?-1:1):a.name.localeCompare(b.name)));
  }
  function resolve() {
    const sc=clockContext(),today=todaySchedules(sc);
    const active=today.filter(s=>hour(s.start)<=sc.hour&&hour(s.end)>sc.hour).sort((a,b)=>(a.kind!==b.kind?(a.kind==='once'?-1:1):hour(b.start)-hour(a.start)))[0];
    const selected=active||today.find(s=>hour(s.start)>sc.hour)||null;
    const from=selected?Math.max(sc.hour,hour(selected.start)):sc.hour,end=selected?hour(selected.end):24;
    const nowRow=forecast.find(f=>f.stamp===sc.key)||forecast.find(f=>f.stamp>=sc.key)||forecast.at(-1);
    const points=forecast.filter(f=>f.date===sc.date&&f.hour>=Math.floor(from)&&f.hour<Math.min(24,Math.ceil(end)));
    const temperatures=points.length?points.map(f=>f.temp):[nowRow?.temp].filter(number);
    const probabilities=points.map(f=>f.rain).filter(number);
    const now=weather?{...weather.current,rain:nowRow?.rain}:null;
    const dailyIndex=weather?weather.daily.time.indexOf(sc.date):-1;
    const advice=window.ChaenggimAdvice?.analyze({rows:forecast,current:now,schedule:selected,now:sc,timeZone:weather?.timezone||'Asia/Seoul',preference:state.preference});
    return {sc,today,selected,active:!!active,from,end,lo:temperatures.length?Math.min(...temperatures):null,hi:temperatures.length?Math.max(...temperatures):null,pop:probabilities.length?Math.max(...probabilities):0,purpose:selected?selected.purpose:'daily',now,advice,high:weather?.daily.temperature_2m_max?.[dailyIndex],low:weather?.daily.temperature_2m_min?.[dailyIndex],upcoming:forecast.filter(f=>f.stamp>=sc.key)};
  }
  function icons() { if(globalThis.lucide)lucide.createIcons({attrs:{width:16,height:16}}); }
  function locationMarkup() {
    const selected=state.location;
    const settings=state.nav==='settings';
    if(!settings&&(state.nav!=='home'||selected||state.locationSetupDone))return '';
    const head=settings?'<div class="section-heading"><h2>위치</h2></div><div class="location-toolbar"><div class="location-select">'+icon('map-pin')+'<span data-current-address>'+esc(locationName())+'</span></div>'+(selected?'<button type="button" data-action="refresh" class="refresh-button" aria-label="날씨 새로고침" '+(weatherLoading?'disabled':'')+'>'+icon('refresh-cw')+'</button>':'')+'</div>':'<h2 class="location-setup-title">날씨를 볼 지역을 정해 주세요</h2>';
    return '<section class="location-editor" data-location-source="'+esc(selected?.source||'')+'" aria-label="위치 설정">'+head+'<button type="button" data-action="gps" class="gps-button" '+(gpsLoading?'disabled':'')+'>'+icon('locate-fixed')+(gpsLoading?'현재 위치 찾는 중…':'현재 위치로 자동 설정')+'</button><form data-location-form><label for="wr-place">지역 직접 지정</label><div class="place-search"><input id="wr-place" name="place" type="search" maxlength="80" autocomplete="off" placeholder="예: 서울, 부산, Jeju" value="'+esc(searchQuery)+'"><button type="submit" '+(searchBusy?'disabled':'')+'>'+(searchBusy?'검색 중…':'검색')+'</button></div></form>'+(locationMessage?'<p class="location-message" data-location-message role="status">'+esc(locationMessage)+'</p>':'')+(searchError?'<p class="location-message" role="status">'+esc(searchError)+'</p>':'')+(searchResults.length?'<ul class="place-results">'+searchResults.map((p,i)=>'<li><button type="button" data-place-result="'+i+'">'+icon('map-pin')+'<span>'+esc(p.name)+'</span>'+icon('chevron-right',14)+'</button></li>').join('')+'</ul>':'')+'</section>';
  }
  function weatherMarkup(r) {
    const appearance=window.ChaenggimWeatherCard?.presentation(r.now)||{kind:'unknown',phase:r.now.isDay?'day':'night',art:''};
    return '<section class="weather" data-weather-kind="'+esc(appearance.kind)+'" data-weather-phase="'+appearance.phase+'" aria-label="현재 날씨"><div class="weather-overview"><div class="weather-now"><b class="temperature">'+degrees(r.now.temp)+'</b><div class="condition">'+esc(r.now.condition)+(number(r.now.feels)?'<small>'+feelsLabel()+' '+degrees(r.now.feels)+'</small>':'')+'</div></div><div class="weather-art" aria-hidden="true">'+appearance.art+'</div></div><div class="metrics"><span>최고 <b>'+degrees(r.high)+'</b></span><span>최저 <b>'+degrees(r.low)+'</b></span><span>강수확률 <b>'+percent(r.now.rain)+'</b></span></div>'+airMarkup()+'</section>';
  }
  function feelsLabel() {return weather?.feelsSource==='calculated'?'체감(계산)':'체감';}
  function providerMarkup() {
    if(!weather)return '';
    const message=weather.fallbackCause==='setup'?'기상청 연결 준비 중 · 보조 예보 사용':weather.fallbackCause==='connection'?'기상청 연결이 원활하지 않아 보조 예보를 사용해요':weather.source==='kma'&&weather.warningStatus!=='ok'?'현재 위치의 기상특보를 확인하지 못했어요':'';
    return message?'<p class="forecast-provider-status" data-provider-status role="status">'+icon('info',14)+'<span>'+message+'</span></p>':'';
  }
  function warningMarkup() {
    if(weather?.source!=='kma'||!weather.warnings?.length)return '';
    const warningTime=value=>value?Number(value.slice(5,7))+'/'+Number(value.slice(8,10))+' '+value.slice(11,16):'';
    return '<section class="kma-warnings" aria-label="현재 지역 기상특보"><h2>'+icon('triangle-alert',17)+'기상특보</h2><ul>'+weather.warnings.map(item=>'<li data-warning-level="'+item.level+'"><b>'+esc(item.title.includes(item.level)?item.title:item.title+' '+item.level)+'</b><span>'+esc(item.region||locationName())+'</span>'+((item.issuedAt||item.effectiveAt)?'<small>'+[item.issuedAt?'발표 '+warningTime(item.issuedAt):'',item.effectiveAt?'발효 '+warningTime(item.effectiveAt):''].filter(Boolean).join(' · ')+'</small>':'')+'</li>').join('')+'</ul></section>';
  }
  function renderCredit() {
    const credit=root.querySelector('.data-credit');if(!credit)return;
    credit.hidden=state.nav!=='settings';
    const provider=weather?.source==='kma'?'<a href="https://www.weather.go.kr/" target="_blank" rel="noreferrer">기상청</a>':weather?'<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>'+(weather.fallbackCause?' (보조 예보)':''):'연결 대기';
    credit.dataset.weatherProvider=weather?.source||'pending';
    credit.innerHTML='날씨 '+provider+' · 지역 GeoNames<br>주소 <a href="https://www.bigdatacloud.com/" target="_blank" rel="noreferrer">BigDataCloud</a> · 미세먼지 CAMS 모델 예보';
  }
  function statusMarkup() {
    if(weatherError) return '<div class="weather-status error" data-weather-status role="status">'+icon('wifi-off')+'<div>'+esc(weatherError)+(weather?'<small>마지막으로 받은 날씨를 표시하고 있어요.</small>':'')+(state.nav==='settings'?'<button type="button" data-action="refresh">다시 시도</button>':'<button type="button" data-nav="settings">설정에서 다시 연결</button>')+'</div></div>';
    if(weatherLoading) return '<div class="weather-status" data-weather-status role="status">'+icon('refresh-cw')+'날씨를 불러오는 중…</div>';
    return '';
  }
  function prepItems(r) {
    const items=r.advice?.prepItems?.length?r.advice.prepItems:[{icon:'cloud',name:'시간별 예보를 기다리고 있어요',detail:'외출 시간의 예보가 연결되면 준비물을 알려드려요'}];
    return items.map(x=>'<li class="item-row"><span class="item-icon">'+icon(x.icon)+'</span><span class="item-copy"><b>'+esc(x.name)+'</b><small>'+esc(x.detail)+'</small></span></li>').join('');
  }
  function outfitMarkup(r) {
    const advice=r.advice, pieces=advice?.outfitPieces||[];
    const preference={cold:'추위를 많이 타요',normal:'보통이에요',hot:'더위를 많이 타요'}[state.preference];
    return '<div class="outfit-summary" aria-label="추천 옷차림"><h1>옷차림</h1><p>'+esc(pieces.length?pieces.join(' · '):'날씨가 연결되면 옷차림을 추천해 드려요.')+'</p><small>'+names[r.purpose]+' · '+preference+' · '+(advice?.outfitSource==='temperature'?'기온 기준':'체감온도 기준')+'</small></div>';
  }
  function paletteMarkup() { return '<div class="palette-set" role="group" aria-label="오늘의 색상 조합">'+palettes[state.paletteIndex].map((c,i)=>'<span class="color-dot" style="background:'+c.c+'" role="img" aria-label="'+['상의','하의','겉옷'][i]+': '+c.n+'"></span>').join('')+'</div>'; }
  const forecastDayLabel=(date,today)=>globalThis.ChaenggimChart?.dayLabel(date,today)||(date===today?'':Number(date.slice(5,7))+'월 '+Number(date.slice(8,10))+'일');
  function notices(r) {
    const all=[],rain=r.upcoming.find(x=>wet(x.condition)||(number(x.rain)&&x.rain>=50));
    if(wet(r.now.condition)||rain) {
      const now=wet(r.now.condition),f=now?r.now:rain;
      const type=({'비':'비','눈':'눈','비/눈':'비나 눈','뇌우':'뇌우'})[f.condition]||'강수';
      const message=now?'지금 '+f.condition+' 소식이 있어요':(forecastDayLabel(rain.date,r.sc.date)||'오늘')+' '+rain.hour+'시 전후 '+type+' 가능성이 있어요';
      all.push('<div class="notice rain">'+icon(f.condition==='눈'?'snowflake':'cloud-rain')+'<div>'+message+'<small>'+(number(f.rain)?'강수확률 '+percent(f.rain)+' · ':'')+'우산을 챙겨요</small></div></div>');
    }
    const today=r.upcoming.filter(x=>x.date===r.sc.date),hot=today.find(x=>x.temp>=28),cool=today.find(x=>x.temp<=12);
    if(hot)all.push('<div class="notice">'+icon('sun')+'<div>'+hot.hour+'시에는 '+degrees(hot.temp)+'까지 올라요<small>가벼운 옷과 물을 챙겨요</small></div></div>');
    else if(cool)all.push('<div class="notice">'+icon('thermometer')+'<div>'+cool.hour+'시에는 '+degrees(cool.temp)+'로 쌀쌀해요<small>따뜻한 겉옷을 챙겨요</small></div></div>');
    return all.length?'<div class="notices" aria-label="날씨 소식">'+all.slice(0,2).join('')+'</div>':'';
  }
  const hourLabel=(f,r)=>{const day=forecastDayLabel(f.date,r.sc.date);return (day?day+' ':'')+f.hour+'시';};
  function summaryMarkup(r) {
    const rows=[0,3,6,9,12,15].map(i=>r.upcoming[i]).filter(Boolean);
    return '<section class="forecast-summary" aria-label="시간대별 날씨 요약"><div class="summary-heading"><h1>시간대별 날씨</h1><button type="button" class="summary-link" data-nav="hourly">전체보기'+icon('chevron-right',14)+'</button></div><ul class="summary-hours">'+rows.map((f,i)=>'<li class="summary-hour" data-weather-tone="'+forecastTone(f)+'" data-summary-hour="'+f.hour+'" '+(i===0?'aria-current="time"':'')+' aria-label="'+hourLabel(f,r)+', '+f.condition+', '+degrees(f.temp)+', 강수확률 '+percent(f.rain)+'"><span class="summary-hour-time">'+hourLabel(f,r)+'</span>'+icon(forecastIcon(f),20)+'<span class="summary-hour-condition">'+esc(f.condition)+'</span><b>'+degrees(f.temp)+'</b><small>'+percent(f.rain)+'</small></li>').join('')+'</ul></section>';
  }
  function homeMarkup(r) {
    if(!weather) return '<section class="empty-weather"><div class="empty-weather-icon">'+icon('cloud-sun',32)+'</div><h1>'+(state.location?'날씨를 기다리고 있어요':'내 위치의 날씨부터 시작해요')+'</h1><p>'+(state.location?'날씨가 연결되면 옷차림과 챙길 것을 추천해 드려요.':state.locationSetupDone?'설정에서 현재 위치를 연결하거나 지역을 골라 주세요.':'위치를 허용하거나 지역을 직접 검색해 주세요.')+'</p>'+(!state.location&&state.locationSetupDone?'<button type="button" data-nav="settings" class="gps-button">위치 설정</button>':'')+'</section>';
    return '<section class="prep" aria-label="외출 준비 추천">'+(r.advice?.summary?'<p class="outing-summary" data-outing-summary>'+esc(r.advice.summary)+'</p>':'')+outfitMarkup(r)+'<h2 class="items-heading">챙길 것</h2><ul class="prep-items" aria-label="추천 준비물">'+prepItems(r)+'</ul></section><section class="palette" aria-label="오늘의 컬러"><div class="palette-head"><span class="palette-title">오늘의 컬러</span><div data-colors aria-live="polite">'+paletteMarkup()+'</div><button type="button" class="palette-next" data-action="palette" aria-label="다른 색상 조합">'+icon('shuffle')+'</button></div></section>'+summaryMarkup(r);
  }
  function hourRows(list,r) {
    return list.map((f,i)=>{const day=forecastDayLabel(f.date,r.sc.date);return '<div class="hour-row '+(i===0?'current':'')+'" data-weather-tone="'+forecastTone(f)+'" '+(i===0?'aria-current="time"':'')+' data-hour="'+f.hour+'"><span>'+(day?day+'<br>':'')+String(f.hour).padStart(2,'0')+':00'+(i===0?'<small>지금</small>':'')+'</span><span class="hour-condition">'+icon(forecastIcon(f))+esc(f.condition)+'</span><b>'+degrees(f.temp)+(number(f.feels)?'<small>'+feelsLabel()+' '+degrees(f.feels)+'</small>':'')+'</b><span class="rain-chance">'+percent(f.rain)+'</span></div>';}).join('');
  }
  function hourlyMarkup(r) {
    if(!weather)return homeMarkup(r);
    const chart=window.ChaenggimChart?.render(r.upcoming.slice(0,24),r.sc)||'';
    return '<div class="forecast-head"><h1>시간별 날씨</h1><span class="muted" data-hourly-location>'+esc(locationName())+' · 앞으로 24시간</span></div>'+chart+'<div class="hour-detail-heading"><h2>시간별 예보</h2></div><div class="hour-head"><span>시간</span><span>날씨</span><span>기온</span><span style="text-align:right">강수확률</span></div><section class="hour-scroll" aria-label="시간별 날씨 목록" data-hour-scroll><div class="hour-list">'+hourRows(r.upcoming.slice(0,24),r)+'</div></section>';
  }
  function daysLabel(s) {
    if(s.kind==='once'){const [,m,d]=s.date.split('-');return Number(m)+'월 '+Number(d)+'일';}
    if(s.days.length===7)return '매일';
    if(JSON.stringify([...s.days].sort())==='[0,1,2,3,4]')return '월–금';
    return [...s.days].sort().map(d=>dayNames[d]).join('·');
  }
  function scheduleCard(s) {
    return '<article class="schedule-card '+(!s.enabled?'disabled':'')+'" data-schedule-id="'+esc(s.id)+'"><div class="schedule-top"><span class="item-icon">'+icon(s.purpose==='exercise'?'dumbbell':'calendar-days')+'</span><div class="schedule-copy"><b>'+esc(s.name)+'</b><small>'+daysLabel(s)+' · '+names[s.purpose]+'</small></div><label class="enable-toggle"><input type="checkbox" role="switch" data-enable="'+esc(s.id)+'" aria-label="'+esc(s.name)+' 일정 적용" '+(s.enabled?'checked':'')+'></label></div><div class="schedule-bottom"><span class="schedule-time">'+s.start+'–'+s.end+'</span><button type="button" class="text-action" data-edit="'+esc(s.id)+'" aria-label="'+esc(s.name)+' 수정">수정</button><button type="button" class="text-action danger" data-delete="'+esc(s.id)+'" aria-label="'+esc(s.name)+' 삭제">삭제</button></div></article>';
  }
  function formMarkup() {
    const s=editor;
    return '<form class="schedule-form" data-form novalidate><div class="form-head"><h2>'+(s.id?'일정 수정':s.kind==='repeat'?'고정 일정 추가':'일회성 일정 추가')+'</h2></div><label class="field-label" for="wr-name">일정 이름</label><input type="text" id="wr-name" name="name" maxlength="40" placeholder="예: 출근, 저녁 운동" value="'+esc(s.name)+'" required><label class="field-label" for="wr-purpose">외출 종류</label><select id="wr-purpose" name="purpose">'+Object.entries(names).map(([key,value])=>'<option value="'+key+'" '+(s.purpose===key?'selected':'')+'>'+value+'</option>').join('')+'</select>'+(s.kind==='repeat'?'<span class="field-label">반복 요일</span><div class="day-row">'+dayNames.map((d,i)=>'<label class="day-choice"><span>'+d+'</span><input type="checkbox" name="days" value="'+i+'" aria-label="'+d+'요일" '+(s.days.includes(i)?'checked':'')+'></label>').join('')+'</div>':'<label class="field-label" for="wr-date">날짜</label><input type="date" id="wr-date" name="date" value="'+s.date+'" required>')+'<div class="time-fields"><label><span class="field-label">나가는 시간</span><input type="time" name="start" value="'+s.start+'" required></label><label><span class="field-label">돌아오는 시간</span><input type="time" name="end" value="'+s.end+'" required></label></div><div class="form-error" data-form-error role="alert" hidden></div><div class="form-actions"><button type="button" class="cancel-button" data-action="cancel">취소</button><button type="submit" class="save-button" data-action="save">저장</button></div></form>';
  }
  function preferenceMarkup() {
    return '<section class="schedule-card preference-settings" aria-labelledby="wr-preference-title"><h2 id="wr-preference-title">나에게 맞는 옷차림</h2><p>평소 더위와 추위를 느끼는 정도를 골라 주세요.</p><div class="preference-options" role="group" aria-label="온도 민감도">'+Object.entries({cold:'추위를 많이 타요',normal:'보통이에요',hot:'더위를 많이 타요'}).map(([key,label])=>'<button type="button" data-preference="'+key+'" aria-pressed="'+(state.preference===key)+'">'+label+'</button>').join('')+'</div></section>';
  }
  function settingsMarkup() {
    const repeat=state.schedules.filter(s=>s.kind==='repeat'),once=state.schedules.filter(s=>s.kind==='once').sort((a,b)=>a.date.localeCompare(b.date)||hour(a.start)-hour(b.start));
    return '<div class="settings-head"><h1>설정</h1></div>'+locationMarkup()+preferenceMarkup()+'<section class="schedule-card notification-settings" data-notification-settings aria-label="날씨 알림 설정"></section><button type="button" data-install-entry class="install-entry">'+icon('smartphone')+'홈 화면에 추가</button><div class="section-heading"><h2>나의 일정</h2></div><div class="add-actions"><button type="button" data-add="repeat">'+icon('plus')+'고정 일정 추가</button><button type="button" data-add="once">'+icon('plus')+'일회성 일정 추가</button></div>'+(editor?formMarkup():'')+'<section aria-label="고정 일정 목록"><div class="section-heading"><h2>고정 일정 <span class="muted">'+repeat.length+'개</span></h2></div>'+(repeat.length?repeat.map(scheduleCard).join(''):'<div class="empty">반복되는 외출 일정을 등록해 보세요.</div>')+'</section><section aria-label="일회성 일정 목록"><div class="section-heading"><h2>일회성 일정 <span class="muted">'+once.length+'개</span></h2></div>'+(once.length?once.map(scheduleCard).join(''):'<div class="empty">약속이나 나들이 날짜를 등록할 수 있어요.</div>')+'</section>';
  }
  function applyTheme(r) {
    const phone=root.querySelector('.phone');
    const solar=window.ChaenggimSolar?.apply({phone,current:r.now,sc:r.sc,daily:weather?.daily,timeZone:weather?.timezone,location:state.location});
    phone.style.colorScheme=solar?.period==='night'?'dark':'light';
  }
  function render(animate=false) {
    const r=resolve();applyTheme(r);
    root.querySelector('[data-clock]').textContent=r.sc.label;
    root.querySelector('[data-location]').innerHTML=state.nav==='home'?locationMarkup():'';
    root.querySelector('[data-weather]').innerHTML=statusMarkup()+(state.nav==='settings'?'':providerMarkup()+warningMarkup())+(state.nav!=='home'||!weather?'':weatherMarkup(r)+notices(r));
    main.innerHTML=state.nav==='home'?homeMarkup(r):state.nav==='hourly'?hourlyMarkup(r):settingsMarkup();
    if(animate){main.classList.remove('page-enter');void main.offsetWidth;main.classList.add('page-enter');}
    root.querySelectorAll('[data-nav]').forEach(button=>{if(button.dataset.nav===state.nav)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    root.dataset.paletteCount=String(palettes.length);renderCredit();renderLocationLabel();icons();
    window.ChaenggimNav?.sync(state.nav);
    window.ChaenggimWeatherCard?.sync();
    window.ChaenggimGlass?.refresh();
    window.ChaenggimInstall?.refresh();
    window.ChaenggimNotifications?.refresh();
  }
  function notify(text,canUndo=false) {
    clearTimeout(toastTimer);toast.innerHTML=icon('check')+'<span>'+esc(text)+'</span>'+(canUndo?'<button type="button" data-action="undo">되돌리기</button>':'');toast.hidden=false;icons();toastTimer=setTimeout(()=>{toast.hidden=true;},canUndo?7000:2600);
  }
  let pageTransition=null;
  function navigateTo(name) {
    const pages=['home','hourly','settings'];
    if(!pages.includes(name)||state.nav===name)return;
    pageTransition?.();
    const scroll=root.querySelector('[data-app-scroll]'),phone=root.querySelector('.phone');
    const direction=pages.indexOf(name)>pages.indexOf(state.nav)?1:-1;
    const slide=!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof scroll.animate==='function';
    const bounds=scroll.getBoundingClientRect(),container=phone.getBoundingClientRect(),oldTop=scroll.scrollTop;
    const previous=slide?scroll.cloneNode(true):null;
    if(previous){
      previous.classList.add('nav-page-snapshot');previous.removeAttribute('data-app-scroll');
      previous.setAttribute('aria-hidden','true');previous.inert=true;
      previous.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
      previous.querySelectorAll('[data-location], [data-main], [data-weather], [data-toast], [data-nav], [data-current-address]').forEach(element=>{
        for(const attr of ['data-location','data-main','data-weather','data-toast','data-nav','data-current-address'])element.removeAttribute(attr);
      });
      Object.assign(previous.style,{top:(bounds.top-container.top)+'px',left:(bounds.left-container.left)+'px',width:bounds.width+'px',height:bounds.height+'px'});
    }
    state.nav=name;editor=null;locationOpen=name==='settings';render();scroll.scrollTop=0;persist();
    if(!previous)return;
    phone.append(previous);previous.scrollTop=oldTop;
    const options={duration:250,easing:'cubic-bezier(.22,.7,.2,1)'};
    const outgoing=previous.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX('+(-direction*bounds.width)+'px)',opacity:.45}],options);
    const incoming=scroll.animate([{transform:'translateX('+(direction*bounds.width)+'px)',opacity:.6},{transform:'translateX(0)',opacity:1}],options);
    const cleanup=()=>{outgoing.cancel();incoming.cancel();previous.remove();if(pageTransition===cleanup)pageTransition=null;};
    pageTransition=cleanup;
    Promise.allSettled([outgoing.finished,incoming.finished]).then(cleanup);
  }
  root.addEventListener('chaenggim:navigate',event=>navigateTo(event.detail?.nav));
  root.addEventListener('chaenggim:daily-notification-time',event=>{
    const value=event.detail?.value;
    if(!validTime(value)||state.dailyNotificationTime===value)return;
    state.dailyNotificationTime=value;persist();
  });
  function saveSchedule(form) {
    if(!form||!editor)return;
    const data=new FormData(form),s={...editor,name:String(data.get('name')||'').trim(),purpose:data.get('purpose'),start:String(data.get('start')||''),end:String(data.get('end')||'')};
    if(s.kind==='repeat'){s.days=data.getAll('days').map(Number);s.excludeHoliday=false;}else{s.date=String(data.get('date')||'');delete s.days;delete s.excludeHoliday;}
    const error=!s.name?'일정 이름을 입력해 주세요.':s.name.length>40?'일정 이름은 40자 이내로 입력해 주세요.':!Object.hasOwn(names,s.purpose)?'외출 종류를 선택해 주세요.':!validTime(s.start)||!validTime(s.end)?'외출 시간을 선택해 주세요.':hour(s.start)>=hour(s.end)?'돌아오는 시간을 나가는 시간보다 늦게 설정해 주세요.':s.kind==='repeat'&&!s.days.length?'반복 요일을 하나 이상 선택해 주세요.':s.kind==='once'&&!validDate(s.date)?'올바른 날짜를 선택해 주세요.':'';
    if(error){const box=form.querySelector('[data-form-error]');box.textContent=error;box.hidden=false;return;}
    s.id=s.id||'schedule-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    const i=state.schedules.findIndex(x=>x.id===s.id);if(i>=0)state.schedules[i]=s;else state.schedules.push(s);
    editor=null;render(true);persist();notify('일정을 저장했어요.');
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    const action=button.dataset.action;
    if(button.dataset.preference&&['cold','normal','hot'].includes(button.dataset.preference)){state.preference=button.dataset.preference;render();persist();return;}
    if(action==='gps'){useGps();return;}
    if(action==='location'){locationOpen=!locationOpen;render();if(locationOpen)root.querySelector('[name=place]')?.focus();return;}
    if(action==='refresh'){if(state.location)loadWeather();else useGps();return;}
    if(button.hasAttribute('data-place-result')){const place=searchResults[Number(button.dataset.placeResult)];if(place)chooseLocation(place);return;}
    if(button.dataset.nav){navigateTo(button.dataset.nav);return;}
    if(button.dataset.add){editor={id:null,kind:button.dataset.add,name:'',purpose:'daily',days:[0,1,2,3,4],date:clockContext().date,start:'19:00',end:'20:00',excludeHoliday:false,enabled:true};render(true);main.querySelector('[name=name]')?.focus();return;}
    if(button.dataset.edit){const s=state.schedules.find(x=>x.id===button.dataset.edit);if(s){editor=structuredClone(s);render(true);main.querySelector('[name=name]')?.focus();}return;}
    if(button.dataset.delete){const i=state.schedules.findIndex(x=>x.id===button.dataset.delete);if(i>=0){undo={schedule:state.schedules[i],index:i};state.schedules.splice(i,1);if(editor?.id===button.dataset.delete)editor=null;render(true);persist();notify('일정을 삭제했어요.',true);}return;}
    if(action==='palette'){state.paletteIndex=(state.paletteIndex+paletteStep)%palettes.length;const colors=main.querySelector('[data-colors]');if(colors)colors.innerHTML=paletteMarkup();icons();persist();return;}
    if(action==='cancel'){editor=null;render(true);return;}
    if(action==='undo'&&undo){if(!state.schedules.some(x=>x.id===undo.schedule.id))state.schedules.splice(Math.min(undo.index,state.schedules.length),0,undo.schedule);undo=null;render(true);persist();notify('일정을 되돌렸어요.');}
  });
  function captureEditor(element) {
    const form=element.closest('[data-form]');
    if(!editor||!form)return;
    const data=new FormData(form);
    for(const key of ['name','purpose','start','end'])editor[key]=String(data.get(key)||'');
    if(editor.kind==='repeat')editor.days=data.getAll('days').map(Number);
    else editor.date=String(data.get('date')||'');
  }
  root.addEventListener('input',event=>{if(event.target.name==='place')searchQuery=event.target.value;else captureEditor(event.target);});
  root.addEventListener('change',event=>{const element=event.target;captureEditor(element);if(element.dataset.enable){const s=state.schedules.find(x=>x.id===element.dataset.enable);if(s){s.enabled=element.checked;render();persist();notify(s.name+(s.enabled?' 일정을 적용해요.':' 일정을 잠시 껐어요.'));}}});
  root.addEventListener('submit',event=>{
    if(event.target.matches('[data-location-form]')){event.preventDefault();searchPlaces(event.target);}
    else if(event.target.matches('[data-form]')){event.preventDefault();saveSchedule(event.target);}
  });
  window.addEventListener('openai:set_globals',event=>{
    const value=event.detail?.globals?.widgetState;
    if(!value||JSON.stringify(value.privateContent||value)===lastOwnSnapshot)return;
    const old=JSON.stringify(state.location);hydrate(value);editor=null;render();
    if(JSON.stringify(state.location)!==old&&state.location)loadWeather();
  });
  window.addEventListener('online',()=>{if(state.location&&!weatherLoading)loadWeather();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.location&&!weatherLoading&&(!weather||Date.now()-weather.fetchedAt>=900000))loadWeather();});
  setInterval(()=>{if(!editor&&!gpsLoading&&!document.activeElement?.closest('.location-editor,[data-notification-time]'))render();if(state.location&&!weatherLoading&&(!weather||Date.now()-weather.fetchedAt>=900000)&&!document.hidden)loadWeather();},60000);
  window.ChaenggimProfile=Object.freeze({getSnapshot:()=>structuredClone({location:state.location,schedules:state.schedules,preference:state.preference,dailyNotificationTime:state.dailyNotificationTime,timezone:weather?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Seoul'})});
  try {hydrate(JSON.parse(localStorage.getItem(STORAGE)));} catch {}
  hydrate(window.openai?.widgetState);
  if(state.locationMode!=='manual')state.location=null;
  locationOpen=!state.location;
  persist();
  render();
  if(state.locationMode==='manual'&&state.location)loadWeather();
  else useGps();
})();
