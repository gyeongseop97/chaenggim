// Server-only KMA API Hub adapter. Never send the API key or upstream URLs to clients.
const BASE = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/';
const HOUR = 3600000;
const KST = 9 * HOUR;
const METHODS = { observation: 'getUltraSrtNcst', ultra: 'getUltraSrtFcst', short: 'getVilageFcst' };
const LABELS = { observation: '기상청 초단기실황', ultra: '기상청 초단기예보', short: '기상청 단기예보' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pad = value => String(value).padStart(2, '0');

export class KmaError extends Error {
  constructor(code, message = '기상청 날씨를 불러오지 못했어요.') {
    super(message);
    this.name = 'KmaError';
    this.code = code;
  }
}

// The documented 5 km DFS Lambert conformal conic projection.
export function toKmaGrid(latitude, longitude) {
  if (!finite(latitude) || !finite(longitude) || latitude < 33 || latitude > 38.8 || longitude < 124 || longitude > 132) {
    throw new KmaError('OUTSIDE_KOREA', '기상청 예보 지원 범위 밖이에요.');
  }
  const rad = Math.PI / 180;
  const re = 6371.00877 / 5;
  const slat1 = 30 * rad, slat2 = 60 * rad, olon = 126 * rad, olat = 38 * rad;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  const sf = Math.pow(Math.tan(Math.PI / 4 + slat1 / 2), sn) * Math.cos(slat1) / sn;
  const ro = re * sf / Math.pow(Math.tan(Math.PI / 4 + olat / 2), sn);
  const ra = re * sf / Math.pow(Math.tan(Math.PI / 4 + latitude * rad / 2), sn);
  let theta = longitude * rad - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  const nx = Math.floor(ra * Math.sin(theta) + 43 + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5);
  if (nx < 1 || nx > 149 || ny < 1 || ny > 253) throw new KmaError('OUTSIDE_KOREA');
  return { nx, ny };
}

const shifted = value => new Date(value + KST);
const day = value => shifted(value).toISOString().slice(0, 10);
const compactDate = value => day(value).replaceAll('-', '');
const isoKst = value => shifted(value).toISOString().slice(0, 16);
const formatBase = value => ({ base_date: compactDate(value), base_time: pad(shifted(value).getUTCHours()) + pad(shifted(value).getUTCMinutes()), timestamp: value, issuedAt: isoKst(value) });

// API availability is later than publication: :10 observations, :45 ultra,
// and 10 minutes after each of the eight short-range publication hours.
export function kmaBaseTimes(kind, timestamp = Date.now(), count = 3) {
  if (!Object.hasOwn(METHODS, kind) || !finite(timestamp)) throw new KmaError('INVALID_TIME');
  const output = [];
  if (kind === 'observation' || kind === 'ultra') {
    const latest = Math.floor((timestamp - (kind === 'ultra' ? 45 : 10) * 60000) / HOUR) * HOUR;
    for (let i = 0; i < count; i++) output.push(formatBase(latest - i * HOUR + (kind === 'ultra' ? 30 * 60000 : 0)));
  } else {
    const latest = Math.floor((timestamp - 10 * 60000) / HOUR) * HOUR;
    for (let value = latest; output.length < count; value -= HOUR) {
      if ([2, 5, 8, 11, 14, 17, 20, 23].includes(shifted(value).getUTCHours())) output.push(formatBase(value));
    }
  }
  return output;
}

function numeric(value, min = -899, max = 899) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
}

export function kmaCondition(sky, pty, lightning = 0) {
  const precipitation = numeric(pty, 0, 7);
  if (numeric(lightning, 0, 899) > 0) return { condition: '뇌우', conditionDetail: '낙뢰' };
  if (precipitation === 2 || precipitation === 6) return { condition: '비/눈', conditionDetail: precipitation === 2 ? '비/눈' : '빗방울·눈날림' };
  if ([1, 4, 5].includes(precipitation)) return { condition: '비', conditionDetail: ({ 1: '비', 4: '소나기', 5: '빗방울' })[precipitation] };
  if ([3, 7].includes(precipitation)) return { condition: '눈', conditionDetail: precipitation === 7 ? '눈날림' : '눈' };
  const condition = ({ 1: '맑음', 3: '구름 많음', 4: '흐림' })[numeric(sky, 1, 4)] || '날씨 정보';
  return { condition, conditionDetail: condition };
}

