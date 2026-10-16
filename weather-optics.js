/* A shared weather scene is sampled through curved glass surfaces. No DOM snapshots. */
(() => {
  'use strict';
  const phone = document.querySelector('#weather-ready-app .phone');
  if (!phone) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'weather-optics-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  phone.prepend(canvas);
  const opaque = matchMedia('(prefers-reduced-transparency: reduce)');
  const contrast = matchMedia('(prefers-contrast: more)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const surfaces = '.weather,.prep,.palette,.location-editor,.schedule-card,.schedule-form,.kma-warnings,.weather-status,.theme-status,.notice,.hourly-chart,.nav-glass-lens';
  let gl, program, uniforms, maxSurfaces = 12, frame = 0, trackUntil = 0, weatherTimer = 0;
  let renderedAt = 0, surfaceCount = 0, mode = 'fallback', failure = '';
  let colors = null, colorKey = '', lost = false, inView = true, layoutDirty = true, geometry = null;
  let weatherAnimated = false, backgroundFrameCount = 0;
  const vertex = 'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}';

  function fragmentSource(limit, precision) {
    return `precision ${precision} float;
      uniform vec2 uResolution;
      uniform vec4 uScrollClip;
      uniform vec3 uTop,uMid,uBase,uHalo;
      uniform float uNight,uSky,uTime,uCloud,uPrecip;
      uniform vec2 uSun;
      uniform int uCount;
      uniform vec4 uRects[${limit}];
      uniform vec4 uDetails[${limit}];
      uniform float uDpr;
      float ellipse(vec2 p,vec2 c,vec2 s){vec2 q=(p-c)/s;return exp(-dot(q,q)*2.);}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float rainLayer(vec2 px,float scale,float period){
        vec2 q=vec2((px.x+px.y*.17)/scale,px.y/scale);
        float column=floor(q.x/43.);
        float x=mod(q.x,43.)-9.-hash(vec2(column,scale))*25.;
        float y=mod(q.y-uTime*158./period+hash(vec2(column,scale+2.))*158.,158.);
        float tail=smoothstep(0.,3.,y)*(1.-smoothstep(16.,28.,y));
        return (1.-smoothstep(.1,.72,abs(x)))*tail;
      }
      float snowLayer(vec2 px,float scale,float period){
        vec2 q=px/scale;
        float row=mod(floor((q.y-uTime*128./period)/128.),240./period);
        float y=mod(q.y-uTime*128./period,128.);
        float column=floor(q.x/108.);
        float x=mod(q.x,108.)-20.-hash(vec2(column,row))*66.;
        x+=sin(uTime*.314159+hash(vec2(column,row+4.))*6.283185)*7.;
        float center=22.+hash(vec2(column,row+9.))*80.;
        return (1.-smoothstep(.45,1.9,length(vec2(x,y-center))))*smoothstep(0.,8.,y)*(1.-smoothstep(120.,128.,y));
      }
      vec3 scene(vec2 px){
        vec2 p=px/uResolution;
        float vertical=clamp(p.y+p.x*.075,0.,1.);
        vec3 c=mix(uTop,uMid,smoothstep(0.,.58,vertical));
        c=mix(c,uBase,smoothstep(.45,1.,vertical));
        float halo=ellipse(p,uSun,vec2(.72,.44));
        c=mix(c,uHalo,halo*mix(.43,.16,uNight));
        // Cloud banks stay in the upper sky; their slow drift is sampled by the glass too.
        float drift=sin(uTime*.05235988)*.023;
        float drift2=cos(uTime*.07853982)*.018;
        float cloud=ellipse(p,vec2(-.08+drift,.105),vec2(.36,.05));
        cloud+=ellipse(p,vec2(.15+drift,.075),vec2(.28,.08));
        cloud+=ellipse(p,vec2(.38+drift,.13),vec2(.33,.055));
        cloud+=ellipse(p,vec2(.81+drift2,.205),vec2(.42,.065))*.72;
        cloud+=ellipse(p,vec2(1.05+drift2,.16),vec2(.38,.09))*.85;
        float underside=ellipse(p,vec2(.26+drift,.17),vec2(.55,.045));
        c=mix(c,mix(uMid,uTop,.62),underside*uCloud*.065);
        c=mix(c,mix(vec3(1.),uHalo,.25),min(.49,cloud*.29)*uCloud*(1.-uNight*.64));
        if(uSky>3.5){
          float mist=ellipse(p,vec2(.5,.2),vec2(.96,.22));
          c=mix(c,mix(uMid,uHalo,.3),mist*.2);
        }
        if(uNight>.5&&uSky<.5){
          vec2 cell=floor(px/52.);vec2 local=mod(px,52.)-vec2(10.+hash(cell)*30.,8.+hash(cell+5.)*32.);
          float star=(1.-smoothstep(.1,1.1,length(local)))*step(.65,hash(cell+9.));
          c+=vec3(.32,.36,.42)*star*.45;
        }
        if(uPrecip>.5&&uPrecip<1.5||uPrecip>2.5){
          float rain=rainLayer(px,1.,2.)*.63+rainLayer(px,1.43,1.5)*.37;
          c=mix(c,mix(uHalo,vec3(.82,.91,.97),.4),rain*mix(.15,.22,uNight));
        }
        if(uPrecip>1.5){
          float snow=snowLayer(px,1.,20.)*.65+snowLayer(px,1.61,24.)*.35;
          c=mix(c,vec3(.96,.99,1.),snow*mix(.64,.48,uNight));
        }
        return c;
      }
      float roundedDistance(vec2 p,vec4 rect,float radius){
        vec2 q=abs(p-(rect.xy+rect.zw*.5))-(rect.zw*.5-radius);
        return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
      }
      vec2 roundedNormal(vec2 p,vec4 rect,float radius){
        vec2 local=p-(rect.xy+rect.zw*.5);
        vec2 q=abs(local)-(rect.zw*.5-radius);
        vec2 corner=max(q,0.);
        if(dot(corner,corner)>.0001)return normalize(corner)*sign(local);
        return q.x>q.y?vec2(sign(local.x),0.):vec2(0.,sign(local.y));
      }
      void main(){
        vec2 px=vec2(gl_FragCoord.x/uDpr,uResolution.y-gl_FragCoord.y/uDpr);
        vec3 backdrop=scene(px);
        vec3 color=backdrop;
        for(int i=0;i<${limit};i++){
          if(i<uCount){
            bool outsideClip=px.x<uScrollClip.x||px.y<uScrollClip.y||px.x>uScrollClip.z||px.y>uScrollClip.w;
            if(uDetails[i].w<.5&&outsideClip)continue;
            vec4 rect=uRects[i];float radius=uDetails[i].x;
            float distance=roundedDistance(px,rect,radius);
            float coverage=1.-smoothstep(-.65,.65,distance);
            // The broad penumbra is outside the surface rather than a painted outline.
            float shadow=exp(-max(distance,0.)/9.)*.025*(1.-coverage);
            color*=1.-shadow;
            if(distance<1.){
              vec2 normal=roundedNormal(px,rect,radius);
              float depth=max(0.,-distance);
              float edge=1.-smoothstep(0.,min(23.,radius+7.),depth);
              float bend=edge*edge*uDetails[i].y;
              vec3 glass=backdrop;
              // Flat interiors reuse the existing scene; only the curved edge needs new samples.
              if(edge>.001){
                vec2 samplePoint=px+normal*bend;
                glass=scene(samplePoint);
                // A fraction of a pixel of dispersion avoids coloured neon rims.
                float dispersion=.24*edge;
                glass.r=scene(samplePoint+normal*dispersion).r;
                glass.b=scene(samplePoint-normal*dispersion).b;
              }
              float facing=dot(normal,normalize(vec2(-.65,-1.)));
              float reflection=pow(edge,1.7)*max(facing,0.)*.13;
              float shade=pow(edge,1.5)*max(-facing,0.)*.045;
              glass=mix(glass,vec3(1.),reflection*(1.-uNight*.5));
              glass*=1.-shade;
              glass=mix(glass,mix(vec3(1.),uHalo,.25),uDetails[i].z);
              color=mix(color,glass,coverage);
            }
          }
        }
        gl_FragColor=vec4(color,1.);
      }`;
  }

  function fallback(reason) {
    mode = 'fallback'; failure = reason || ''; phone.dataset.glassOptics = 'fallback';
    canvas.hidden = true;
    stopAnimation();
  }

  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source); gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(item); gl.deleteShader(item); throw new Error(error || 'Shader compilation failed');
    }
    return item;
  }

  function initialize() {
    if (opaque.matches || contrast.matches) { fallback('accessibility'); return; }
    try {
      gl ||= canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl || gl.isContextLost()) { fallback('WebGL unavailable'); return; }
      maxSurfaces = Math.max(3, Math.min(12, Math.floor((gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) - 15) / 2)));
      const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragmentSource(maxSurfaces, high?.precision ? 'highp' : 'mediump'));
      const nextProgram = gl.createProgram();
      gl.attachShader(nextProgram, vs); gl.attachShader(nextProgram, fs); gl.linkProgram(nextProgram);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(nextProgram) || 'Shader link failed');
      if (program) gl.deleteProgram(program);
      program = nextProgram; gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['uResolution', 'uScrollClip', 'uTop', 'uMid', 'uBase', 'uHalo', 'uNight', 'uSky', 'uTime', 'uCloud', 'uPrecip', 'uSun', 'uCount', 'uRects[0]', 'uDetails[0]', 'uDpr'].map(name => [name, gl.getUniformLocation(program, name)]));
      lost = false; failure = ''; colorKey = ''; canvas.hidden = false;
      mode = 'pending'; refresh();
    } catch (error) { fallback(error.message); }
  }

  function color(value, defaultValue) {
    const text = value.trim();
    if (/^#[\da-f]{6}$/i.test(text)) return [1, 3, 5].map(offset => parseInt(text.slice(offset, offset + 2), 16) / 255);
    if (/^#[\da-f]{3}$/i.test(text)) return [1, 2, 3].map(offset => parseInt(text[offset] + text[offset], 16) / 255);
    const parts = text.match(/[\d.]+/g);
    return parts?.length >= 3 ? parts.slice(0, 3).map(value => Number(value) / 255) : defaultValue;
  }

  function sceneColors() {
    const key = `${phone.dataset.sky}:${phone.dataset.period}:${phone.dataset.solarKey || ''}`;
    if (colors && key === colorKey) return colors;
    colorKey = key;
    const css = getComputedStyle(phone);
    colors = {
      top: color(css.getPropertyValue('--glass-sky-top'), [.82, .89, .93]),
      mid: color(css.getPropertyValue('--glass-sky-mid'), [.9, .93, .95]),
      base: color(css.getPropertyValue('--glass-sky-base'), [.88, .91, .93]),
      halo: color(css.getPropertyValue('--glass-halo'), [.91, .96, 1]),
      night: Number.parseFloat(css.getPropertyValue('--solar-night')),
      cloud: Number.parseFloat(css.getPropertyValue('--solar-cloud-density')),
      sunX: Number.parseFloat(css.getPropertyValue('--solar-halo-x')),
      sunY: Number.parseFloat(css.getPropertyValue('--solar-halo-y'))
    };
    return colors;
  }

  function measure(bounds) {
    const candidates = [...phone.querySelectorAll(surfaces)].filter(element => !element.closest('.nav-page-snapshot,[hidden]'));
    // Keep the moving navigation lens even on long settings pages.
    candidates.sort((a, b) => Number(a.classList.contains('nav-glass-lens')) - Number(b.classList.contains('nav-glass-lens')));
    const visible = [];
    for (const element of candidates) {
      const box = element.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || box.bottom <= bounds.top || box.top >= bounds.bottom || box.right <= bounds.left || box.left >= bounds.right) continue;
      const css = getComputedStyle(element);
      if (css.visibility === 'hidden' || css.display === 'none') continue;
      const radius = Math.min(parseFloat(css.borderTopLeftRadius) || 16, box.width / 2, box.height / 2);
      visible.push({ box, radius, lens: element.classList.contains('nav-glass-lens') });
    }
    if (visible.length > maxSurfaces) {
      const lens = visible.find(item => item.lens);
      const selected = visible.filter(item => !item.lens).slice(0, maxSurfaces - (lens ? 1 : 0));
      return lens ? [...selected, lens] : selected;
    }
    return visible;
  }

  function paint(now) {
    frame = 0;
    if (!gl || !program || lost || opaque.matches || contrast.matches || document.hidden || !inView) { weatherAnimated = false; return; }
    const moving = phone.querySelector('[data-app-scroll]')?.getAnimations().some(item => item.playState === 'running');
    const tracking = moving || now < trackUntil;
    if (layoutDirty || tracking || !geometry) {
      const bounds = phone.getBoundingClientRect();
      geometry = { bounds, scrollBounds: phone.querySelector('[data-app-scroll]')?.getBoundingClientRect() || bounds, panes: measure(bounds) };
      layoutDirty = false;
    }
    const { bounds, scrollBounds, panes } = geometry;
    if (bounds.width < 2 || bounds.height < 2) { weatherAnimated = false; return; }
    // Only a soft sky and refracted light use this canvas; native text/art stay at device resolution.
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    const width = Math.max(1, Math.round(bounds.width * dpr)), height = Math.max(1, Math.round(bounds.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.useProgram(program);
    // Effective DPR follows the real rounded backing-store size, preventing drifting edges.
    const effectiveDpr = width / bounds.width;
    gl.uniform2f(uniforms.uResolution, bounds.width, height / effectiveDpr);
    gl.uniform1f(uniforms.uDpr, effectiveDpr);
    gl.uniform4f(uniforms.uScrollClip,
      Math.max(0, scrollBounds.left - bounds.left), Math.max(0, scrollBounds.top - bounds.top),
      Math.min(bounds.width, scrollBounds.right - bounds.left), Math.min(bounds.height, scrollBounds.bottom - bounds.top));
    const palette = sceneColors();
    gl.uniform3fv(uniforms.uTop, palette.top); gl.uniform3fv(uniforms.uMid, palette.mid);
    gl.uniform3fv(uniforms.uBase, palette.base); gl.uniform3fv(uniforms.uHalo, palette.halo);
    const kind = phone.dataset.weatherKind || phone.dataset.sky || 'partly';
    const cloud = Number.isFinite(palette.cloud) ? palette.cloud : ({ clear: 0, partly: .42, cloud: .94, rain: .97, snow: .8 })[kind] ?? .42;
    const night = Number.isFinite(palette.night) ? palette.night : phone.dataset.period === 'night' ? 1 : 0;
    gl.uniform1f(uniforms.uNight, night);
    gl.uniform1f(uniforms.uSky, ({ clear: 0, partly: 1, cloud: 1, rain: 2, snow: 3, mixed: 2, storm: 2, fog: 4 })[kind] ?? 1);
    gl.uniform1f(uniforms.uCloud, cloud);
    gl.uniform1f(uniforms.uPrecip, ({ rain: 1, storm: 1, snow: 2, mixed: 3 })[kind] || 0);
    // Every procedural period divides 240s, including the drifting particle seeds.
    gl.uniform1f(uniforms.uTime, reducedMotion.matches ? 0 : now / 1000 % 240);
    gl.uniform2f(uniforms.uSun, Number.isFinite(palette.sunX) ? palette.sunX : .94, Number.isFinite(palette.sunY) ? palette.sunY : .05);
    const rects = new Float32Array(maxSurfaces * 4), details = new Float32Array(maxSurfaces * 4);
    panes.forEach((item, index) => {
      rects.set([item.box.left - bounds.left, item.box.top - bounds.top, item.box.width, item.box.height], index * 4);
      details.set([item.radius, item.lens ? 15 : 19, item.lens ? .02 : .01, item.lens ? 1 : 0], index * 4);
    });
    surfaceCount = panes.length;
    gl.uniform1i(uniforms.uCount, surfaceCount);
    gl.uniform4fv(uniforms['uRects[0]'], rects); gl.uniform4fv(uniforms['uDetails[0]'], details);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (gl.getError() !== gl.NO_ERROR) { fallback('WebGL draw failed'); return; }
    if (mode !== 'ready') { mode = 'ready'; phone.dataset.glassOptics = 'ready'; canvas.hidden = false; }
    renderedAt = now;
    backgroundFrameCount++;
    weatherAnimated = cloud > .05 && !reducedMotion.matches;
    if (tracking) frame = requestAnimationFrame(paint);
    else if (weatherAnimated) {
      // A low-rate sky never keeps layout measurement or a 60fps draw loop alive.
      weatherTimer = setTimeout(() => { weatherTimer = 0; if (!frame) frame = requestAnimationFrame(paint); }, 1000 / 24);
    }
  }

  function refresh() {
    layoutDirty = true;
    if (weatherTimer) { clearTimeout(weatherTimer); weatherTimer = 0; }
    if (!frame && program && !lost && !opaque.matches && !contrast.matches && !document.hidden && inView) frame = requestAnimationFrame(paint);
  }

  function stopAnimation() {
    if (frame) cancelAnimationFrame(frame);
    if (weatherTimer) clearTimeout(weatherTimer);
    frame = 0; weatherTimer = 0; weatherAnimated = false;
  }

  function followTransition() { trackUntil = performance.now() + 320; refresh(); }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; fallback('context lost'); });
  canvas.addEventListener('webglcontextrestored', () => { program = null; uniforms = null; gl = null; initialize(); });
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.target !== canvas)) refresh();
  });
  observer.observe(phone, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-sky', 'data-period', 'data-weather-kind', 'data-solar-key', 'hidden'] });
  new ResizeObserver(refresh).observe(phone);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    inView = entries[0]?.isIntersecting !== false;
    phone.dataset.backgroundPaused = String(!inView || document.hidden);
    if (inView) refresh(); else stopAnimation();
  }).observe(phone);
  phone.addEventListener('scroll', refresh, { capture: true, passive: true });
  phone.addEventListener('chaenggim:navigate', followTransition);
  phone.addEventListener('click', event => { if (event.target.closest('[data-nav]')) followTransition(); }, { capture: true });
  addEventListener('resize', refresh, { passive: true });
  visualViewport?.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('visibilitychange', () => {
    phone.dataset.backgroundPaused = String(!inView || document.hidden);
    if (document.hidden) stopAnimation(); else refresh();
  });
  document.fonts?.ready.then(refresh);
  const preferences = () => {
    if (opaque.matches || contrast.matches) fallback('accessibility');
    else initialize();
  };
  opaque.addEventListener?.('change', preferences); contrast.addEventListener?.('change', preferences);
  reducedMotion.addEventListener?.('change', () => { stopAnimation(); refresh(); });
  window.ChaenggimGlass = Object.freeze({
    refresh,
    getStatus: () => ({ mode, surfaceCount, maxSurfaces, renderedAt, contextLost: lost, failure, weatherAnimated,
      animationActive: !!(frame || weatherTimer), reducedMotion: reducedMotion.matches,
      backgroundVisible: inView && !document.hidden, backgroundFrameCount })
  });
  initialize();
})();
