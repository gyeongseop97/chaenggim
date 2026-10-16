(() => {
  'use strict';

  const LOOP_DURATION = 12000;
  const clock = () => typeof document.timeline?.currentTime === 'number'
    ? document.timeline.currentTime : (window.performance?.now?.() ?? Date.now());
  const epoch = clock();
  let pausedAt = document.hidden ? epoch : null;
  let pausedDuration = 0;
  const kinds = Object.freeze({
    '맑음': 'clear',
    '구름 조금': 'partly',
    '구름 많음': 'cloudy',
    '흐림': 'cloudy',
    '안개': 'fog',
    '비': 'rain',
    '눈': 'snow',
    '비/눈': 'sleet',
    '뇌우': 'storm'
  });

  // The initial negative delay is a CSS fallback. Once the card is attached,
  // sync() anchors every layer to the document timeline so a busy paint cannot
  // restart the scene after the minute refresh replaces the card.
  function loopDelay() {
    const elapsed = (pausedAt ?? clock()) - epoch - pausedDuration;
    return -(elapsed % LOOP_DURATION).toFixed(3) + 'ms';
  }

  function sync() {
    const elapsed = Math.max(0, (pausedAt ?? clock()) - epoch - pausedDuration);
    document.querySelectorAll('.weather-illustration[data-loop-duration]').forEach(art => {
      art.dataset.motion = document.hidden ? 'paused' : 'running';
      if (typeof art.getAnimations !== 'function') return;
      // Keep each layer's fixed star/fog stagger, and remove only the temporary
      // creation delay before setting a shared absolute start time.
      art.style.setProperty('--weather-loop-delay', '0ms');
      art.getAnimations({subtree:true}).forEach(animation => {
        if (document.hidden) {
          animation.pause();
          animation.currentTime = elapsed;
        } else {
          animation.play();
          animation.startTime = epoch + pausedDuration;
        }
      });
    });
  }

  function syncVisibility() {
    const now = clock();
    if (document.hidden && pausedAt === null) pausedAt = now;
    else if (!document.hidden && pausedAt !== null) {
      pausedDuration += now - pausedAt;
      pausedAt = null;
    }
    sync();
  }
  document.addEventListener('visibilitychange', syncVisibility);

  function sun() {
    return '<g class="weather-art-sun"><circle class="weather-sun-halo" cx="60" cy="58" r="39" fill="#ffeeb4" opacity=".3"/>' +
      '<g class="weather-sun-rays" fill="none" stroke="#efc464" stroke-width="2.8" stroke-linecap="round"><path d="M60 12v7M60 97v7M14 58h7M99 58h7M27 25l5 5M88 86l5 5M27 91l5-5M88 30l5-5"/></g>' +
      '<g class="weather-sun-orb"><circle cx="60" cy="58" r="27" fill="#edb650"/><circle cx="59" cy="55" r="25" fill="#ffda82"/>' +
      '<path d="M40 49a21 21 0 0 1 30-11" fill="none" stroke="#fff2c0" stroke-width="4" stroke-linecap="round" opacity=".85"/>' +
      '<circle cx="70" cy="67" r="13" fill="#f6c35f" opacity=".28"/></g></g>';
  }

  function moon() {
    return '<g class="weather-art-moon"><g class="weather-moon-body"><circle class="weather-moon-halo" cx="66" cy="58" r="44" fill="#b9cfff" opacity=".1"/>' +
      '<path d="M76 23C56 22 40 37 40 57c0 20 16 36 36 36 11 0 21-5 27-13-23 5-43-12-43-35 0-8 6-17 16-22Z" fill="#b8ccea"/>' +
      '<path d="M73 23C54 24 43 38 43 56c0 18 14 33 32 34 8 0 16-3 22-7-24 0-40-16-40-38 0-8 6-17 16-22Z" fill="#e5edff"/></g>' +
      '<path class="weather-star weather-star-one" d="m25 34 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#e8efff"/>' +
      '<path class="weather-star weather-star-two" d="m93 26 1.5 4.5L99 32l-4.5 1.5L93 38l-1.5-4.5L87 32l4.5-1.5Z" fill="#e8efff"/>' +
      '<circle class="weather-star weather-star-three" cx="26" cy="75" r="2" fill="#c4d8f9"/><circle class="weather-star weather-star-four" cx="103" cy="57" r="1.7" fill="#c4d8f9"/></g>';
  }

  function cloud(night, dark = false, rear = false) {
    const base = night ? (dark ? '#8196b8' : '#b3c7de') : (dark ? '#a2b8cc' : '#e7f0f5');
    const top = night ? (dark ? '#a4b3cc' : '#deebf4') : (dark ? '#d1deeb' : '#ffffff');
    return '<g class="weather-art-cloud' + (rear ? ' weather-cloud-rear' : '') + '"><path d="M30 81C18 81 11 73 13 63c2-10 11-16 21-14 3-13 14-20 27-17 11 2 18 10 19 20 12-3 23 5 24 16 1 8-6 14-15 14Z" fill="' + base + '"/>' +
      '<path d="M29 75c-9 0-15-5-13-13 2-7 9-12 18-10l3 1 1-4c3-10 12-16 22-14 10 2 16 9 16 18l1 4 4-1c9-3 18 3 20 11 0 3-1 6-3 8Z" fill="' + top + '"/>' +
      '<path d="M21 62c2-5 7-7 13-6M43 46c5-7 13-9 20-5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".5"/></g>';
  }

  function snowField(night, mixed) {
    const flake = '<path d="M0-3.2v6.4M-2.8-1.6l5.6 3.2M-2.8 1.6l5.6-3.2"/>';
    const row = '<g transform="translate(12 2)">' + flake + '</g><g transform="translate(38 17) scale(.72)">' + flake + '</g><g transform="translate(66 9) scale(.88)">' + flake + '</g>';
    const rows = [-36, 0, 36, 72].map(y => '<g transform="translate(0 ' + y + ')">' + row + '</g>').join('');
    return '<g class="weather-snow-sway" opacity="' + (mixed ? '.72' : '.9') + '"><g class="weather-snowfall" fill="none" stroke="' + (night ? '#d1f0f7' : '#72a4b8') + '" stroke-width="1.5" stroke-linecap="round">' + rows + '</g></g>';
  }

  function precipitation(night, kind) {
    const mixed = kind === 'sleet';
    const rain = kind === 'rain' || mixed;
    let field = '';
    if (rain) {
      const positions = mixed ? [16, 43, 70] : [8, 26, 44, 62, 80];
      field += '<g fill="none" stroke="' + (night ? '#a7cff0' : '#629bc2') + '" stroke-width="2.6" stroke-linecap="round" opacity=".85">' +
        positions.map((x, index) => '<path class="weather-rain-stream" style="--rain-seed:' + (index * 4) + 'px" d="M' + x + ' -20l-30 90"/>').join('') + '</g>';
    }
    if (kind === 'snow' || mixed) field += snowField(night, mixed);
    // The nested viewport clips periodic precipitation at both edges. Each
    // moving field advances by an exact tile/dash interval over twelve seconds.
    return '<svg class="weather-precipitation" x="21" y="82" width="78" height="32" viewBox="0 0 78 32" overflow="hidden">' + field + '</svg>';
  }

  function fog(night) {
    const color = night ? '#bfd6d7' : '#96b5b2';
    return '<g fill="none" stroke="' + color + '" stroke-width="3.6" stroke-linecap="round"><path class="weather-fog-line" d="M21 82h78"/>' +
      '<path class="weather-fog-line weather-fog-middle" d="M14 93h63"/><path class="weather-fog-line weather-fog-lower" d="M42 104h58"/></g>';
  }

  function lightning() {
    return '<g class="weather-lightning-halo"><ellipse cx="63" cy="83" rx="24" ry="25" fill="#ffdfa3" opacity=".15"/></g>' +
      '<g class="weather-lightning"><path d="m62 76-16 22h13l-5 17 24-29H64l6-10Z" fill="#e9bc61"/><path d="m62 76-13 19h13l-4 13 16-20H61l6-12Z" fill="#ffe2a1"/></g>';
  }

  function illustration(kind, phase) {
    const night = phase === 'night';
    let artwork = '';
    if (kind === 'clear') {
      artwork = night ? moon() : sun();
    } else if (kind === 'partly') {
      artwork = '<g transform="translate(29 -2) scale(.73)">' + (night ? moon() : sun()) + '</g><g transform="translate(-4 8)">' + cloud(night) + '</g>';
    } else if (kind === 'fog') {
      artwork = '<g transform="translate(0 -8)" opacity=".82">' + cloud(night) + '</g>' + fog(night);
    } else if (kind === 'rain' || kind === 'sleet') {
      artwork = precipitation(night, kind) + cloud(night, true);
    } else if (kind === 'snow') {
      artwork = precipitation(night, kind) + cloud(night);
    } else if (kind === 'storm') {
      artwork = lightning() + cloud(night, true);
    } else {
      artwork = '<g transform="translate(-11 -8) scale(.8)" opacity=".5">' + cloud(night, true, true) + '</g><g transform="translate(0 8)">' + cloud(night, kind === 'cloudy') + '</g>';
    }
    return '<svg class="weather-illustration" data-weather-art="' + kind + '" data-loop-duration="' + LOOP_DURATION + '" data-motion="' + (document.hidden ? 'paused' : 'running') + '" style="--weather-loop-delay:' + loopDelay() + '" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + artwork + '</svg>';
  }

  function presentation(now) {
    const current = now && typeof now === 'object' ? now : {};
    const kind = Object.prototype.hasOwnProperty.call(kinds, current.condition) ? kinds[current.condition] : 'unknown';
    const phase = current.isDay === false ? 'night' : 'day';
    return {kind, phase, art: illustration(kind, phase)};
  }

  window.ChaenggimWeatherCard = Object.freeze({presentation, sync});
})();