// Australian Bureau of Meteorology, shade apparent-temperature approximation:
// https://www.bom.gov.au/info/thermal_stress/#atapproximation
// AT = Ta + 0.33 e - 0.70 ws - 4; ws in m/s. This is not KMA's heat index.
function apparentTemperature(temp, humidity, wind) {
  if (!finite(temp) || !finite(humidity) || !finite(wind)) return null;
  const vapour = humidity / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp));
  return Math.round((temp + 0.33 * vapour - 0.7 * wind - 4) * 10) / 10;
}

function precipitationAmount(value) {
  const text = String(value ?? '').trim();
  if (['강수없음', '강수 없음', '없음', '0', '0.0'].includes(text)) return 0;
  // Ranged/qualitative amounts cannot honestly be represented as a precise mm value.
  return numeric(text.replace(/mm$/i, ''), 0, 899);
}

function usableValue(category, value) {
  if (['RN1', 'PCP'].includes(category)) return precipitationAmount(value) !== null || /(?:미만|이상|~)/.test(String(value ?? ''));
  return numeric(value) !== null;
}

// NOAA-style sunrise/sunset calculation is used only for daylight icons.
// The weather observations and forecasts remain unmodified KMA values.
function solarTimes(date, latitude, longitude) {
  const midnight = Date.parse(date + 'T00:00:00Z');
  const days = Math.floor((midnight - Date.UTC(Number(date.slice(0, 4)), 0, 0)) / 86400000);
  const radians = Math.PI / 180;
  const longitudeHour = longitude / 15;
  const calculate = rise => {
    const approximate = days + ((rise ? 6 : 18) - longitudeHour) / 24;
    const mean = 0.9856 * approximate - 3.289;
    const trueLongitude = ((mean + 1.916 * Math.sin(mean * radians) + 0.020 * Math.sin(2 * mean * radians) + 282.634) % 360 + 360) % 360;
    let ascension = Math.atan(0.91764 * Math.tan(trueLongitude * radians)) / radians;
    ascension = ((ascension % 360) + 360) % 360;
    ascension += Math.floor(trueLongitude / 90) * 90 - Math.floor(ascension / 90) * 90;
    ascension /= 15;
    const sinDeclination = 0.39782 * Math.sin(trueLongitude * radians);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosHour = (Math.cos(90.833 * radians) - sinDeclination * Math.sin(latitude * radians)) / (cosDeclination * Math.cos(latitude * radians));
    if (Math.abs(cosHour) > 1) return null;
    const hourAngle = (rise ? 360 - Math.acos(cosHour) / radians : Math.acos(cosHour) / radians) / 15;
    const localMean = hourAngle + ascension - 0.06571 * approximate - 6.622;
    const utc = ((localMean - longitudeHour) % 24 + 24) % 24;
    // Sunrise in Korea occurs on the previous UTC date.
    const value = midnight + utc * HOUR - (utc + 9 >= 24 ? 86400000 : 0);
    return isoKst(value);
  };
  return { sunrise: calculate(true), sunset: calculate(false) };
}

function isDaylight(stamp, latitude, longitude) {
  const solar = solarTimes(stamp.slice(0, 10), latitude, longitude);
  return solar.sunrise && solar.sunset ? stamp >= solar.sunrise && stamp < solar.sunset : null;
}

