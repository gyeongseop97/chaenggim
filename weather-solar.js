/* Regional sunrise and sunset drive one continuous sky, including through glass. */
(() => {
  'use strict';
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const mix = (a, b, weight) => a.map((value, index) => Math.round(value + (b[index] - value) * weight));
  const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const hex = value => '#' + value.map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('');
  const palettes = {
    night: ['#14273e', '#1c3149', '#172b41', '#7994ba'],
    predawn: ['#566886', '#9daac0', '#c4cbd5', '#c8b8ca'],
    sunrise: ['#a9bfd8', '#edcec5', '#f4e7d6', '#ffe1b7'],
    morning: ['#a9d0e5', '#d7e7ed', '#edf0e9', '#fff0ce'],
    day: ['#9bcbe3', '#d7e8ee', '#eef1e9', '#fff3d3'],
    golden: ['#b3c8df', '#e6d1c6', '#f2e1ce', '#ffdfae'],
    sunset: ['#a5a9cb', '#d5b4c4', '#e9d6d5', '#f7bd9e'],
    bluehour: ['#3f5578', '#637a9a', '#91a4bd', '#b2a5c7']
  };
  const parsed = Object.fromEntries(Object.entries(palettes).map(([name, values]) => [name, values.map(rgb)]));

  function localClock(timeZone) {
    let parts;
    try {
      parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    } catch {
      parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    }
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${fields.year}-${fields.month}-${fields.day}`, hour: Number(fields.hour) + Number(fields.minute) / 60 };
  }

  function solarMinute(value, date) {
    if (typeof value !== 'string' || value.slice(0, 10) !== date) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    // The provider supplies these wall-clock times in its declared region timezone.
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function weatherKind(current) {
    const value = typeof current?.condition === 'string' ? current.condition : '';
    if (value === '비/눈' || /진눈깨비|혼합/.test(value)) return 'mixed';
    if (/뇌우|천둥/.test(value)) return 'storm';
    if (/눈/.test(value)) return 'snow';
    if (/비|소나기|이슬비/.test(value)) return 'rain';
    if (/안개/.test(value)) return 'fog';
    if (/흐림|구름 많음/.test(value)) return 'cloud';
    if (/맑음/.test(value)) return 'clear';
    return 'partly';
  }

  function compute(options = {}) {
    const sc = options.sc && /^\d{4}-\d{2}-\d{2}$/.test(options.sc.date || '') && Number.isFinite(options.sc.hour)
      ? options.sc : localClock(options.timeZone);
    const minute = clamp(sc.hour * 60, 0, 1439.999);
    const daily = options.daily;
    const index = Array.isArray(daily?.time) ? daily.time.indexOf(sc.date) : -1;
    let sunrise = index >= 0 ? solarMinute(daily.sunrise?.[index], sc.date) : null;
    let sunset = index >= 0 ? solarMinute(daily.sunset?.[index], sc.date) : null;
    const source = sunrise !== null && sunset !== null && sunset > sunrise ? 'forecast' : 'fallback';
    // Pending or unavailable sun data uses a quiet local 06:00–18:00 cycle.
    if (source === 'fallback') { sunrise = 360; sunset = 1080; }
    const daylight = sunset - sunrise, darkness = 1440 - daylight;
    const dawn = Math.min(90, darkness * .22), morning = Math.min(85, daylight * .2);
    const dusk = Math.min(110, darkness * .24), golden = Math.min(85, daylight * .2);
    const knots = [
      [sunrise - dawn, 'night'],
      [sunrise - dawn * .42, 'predawn'],
      [sunrise + morning * .05, 'sunrise'],
      [sunrise + morning, 'morning'],
      [(sunrise + sunset) / 2, 'day'],
      [sunset - golden, 'day'],
      [sunset - golden * .34, 'golden'],
      [sunset + dusk * .1, 'sunset'],
      [sunset + dusk * .55, 'bluehour'],
      [sunset + dusk, 'night']
    ];
    const points = [-1440, 0, 1440].flatMap(offset => knots.map(([time, name]) => [time + offset, name])).sort((a, b) => a[0] - b[0]);
    let left = points[0], right = points.at(-1);
    for (let i = 1; i < points.length; i++) {
      if (minute <= points[i][0]) { left = points[i - 1]; right = points[i]; break; }
    }
    const linear = clamp((minute - left[0]) / Math.max(1, right[0] - left[0]));
    const amount = linear * linear * (3 - 2 * linear);
    let colors = parsed[left[1]].map((value, i) => mix(value, parsed[right[1]][i], amount));
    const kind = weatherKind(options.current);
    const cloudDensity = ({ clear: 0, partly: .42, cloud: .94, rain: .97, storm: 1, snow: .8, mixed: .92, fog: .95 })[kind];
    const overcast = ({ clear: 0, partly: .08, cloud: .31, rain: .41, storm: .46, snow: .2, mixed: .31, fog: .35 })[kind];
    const nightAmount = minute < sunrise ? 1 - clamp((minute - (sunrise - dawn)) / dawn)
      : minute > sunset ? clamp((minute - sunset) / dusk) : 0;
    const coverDay = (kind === 'snow' ? ['#bfd7e2', '#dfecf0', '#eff4f2', '#f5fcf8']
      : ['#b5c8d6', '#d2dfe6', '#e5ecee', '#dbe6ed']).map(rgb);
    const coverNight = ['#263c52', '#273d52', '#20364b', '#879fb6'].map(rgb);
    const coverPalette = coverDay.map((value, i) => mix(value, coverNight[i], nightAmount));
    colors = colors.map((value, i) => mix(value, coverPalette[i], overcast));
    const phase = minute < sunrise - dawn || minute >= sunset + dusk ? 'night'
      : minute < sunrise + morning ? 'dawn'
        : minute >= sunset - golden ? 'evening' : 'day';
    // Dark controls continue into blue hour, with light controls once dawn is bright.
    const luminance = value => value.map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const dark = luminance(colors[2]) < .24;
    const period = dark ? 'night' : phase === 'night' ? (minute < sunrise ? 'dawn' : 'evening') : phase;
    const progress = clamp((minute - sunrise) / daylight);
    const halo = { x: .12 + progress * .76, y: .22 - Math.sin(progress * Math.PI) * .2 };
    const sky = ['mixed', 'storm'].includes(kind) ? 'rain' : kind === 'fog' ? 'cloud' : kind;
    return {
      date: sc.date, minute, sunrise, sunset, source, phase, period, sky, kind,
      colors: { top: hex(colors[0]), mid: hex(colors[1]), base: hex(colors[2]), halo: colors[3].join(',') },
      cloudDensity, nightAmount, halo,
      key: `${sc.date}:${Math.floor(minute)}:${sunrise}:${sunset}:${kind}`
    };
  }

  let lastState = null;
  function apply(options) {
    const result = compute(options);
    const phone = options?.phone;
    lastState = result;
    if (!phone) return result;
    phone.dataset.period = result.period;
    phone.dataset.sky = result.sky;
    phone.dataset.weatherKind = result.kind;
    if (phone.dataset.solarKey !== result.key) {
      const values = {
        '--glass-sky-top': result.colors.top, '--glass-sky-mid': result.colors.mid,
        '--glass-sky-base': result.colors.base, '--glass-halo': result.colors.halo,
        '--solar-cloud-density': result.cloudDensity.toFixed(3),
        '--solar-night': result.nightAmount.toFixed(3),
        '--solar-halo-x': result.halo.x.toFixed(3), '--solar-halo-y': result.halo.y.toFixed(3)
      };
      for (const [key, value] of Object.entries(values)) phone.style.setProperty(key, value);
      phone.dataset.solarKey = result.key;
    }
    return result;
  }
  window.ChaenggimSolar = Object.freeze({ apply, compute, getState: () => lastState });
})();
