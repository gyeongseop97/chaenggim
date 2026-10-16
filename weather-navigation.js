(function () {
  'use strict';
  const root = document.getElementById('weather-ready-app');
  const nav = root?.querySelector('.bottom-nav');
  if (!nav || nav.dataset.liquidNavigation === 'ready') return;
  const buttons = [...nav.querySelectorAll('button[data-nav]')];
  if (buttons.length < 2) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lens = document.createElement('span');
  lens.className = 'nav-glass-lens';
  lens.setAttribute('aria-hidden', 'true');
  nav.prepend(lens);
  nav.classList.add('nav-has-lens');
  nav.dataset.liquidNavigation = 'ready';

  let selected = buttons.find(button => button.getAttribute('aria-current') === 'page')?.dataset.nav || buttons[0].dataset.nav;
  let boxes = [], gesture = null, frame = 0, previousTime = 0, suppressClickUntil = 0;
  let x = 0, y = 0, width = 0, height = 0, target = 0, velocity = 0, initialized = false;

  function paint(stretch = 1) {
    lens.style.width = width + 'px';
    lens.style.height = height + 'px';
    lens.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scaleX(' + stretch.toFixed(3) + ')';
  }
  function animate(time) {
    frame = 0;
    const dt = previousTime ? Math.min((time - previousTime) / 16.667, 2) : 1;
    previousTime = time;
    if (motion.matches) { x = target; velocity = 0; paint(); return; }
    velocity = (velocity + (target - x) * .22 * dt) * Math.pow(.54, dt);
    x += velocity * dt;
    const stretch = 1 + Math.min(Math.abs(velocity) / 260, gesture?.dragged ? .065 : .035) * .1;
    paint(stretch);
    if (Math.abs(target - x) > .08 || Math.abs(velocity) > .08) frame = requestAnimationFrame(animate);
    else { x = target; velocity = 0; previousTime = 0; paint(); }
  }
  function moveTo(value, immediately = false) {
    target = value;
    if (immediately || motion.matches) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; previousTime = 0; x = target; velocity = 0; paint();
    } else if (!frame) { previousTime = 0; frame = requestAnimationFrame(animate); }
  }
  function measure() {
    const boundary = nav.getBoundingClientRect();
    boxes = buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { name:button.dataset.nav, x:rect.left - boundary.left - nav.clientLeft, y:rect.top - boundary.top - nav.clientTop, width:rect.width, height:rect.height, center:rect.left + rect.width / 2 };
    });
    const active = boxes.find(box => box.name === selected) || boxes[0];
    if (!active || !active.width) return;
    width = active.width; height = active.height; y = active.y;
    if (!gesture?.dragged) moveTo(active.x, !initialized);
    else paint();
    initialized = true;
  }
  function sync(name) {
    if (buttons.some(button => button.dataset.nav === name)) selected = name;
    measure();
  }
  function navigate(name) {
    if (name === selected) return;
    selected = name;
    nav.dispatchEvent(new CustomEvent('chaenggim:navigate', { bubbles:true, detail:{ nav:name, fromGesture:true } }));
  }
  function finish(event) {
    if (!gesture || (event && event.pointerId !== gesture.id)) return;
    const completed = gesture;
    gesture = null;
    delete nav.dataset.dragging;
    if (completed.dragged) suppressClickUntil = performance.now() + 450;
    if (completed.owner.hasPointerCapture?.(completed.id)) completed.owner.releasePointerCapture(completed.id);
    measure();
  }

  nav.addEventListener('pointerdown', event => {
    const owner = event.target.closest('button[data-nav]');
    if (!event.isPrimary || event.button !== 0 || gesture || !owner) return;
    suppressClickUntil = 0;
    measure();
    const boundary = nav.getBoundingClientRect();
    const left = boundary.left + nav.clientLeft + x;
    if (event.clientX < left || event.clientX > left + width) return;
    // Keep the original button as capture owner: a bubbling loss from a child
    // must not end a touch when the browser transfers its implicit capture.
    moveTo(x, true);
    gesture = { id:event.pointerId, owner, startX:event.clientX, startLensX:x, dragged:false };
    owner.setPointerCapture?.(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.dragged && Math.abs(event.clientX - gesture.startX) < 5) return;
    if (!gesture.dragged) {
      gesture.dragged = true;
      nav.dataset.dragging = 'true';
    }
    event.preventDefault();
    const next = Math.max(boxes[0].x, Math.min(boxes[boxes.length - 1].x, gesture.startLensX + event.clientX - gesture.startX));
    const boundary = nav.getBoundingClientRect();
    const center = boundary.left + nav.clientLeft + next + width / 2;
    // Direct movement preserves the grabbed point; the spring is for release.
    moveTo(next, true);
    const nearest = boxes.reduce((best, box) => Math.abs(box.center - center) < Math.abs(best.center - center) ? box : best, boxes[0]);
    navigate(nearest.name);
  }, { passive:false });
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
  nav.addEventListener('lostpointercapture', event => {
    if (gesture && event.target === gesture.owner && !gesture.owner.hasPointerCapture?.(gesture.id)) finish(event);
  });
  nav.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  nav.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = buttons.indexOf(event.target.closest('button[data-nav]'));
    if (index < 0) return;
    const rtl = getComputedStyle(nav).direction === 'rtl';
    const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    let next;
    if (step) next = (index + step + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    navigate(buttons[next].dataset.nav);
    buttons[next].focus({ preventScroll:true });
    sync(selected);
  });

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(nav);
  if (!observer) window.addEventListener('resize', measure, { passive:true });
  motion.addEventListener?.('change', () => { measure(); if (motion.matches) moveTo(target, true); });
  window.addEventListener('blur', () => finish());
  window.ChaenggimNav = { sync };
  measure();
})();