async function requestItems(kind, base, grid, options) {
  const query = new URLSearchParams({ pageNo: '1', numOfRows: kind === 'short' ? '5000' : '1000', dataType: 'JSON', base_date: base.base_date, base_time: base.base_time, nx: String(grid.nx), ny: String(grid.ny), authKey: options.apiKey });
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, options.timeoutMs);
  try {
    let response;
    try {
      const fetchRequest = options.fetchImpl;
      response = await fetchRequest(BASE + METHODS[kind] + '?' + query, { signal: controller.signal, headers: { accept: 'application/json' } });
    } catch {
      // Fetch errors sometimes contain the full request URL, including authKey.
      throw new KmaError(controller.signal.aborted ? 'KMA_TIMEOUT' : 'KMA_NETWORK');
    }
    if (!response.ok) throw new KmaError([401, 403].includes(response.status) ? 'KMA_AUTH' : 'KMA_HTTP');
    let data;
    try { data = await response.json(); } catch { throw new KmaError('KMA_RESPONSE'); }
    const result = data?.response;
    const code = String(result?.header?.resultCode ?? '');
    if (code !== '00' && code !== '0') throw new KmaError(['20', '21', '22', '30', '31', '32', '33'].includes(code) ? 'KMA_AUTH' : 'KMA_NO_DATA');
    let items = result?.body?.items?.item;
    if (items && !Array.isArray(items)) items = [items];
    if (!Array.isArray(items) || !items.length) throw new KmaError('KMA_NO_DATA');
    if (numeric(result.body.totalCount, 0, 100000) > items.length) throw new KmaError('KMA_INCOMPLETE');
    if (kind === 'observation' && !items.some(item => item.category === 'T1H' && numeric(item.obsrValue, -90, 60) !== null)) throw new KmaError('KMA_NO_DATA');
    if (kind !== 'observation' && !items.some(item => ['TMP', 'T1H'].includes(item.category) && numeric(item.fcstValue, -90, 60) !== null)) throw new KmaError('KMA_NO_DATA');
    return { kind, base, items };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function latestItems(kind, grid, options, timestamp) {
  let lastCode = 'KMA_NO_DATA';
  for (const base of kmaBaseTimes(kind, timestamp, options.attempts)) {
    try { return await requestItems(kind, base, grid, options); }
    catch (error) {
      if (error.code === 'KMA_AUTH' || options.signal?.aborted) throw new KmaError(error.code || 'KMA_TIMEOUT');
      lastCode = error instanceof KmaError ? error.code : 'KMA_RESPONSE';
    }
  }
  throw new KmaError(lastCode);
}

function groupForecast(result) {
  const grouped = new Map();
  for (const item of result.items) {
    const rawDate = String(item.fcstDate ?? ''), rawTime = String(item.fcstTime ?? '').padStart(4, '0');
    if (!/^\d{8}$/.test(rawDate) || !/^(?:[01]\d|2[0-3])00$/.test(rawTime)) continue;
    const date = rawDate.slice(0, 4) + '-' + rawDate.slice(4, 6) + '-' + rawDate.slice(6, 8);
    const stamp = date + 'T' + rawTime.slice(0, 2) + ':00';
    if (Number.isNaN(Date.parse(stamp + '+09:00'))) continue;
    if (!grouped.has(stamp)) grouped.set(stamp, { stamp, date, hour: Number(rawTime.slice(0, 2)), values: {}, source: LABELS[result.kind], issuedAt: result.base.issuedAt });
    if (usableValue(item.category, item.fcstValue)) grouped.get(stamp).values[item.category] = item.fcstValue;
  }
  return grouped;
}

function normalizedRow(entry, latitude, longitude) {
  const values = entry.values;
  const temp = numeric(values.T1H ?? values.TMP, -90, 60);
  if (temp === null) return null;
  const humidity = numeric(values.REH, 0, 100), wind = numeric(values.WSD, 0, 100);
  return {
    stamp: entry.stamp, date: entry.date, hour: entry.hour, temp,
    feels: apparentTemperature(temp, humidity, wind), feelsSource: 'calculated',
    rain: numeric(values.POP, 0, 100), ...kmaCondition(values.SKY, values.PTY, values.LGT),
    isDay: isDaylight(entry.stamp, latitude, longitude), precipitation: precipitationAmount(values.RN1 ?? values.PCP),
    humidity, wind, source: entry.source, issuedAt: entry.issuedAt
  };
}

/**
 * apiKey comes from KMA_API_KEY on the server. This module performs no logging,
 * persists no credentials and exposes only a safe, provider-neutral response.
 * Warning data is deliberately unknown until an official area mapping succeeds.
 */
export async function getKmaWeather({ latitude, longitude }, {
  apiKey = globalThis.process?.env?.KMA_API_KEY, fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now,
  signal, timeoutMs = 3000, attempts = 2, warningProvider
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new KmaError('KMA_NOT_CONFIGURED', '기상청 인증키가 아직 설정되지 않았어요.');
  const grid = toKmaGrid(latitude, longitude);
  const timestamp = typeof now === 'function' ? now() : now;
  if (!finite(timestamp)) throw new KmaError('INVALID_TIME');
  const options = { apiKey: apiKey.trim(), fetchImpl, signal, timeoutMs: Math.min(15000, Math.max(100, timeoutMs)), attempts: Math.min(3, Math.max(1, attempts)) };
  const [observationResult, ultraResult, shortResult] = await Promise.allSettled(['observation', 'ultra', 'short'].map(kind => latestItems(kind, grid, options, timestamp)));
  if (shortResult.status !== 'fulfilled' || observationResult.status !== 'fulfilled') {
    const error = shortResult.status !== 'fulfilled' ? shortResult.reason : observationResult.reason;
    throw new KmaError(error?.code || 'KMA_NO_DATA');
  }
  const observation = observationResult.value, short = shortResult.value;
  if (timestamp - observation.base.timestamp > 2 * HOUR) throw new KmaError('KMA_STALE');
  const ultra = ultraResult.status === 'fulfilled' ? ultraResult.value : null;
  const shortRows = groupForecast(short);
  const combined = new Map(shortRows);
  const ultraRows = ultra ? groupForecast(ultra) : new Map();
  // Ultra values win only when present; POP may be absent on older publications.
  for (const [stamp, value] of ultraRows) combined.set(stamp, { ...value, values: { ...shortRows.get(stamp)?.values, ...value.values } });
  const obs = Object.fromEntries(observation.items.filter(item => usableValue(item.category, item.obsrValue)).map(item => [item.category, item.obsrValue]));
  const today = day(timestamp), currentStamp = isoKst(Math.floor(timestamp / HOUR) * HOUR);
  const currentForecast = combined.get(currentStamp) || [...combined.values()].sort((a, b) => a.stamp.localeCompare(b.stamp)).find(row => row.stamp > currentStamp);
  const currentValues = currentForecast?.values || {};
  const temp = numeric(obs.T1H, -90, 60), humidity = numeric(obs.REH, 0, 100), wind = numeric(obs.WSD, 0, 100);
  const current = {
    temp, feels: apparentTemperature(temp, humidity, wind), feelsSource: 'calculated',
    ...kmaCondition(currentValues.SKY, obs.PTY ?? currentValues.PTY, currentValues.LGT),
    isDay: isDaylight(isoKst(timestamp), latitude, longitude), precipitation: precipitationAmount(obs.RN1),
    rain: numeric(currentValues.POP, 0, 100), humidity, wind,
    time: observation.base.issuedAt, source: LABELS.observation,
    conditionSource: currentForecast?.source || LABELS.observation,
    conditionIssuedAt: currentForecast?.issuedAt || observation.base.issuedAt
  };
  // The current hour may have dropped out of the newest forecast publication.
  // In that case add the actual observation, preserving its explicit provenance.
  if (!combined.has(currentStamp)) combined.set(currentStamp, { stamp: currentStamp, date: today, hour: shifted(timestamp).getUTCHours(), values: { ...currentValues, T1H: obs.T1H, REH: obs.REH, WSD: obs.WSD, PTY: obs.PTY, RN1: obs.RN1 }, source: LABELS.observation, issuedAt: observation.base.issuedAt });
  const rows = [...combined.values()].map(entry => normalizedRow(entry, latitude, longitude)).filter(Boolean).sort((a, b) => a.stamp.localeCompare(b.stamp));
  const upcoming = rows.filter(row => row.stamp >= currentStamp);
  if (upcoming.length < 24) throw new KmaError('KMA_INCOMPLETE');
  for (let i = 0; i < 24; i++) {
    if (upcoming[i]?.stamp !== isoKst(Math.floor(timestamp / HOUR) * HOUR + i * HOUR)) throw new KmaError('KMA_INCOMPLETE');
  }

  // Today's extrema may disappear from afternoon publications. Get the 02:00
  // bulletin instead of calling the remaining forecast range today's minimum.
  const dailyRows = new Map(shortRows);
  const hasToday = category => [...dailyRows.values()].some(row => row.date === today && numeric(row.values[category], -90, 60) !== null);
  let dailySupplement = null;
  if (!hasToday('TMN') || !hasToday('TMX')) {
    const midnightKst = Date.parse(today + 'T00:00:00+09:00');
    const baseTime = timestamp >= midnightKst + 130 * 60000 ? midnightKst + 2 * HOUR : midnightKst - HOUR;
    if (baseTime !== short.base.timestamp) {
      try {
        dailySupplement = await requestItems('short', formatBase(baseTime), grid, options);
        for (const [stamp, entry] of groupForecast(dailySupplement)) {
          if (!dailyRows.has(stamp)) dailyRows.set(stamp, entry);
          else dailyRows.get(stamp).values = { ...entry.values, ...dailyRows.get(stamp).values };
        }
      } catch { /* Extrema remain explicitly unavailable when publication failed. */ }
    }
  }
  const dates = [...new Set(rows.map(row => row.date))].sort();
  if (!dates.includes(today)) dates.unshift(today);
  const daily = { time: dates, temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [] };
  for (const date of dates) {
    const entries = [...dailyRows.values()].filter(row => row.date === date);
    const highs = entries.map(row => numeric(row.values.TMX, -90, 60)).filter(value => value !== null);
    const lows = entries.map(row => numeric(row.values.TMN, -90, 60)).filter(value => value !== null);
    daily.temperature_2m_max.push(highs.length ? Math.max(...highs) : null);
    daily.temperature_2m_min.push(lows.length ? Math.min(...lows) : null);
    const solar = solarTimes(date, latitude, longitude);
    daily.sunrise.push(solar.sunrise); daily.sunset.push(solar.sunset);
  }
  let warningData = { warnings: [], warningStatus: 'unavailable' };
  if (typeof warningProvider === 'function') {
    try {
      const value = await warningProvider({ latitude, longitude }, { apiKey: options.apiKey, fetchImpl, now: timestamp, signal });
      if (value && ['ok', 'unavailable'].includes(value.warningStatus) && Array.isArray(value.warnings)) warningData = value;
    } catch { /* Weather remains usable when warning service or area matching fails. */ }
  }
  const sources = [observation, ultra, short, dailySupplement].filter(Boolean).map(result => ({ provider: '기상청', name: LABELS[result.kind], method: METHODS[result.kind], issuedAt: result.base.issuedAt }));
  return {
    timezone: 'Asia/Seoul', current, daily, rows, fetchedAt: timestamp, source: 'kma', sourceLabel: '기상청', feelsSource: 'calculated', grid,
    issuedAt: short.base.issuedAt, sources, ultraStatus: ultra ? 'ok' : 'unavailable',
    feelsMethod: '호주 기상청 그늘 체감온도 근사식(기상청 공식 체감온도 아님)',
    feelsReference: 'https://www.bom.gov.au/info/thermal_stress/#atapproximation',
    daylightSource: '좌표·날짜를 이용한 일출·일몰 계산값', ...warningData
  };
}
