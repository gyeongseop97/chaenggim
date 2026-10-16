(() => {
  'use strict';

  const DISMISS_KEY = 'chaenggim.install.dismissedUntil.v1';
  const DISMISS_DAYS = 7 * 24 * 60 * 60 * 1000;
  const APP_ICON = 'assets/icons/icon-192.png?v=20261015-2';
  const modes = ['standalone', 'fullscreen', 'minimal-ui'].map(mode =>
    window.matchMedia('(display-mode: ' + mode + ')'));
  let installPrompt = null;
  let installedThisPage = false;
  let root, banner, dialog, primary, previousFocus;
  let previousOverflow = '';
  let modalOpen = false;
  let busy = false;
  let dismissedUntilMemory = 0;
  const inertStates = new Map();

  function platform() {
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh|MacIntel/.test(ua + ' ' + navigator.platform) && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const inApp = /KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER|DaumApps|Snapchat|TikTok|Twitter/i.test(ua);
    const otherIOS = ios && (inApp || /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua) || !/Safari/i.test(ua));
    return { ios, android, inApp, otherIOS, samsung: /SamsungBrowser/i.test(ua) };
  }

  function isApp() {
    return navigator.standalone === true || modes.some(mode => mode.matches) || installedThisPage;
  }

  function dismissed() {
    let until = dismissedUntilMemory;
    try { until = Math.max(until, Number(localStorage.getItem(DISMISS_KEY)) || 0); }
    catch { /* An in-memory dismissal still works when storage is blocked. */ }
    return until > Date.now();
  }

  function dismiss() {
    dismissedUntilMemory = Date.now() + DISMISS_DAYS;
    try { localStorage.setItem(DISMISS_KEY, String(dismissedUntilMemory)); }
    catch { /* Storage can be unavailable in private or restricted browsers. */ }
    hideBanner();
  }

  function hideBanner() {
    if (banner) banner.hidden = true;
    document.body?.classList.remove('chaenggim-install-visible');
  }

  function updateSpacing() {
    if (banner && !banner.hidden) {
      document.documentElement.style.setProperty('--pwa-install-space', (Math.ceil(banner.getBoundingClientRect().height) + 24) + 'px');
    }
  }

  function refresh() {
    if (!root) return;
    const p = platform();
    const app = isApp();
    primary.textContent = p.ios && !installPrompt ? '추가 순서 보기' : '추가하기';
    root.querySelector('[data-pwa-banner-description]').textContent = p.ios && !installPrompt
      ? 'Safari 공유 메뉴에서 한 번만 추가해요'
      : '매일의 날씨와 옷차림을 한 번에';
    primary.disabled = busy;
    document.querySelectorAll('[data-install-entry]').forEach(entry => { entry.hidden = app; });
    const show = !app && !dismissed() && (p.ios || p.android) && !modalOpen;
    banner.hidden = !show;
    document.body.classList.toggle('chaenggim-install-visible', show);
    if (show) updateSpacing();
    if (app && modalOpen) closeGuide();
  }

  // Keep the browser event until a real user click. Each event is used only once.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (!isApp()) installPrompt = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    installedThisPage = true;
    installPrompt = null;
    closeGuide();
    refresh();
  });
  modes.forEach(mode => {
    if (mode.addEventListener) mode.addEventListener('change', refresh);
    else if (mode.addListener) mode.addListener(refresh);
  });

  function guideMarkup() {
    const p = platform();
    const steps = p.ios ? [
      'Safari에서 이 사이트를 열어요.',
      '공유 버튼을 눌러요. 보이지 않으면 더보기(…)에서 공유를 찾아요.',
      '목록을 내려 ‘홈 화면에 추가’를 선택해요.',
      '‘웹 앱으로 열기’가 보이면 켜고, ‘추가’를 눌러요.'
    ] : p.samsung ? [
      '삼성 인터넷에서 메뉴(☰)를 눌러요.',
      '‘현재 페이지 추가’ 또는 ‘페이지 추가’ → ‘홈 화면’을 선택해요.',
      '이름을 확인하고 ‘추가’ 또는 ‘설치’를 눌러요.'
    ] : p.android ? [
      'Chrome에서 이 사이트를 열어요.',
      '더보기(⋮) → ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해요.',
      '‘설치’ 또는 ‘추가’를 눌러 마무리해요.'
    ] : [
      'Chrome 또는 Edge에서 이 사이트를 열어요.',
      '주소창의 설치 아이콘이나 브라우저 메뉴의 앱 설치를 선택해요.',
      '휴대폰에서는 같은 주소를 열고 홈 화면에 추가할 수 있어요.'
    ];
    const note = p.otherIOS ? '지금 보고 있는 브라우저에서는 메뉴가 다를 수 있어요. 주소를 복사해 Safari에서 열면 아래 순서로 추가할 수 있어요.' :
      p.inApp ? '앱 안의 브라우저에서는 설치 메뉴가 없을 수 있어요. 주소를 복사해 Chrome에서 열어 주세요.' :
      p.ios ? 'iPhone·iPad에서는 Safari 메뉴에서 직접 추가해 주세요.' :
      '브라우저 버전에 따라 메뉴 이름이 조금 다를 수 있어요.';
    return '<div class="pwa-guide-brand"><img src="' + APP_ICON + '" width="52" height="52" alt="챙김 앱 아이콘"><div><p class="pwa-eyebrow">내일도 가볍게, 챙김</p><h2 id="pwa-guide-title">홈 화면에 추가하기</h2></div></div>' +
      '<p id="pwa-guide-description">아이콘 한 번으로 날씨와 옷차림을 확인해요.</p>' +
      '<p class="pwa-guide-note">' + note + '</p>' +
      (p.ios ? '<div class="pwa-safari-path"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>공유</span><b aria-hidden="true">→</b><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/></svg>홈 화면에 추가</span></div>' : '') +
      (installPrompt ? '<button type="button" class="pwa-primary pwa-native-install" data-pwa-native>홈 화면에 추가하기</button>' : '') +
      '<ol class="pwa-guide-steps">' + steps.map(step => '<li>' + step + '</li>').join('') + '</ol>' +
      (p.ios ? '<p class="pwa-guide-tip">‘홈 화면에 추가’가 없다면 공유 목록 맨 아래 ‘동작 편집’에서 추가해 주세요.</p>' : '') +
      '<div class="pwa-copy-row"><button type="button" class="pwa-secondary" data-pwa-copy>사이트 주소 복사</button><span role="status" class="pwa-copy-status" data-pwa-copy-status></span></div>' +
      '<div class="pwa-url-fallback" hidden><label for="pwa-copy-url">아래 주소를 길게 눌러 복사해 주세요.</label><input id="pwa-copy-url" readonly aria-label="사이트 주소"></div>' +
      '<button type="button" class="pwa-primary pwa-guide-done" data-pwa-close>확인했어요</button>';
  }

  function setModalInert(inert) {
    if (inert) {
      for (const child of document.body.children) {
        if (child === root || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
        inertStates.set(child, child.inert);
        child.inert = true;
      }
    } else {
      inertStates.forEach((value, child) => { child.inert = value; });
      inertStates.clear();
    }
  }

  function openGuide() {
    if (!root || isApp() || modalOpen) return;
    previousFocus = document.activeElement;
    dialog.querySelector('[data-pwa-guide-body]').innerHTML = guideMarkup();
    modalOpen = true;
    hideBanner();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); root.classList.add('pwa-fallback-modal'); }
    setModalInert(true);
    dialog.querySelector('[data-pwa-close-top]').focus();
  }

  function closeGuide() {
    if (!modalOpen) return;
    modalOpen = false;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    root.classList.remove('pwa-fallback-modal');
    document.body.style.overflow = previousOverflow;
    setModalInert(false);
    refresh();
    if (previousFocus?.isConnected && !previousFocus.hidden && !previousFocus.closest('[hidden]')) previousFocus.focus();
  }

  async function requestInstall() {
    if (busy || isApp()) return;
    if (!installPrompt) { openGuide(); return; }
    const event = installPrompt;
    installPrompt = null;
    busy = true;
    primary.disabled = true;
    const nativeButton = dialog?.querySelector('[data-pwa-native]');
    if (nativeButton) nativeButton.disabled = true;
    let accepted = false;
    let failed = false;
    try {
      // prompt() must run directly in the click handler, before awaiting anything.
      const result = await event.prompt();
      const choice = result?.outcome ? result : await event.userChoice;
      accepted = choice?.outcome === 'accepted';
      if (accepted) {
        installedThisPage = true;
        hideBanner();
        closeGuide();
      } else dismiss();
    } catch {
      // The browser may revoke the event. Show the manual route instead.
      failed = true;
    } finally {
      busy = false;
      if (nativeButton?.isConnected) nativeButton.hidden = true;
      refresh();
    }
    if (!accepted && (failed || !dismissed())) openGuide();
  }

  async function copyAddress() {
    const status = dialog.querySelector('[data-pwa-copy-status]');
    if(location.protocol === 'file:') {
      status.textContent = '공유하려면 GitHub Pages로 게시한 HTTPS 주소에서 열어 주세요.';
      return;
    }
    // Exclude launch-only query parameters while keeping real routes intact.
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    const address = new URL(window.location.href);
    if (['pwa', 'homescreen'].includes(address.searchParams.get('source'))) address.searchParams.delete('source');
    address.hash = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(address.href);
      status.textContent = local ? '복사했어요. 다른 기기에서는 게시된 HTTPS 주소를 사용해 주세요.' : '복사했어요';
    } catch {
      const field = dialog.querySelector('.pwa-url-fallback');
      field.hidden = false;
      field.querySelector('input').value = address.href;
      field.querySelector('input').focus();
      field.querySelector('input').select();
      status.textContent = '';
    }
  }

  function init() {
    root = document.getElementById('pwa-install-root');
    if (!root) return;
    root.innerHTML = '<aside class="pwa-install-banner" aria-label="챙김 홈 화면 추가 안내" hidden>' +
      '<div class="pwa-banner-summary"><img src="' + APP_ICON + '" width="44" height="44" alt="챙김 앱 아이콘"><div><strong>챙김을 홈 화면에 추가해요</strong><p data-pwa-banner-description>매일의 날씨와 옷차림을 한 번에</p></div></div>' +
      '<div class="pwa-banner-actions"><button type="button" class="pwa-secondary" data-pwa-later>나중에</button><button type="button" class="pwa-primary" data-pwa-action>추가하기</button></div></aside>' +
      '<dialog class="pwa-install-dialog" aria-modal="true" aria-labelledby="pwa-guide-title" aria-describedby="pwa-guide-description"><button type="button" class="pwa-guide-close" aria-label="추가 안내 닫기" data-pwa-close-top>×</button><div data-pwa-guide-body></div></dialog>';
    banner = root.querySelector('.pwa-install-banner');
    dialog = root.querySelector('.pwa-install-dialog');
    primary = root.querySelector('[data-pwa-action]');
    primary.addEventListener('click', requestInstall);
    root.querySelector('[data-pwa-later]').addEventListener('click', dismiss);
    root.addEventListener('click', event => {
      if (event.target.closest('[data-pwa-close], [data-pwa-close-top]')) closeGuide();
      if (event.target.closest('[data-pwa-copy]')) copyAddress();
      if (event.target.closest('[data-pwa-native]')) requestInstall();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeGuide(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeGuide();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeGuide(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, input, a[href], [tabindex="0"]')]
        .filter(element => !element.disabled && !element.hidden && !element.closest('[hidden]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-install-entry]')) { event.preventDefault(); requestInstall(); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('resize', updateSpacing);
    if (typeof ResizeObserver === 'function') new ResizeObserver(updateSpacing).observe(banner);
    refresh();
  }

  window.ChaenggimInstall = Object.freeze({ open: openGuide, refresh });
  window.addEventListener('chaenggim:install-open', openGuide);
  function registerWorker() {
    if (window.isSecureContext && /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }
  }
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
