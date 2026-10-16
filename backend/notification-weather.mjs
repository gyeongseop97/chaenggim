import { handleWeatherRequest } from './weather-api.mjs';

const notificationWeatherCache=new Map();
const notificationWeatherPending=new Map();
const notificationWeatherEncoder=value=>typeof value==='number'&&Number.isFinite(value);
function notificationWeatherCondition(code) {
  if(code===0)return '맑음';
  if(code===1||code===2)return '구름 조금';
  if(code===3)return '흐림';
  if([45,48].includes(code))return '안개';
  if([71,73,75,77,85,86].includes(code))return '눈';
  if([95,96,99].includes(code))return '뇌우';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '비';
  return '날씨 정보';
}
function notificationWeatherNormalize(data,now) {
  if(!Array.isArray(data?.hourly?.time)||!notificationWeatherEncoder(data.current?.temperature_2m))throw new Error('NOTIFICATION_FORECAST_UNAVAILABLE');
  const rows=data.hourly.time.map((stamp,index)=>({stamp,date:stamp.slice(0,10),hour:Number(stamp.slice(11,13)),temp:data.hourly.temperature_2m?.[index],feels:data.hourly.apparent_temperature?.[index],rain:data.hourly.precipitation_probability?.[index],condition:notificationWeatherCondition(data.hourly.weather_code?.[index]),isDay:data.hourly.is_day?.[index]===1}))
    .filter(row=>typeof row.stamp==='string'&&/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):00$/.test(row.stamp)&&notificationWeatherEncoder(row.temp));
  if(rows.length<24)throw new Error('NOTIFICATION_FORECAST_UNAVAILABLE');
  return {rows,current:{temp:data.current.temperature_2m,feels:data.current.apparent_temperature,condition:notificationWeatherCondition(data.current.weather_code),isDay:data.current.is_day===1,precipitation:data.current.precipitation,time:data.current.time},daily:data.daily||null,timezone:data.timezone||'Asia/Seoul',source:'open-meteo',fetchedAt:now};
}
export async function notificationWeatherForLocation(location,env={},options={}) {
  if(!notificationWeatherEncoder(location?.latitude)||!notificationWeatherEncoder(location?.longitude)||Math.abs(location.latitude)>90||Math.abs(location.longitude)>180)throw new Error('INVALID_NOTIFICATION_LOCATION');
  const now=typeof options.now==='function'?options.now():Number.isFinite(options.now)?options.now:Date.now();
  const key=location.latitude.toFixed(3)+','+location.longitude.toFixed(3);
  const cached=notificationWeatherCache.get(key);
  if(!options.noCache&&cached&&now>=cached.at&&now-cached.at<5*60000)return cached.data;
  if(!options.noCache&&notificationWeatherPending.has(key))return notificationWeatherPending.get(key);
  const promise=(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    const fetchImpl=options.fetch||options.fetchImpl||((...args)=>globalThis.fetch(...args));
    try {
      let forecast;
      if(location.latitude>=33&&location.latitude<=38.8&&location.longitude>=124&&location.longitude<=132&&env.KMA_API_KEY){
        const query=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),regionName:location.name||''});
        const response=await handleWeatherRequest(new Request('https://weather.internal/api/weather?'+query),env,{now:()=>now,fetchImpl,signal:controller.signal,timeoutMs:2500,attempts:1});
        if(response.ok){const data=await response.json();if(Array.isArray(data.rows)&&data.rows.length>=24&&notificationWeatherEncoder(data.current?.temp))forecast=data;}
      }
      if(!forecast){
        const query=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),current:'temperature_2m,apparent_temperature,weather_code,is_day,precipitation',hourly:'temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day',daily:'temperature_2m_max,temperature_2m_min,sunrise,sunset',timezone:'auto',forecast_days:'3'});
        const response=await fetchImpl('https://api.open-meteo.com/v1/forecast?'+query,{signal:controller.signal,redirect:'manual',headers:{accept:'application/json'}});
        if(!response.ok)throw new Error('NOTIFICATION_FORECAST_UNAVAILABLE');
        forecast=notificationWeatherNormalize(await response.json(),now);
      }
      if(!options.noCache){if(notificationWeatherCache.size>=100)notificationWeatherCache.delete(notificationWeatherCache.keys().next().value);notificationWeatherCache.set(key,{at:now,data:forecast});}
      return forecast;
    } finally {clearTimeout(timer);}
  })();
  if(!options.noCache)notificationWeatherPending.set(key,promise);
  try{return await promise;}finally{if(!options.noCache)notificationWeatherPending.delete(key);}
}
