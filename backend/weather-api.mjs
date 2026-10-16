import { getKmaWeather, toKmaGrid } from './kma-provider.mjs';
import { getKmaWarnings } from './kma-warnings.mjs';

const cache = new Map();
const inFlight = new Map();
const CACHE_MS = 5 * 60 * 1000;
const MAX_CELLS = 100;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
function unavailableWarnings() { return {warnings:[],warningStatus:'unavailable'}; }
async function optionalWarnings(location, options) {
  let timeout;
  try {
    return await Promise.race([
      getKmaWarnings(location, options),
      new Promise(resolve => { timeout=setTimeout(()=>resolve(unavailableWarnings()),4500); })
    ]);
  } catch { return unavailableWarnings(); }
  finally { clearTimeout(timeout); }
}
export async function handleWeatherRequest(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if(url.pathname !== '/api/weather') return json({code:'NOT_FOUND'},404);
  if(request.method !== 'GET') return json({code:'METHOD_NOT_ALLOWED'},405);
  const latitude=Number(url.searchParams.get('latitude'));
  const longitude=Number(url.searchParams.get('longitude'));
  if(!url.searchParams.has('latitude')||!url.searchParams.has('longitude')||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<33||latitude>38.8||longitude<124||longitude>132) return json({code:'UNSUPPORTED_LOCATION'},400);
  const apiKey=typeof env.KMA_API_KEY==='string'?env.KMA_API_KEY.trim():'';
  if(!apiKey) return json({code:'KMA_KEY_MISSING'},503);
  const regionName=(url.searchParams.get('regionName')||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160);
  const location={latitude,longitude,regionName};
  const providerOptions={...options,apiKey};
  const now=typeof options.now==='function'?options.now():Date.now();
  let cell;
  try { const grid=toKmaGrid(latitude,longitude);cell=grid.nx+','+grid.ny; }
  catch { return json({code:'UNSUPPORTED_LOCATION'},400); }
  try {
    const warningsPromise=optionalWarnings(location,providerOptions);
    let forecastPromise;
    const saved=cache.get(cell);
    if(saved&&now-saved.at<CACHE_MS) forecastPromise=Promise.resolve(saved.data);
    else if(inFlight.has(cell)) forecastPromise=inFlight.get(cell);
    else {
      forecastPromise=getKmaWeather(location,providerOptions).then(data=>{
        if(cache.size>=MAX_CELLS)cache.delete(cache.keys().next().value);
        cache.set(cell,{at:now,data});
        return data;
      }).finally(()=>inFlight.delete(cell));
      inFlight.set(cell,forecastPromise);
    }
    const [data,warningData]=await Promise.all([forecastPromise,warningsPromise]);
    return json({...data,...warningData});
  } catch (error) {
    // Keep provider URLs, credentials and raw responses out of public errors.
    const allowed=['KMA_TIMEOUT','KMA_NETWORK','KMA_AUTH','KMA_HTTP','KMA_RESPONSE','KMA_NO_DATA','KMA_INCOMPLETE','KMA_STALE','KMA_RUNTIME'];
    const reason=allowed.includes(error?.code)?error.code:'UNKNOWN';
    console.warn('kma-weather-unavailable',reason);
    return json({code:'KMA_UNAVAILABLE',reason},502);
  }
}
