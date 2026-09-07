(() => {
  'use strict';

  const root = document.documentElement;
  const storageKey = 'sherora-motion';
  const toggle = document.querySelector('[data-motion-toggle]');
  const label = toggle?.querySelector('[data-motion-label]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const hero = document.querySelector('.hero');
  const heroImage = hero?.querySelector('[data-hero-image]');
  const tiltItems = Array.from(document.querySelectorAll('[data-tilt]'))
    .map((stage) => ({ stage, surface: stage.querySelector('[data-tilt-surface]') }))
    .filter(({ surface }) => surface);
  const pendingTilts = new Map();
  const entranceAnimations = new Set();
  let heroPoint = null;
  let pointerFrame = 0;
  let progressFrame = 0;
  let userChoice = readPreference();
  let motionEnabled = false;

  function readPreference() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === 'off' || value === 'on' ? value : null;
    } catch {
      return null;
    }
  }

  function motionActive() {
    return motionEnabled && !document.hidden;
  }

  function canTilt(event) {
    return motionActive() && precisePointer.matches && event?.pointerType !== 'touch';
  }

  function clearTilt(item) {
    pendingTilts.delete(item);
    item.surface.style.removeProperty('--tilt-x');
    item.surface.style.removeProperty('--tilt-y');
  }

  function clearHero() {
    heroPoint = null;
    heroImage?.style.removeProperty('--hx');
    heroImage?.style.removeProperty('--hy');
  }

  function resetPointers() {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    tiltItems.forEach(clearTilt);
    clearHero();
  }

  function cancelEntrances() {
    entranceAnimations.forEach((animation) => animation.cancel());
    entranceAnimations.clear();
  }

  function applyMotion() {
    motionEnabled = !reduced.matches && userChoice !== 'off';
    root.dataset.motion = motionActive() ? 'on' : 'off';

    if (toggle) {
      toggle.hidden = false;
      toggle.disabled = reduced.matches;
      toggle.setAttribute('aria-pressed', String(motionEnabled));
      toggle.setAttribute('aria-label', reduced.matches
        ? 'Decorative motion is reduced by your device preference'
        : `Turn decorative motion ${motionEnabled ? 'off' : 'on'}`);
      if (label) label.textContent = reduced.matches
        ? 'Motion reduced'
        : `Motion ${motionEnabled ? 'on' : 'off'}`;
    }

    if (!motionActive()) {
      resetPointers();
      cancelEntrances();
    }
  }

  function normalizedPoint(element, point) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return { x: 0, y: 0 };
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    return {
      x: clamp(((point.x - bounds.left) / bounds.width) * 2 - 1),
      y: clamp(((point.y - bounds.top) / bounds.height) * 2 - 1),
    };
  }

  function renderPointers() {
    pointerFrame = 0;
    if (!canTilt()) {
      resetPointers();
      return;
    }

    // Read geometry together before writing transforms to avoid layout thrashing.
    const updates = Array.from(pendingTilts, ([item, point]) => ({
      item,
      point: normalizedPoint(item.stage, point),
    }));
    const nextHero = heroPoint && hero && heroImage
      ? normalizedPoint(hero, heroPoint)
      : null;
    pendingTilts.clear();
    heroPoint = null;

    updates.forEach(({ item, point }) => {
      item.surface.style.setProperty('--tilt-x', `${(-point.y * 4).toFixed(2)}deg`);
      item.surface.style.setProperty('--tilt-y', `${(point.x * 4).toFixed(2)}deg`);
    });
    if (nextHero) {
      heroImage.style.setProperty('--hx', `${(nextHero.x * 7).toFixed(2)}px`);
      heroImage.style.setProperty('--hy', `${(nextHero.y * 7).toFixed(2)}px`);
    }
  }

  function schedulePointers() {
    if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointers);
  }

  function watchMedia(query, callback) {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', callback);
    } else if (typeof query.addListener === 'function') {
      query.addListener(callback);
    }
  }

  function updateProgress() {
    progressFrame = 0;
    const scrollable = root.scrollHeight - window.innerHeight;
    const amount = scrollable > 0 ? window.scrollY / scrollable : 0;
    root.style.setProperty('--read', String(Math.max(0, Math.min(1, amount))));
  }

  function scheduleProgress() {
    if (!progressFrame && !document.hidden) {
      progressFrame = window.requestAnimationFrame(updateProgress);
    }
  }

  toggle?.addEventListener('click', () => {
    if (reduced.matches) return;
    userChoice = motionEnabled ? 'off' : 'on';
    try {
      window.localStorage.setItem(storageKey, userChoice);
    } catch {
      // Motion controls still work when browser storage is unavailable.
    }
    applyMotion();
  });

  tiltItems.forEach((item) => {
    item.stage.addEventListener('pointermove', (event) => {
      if (!canTilt(event)) return;
      pendingTilts.set(item, { x: event.clientX, y: event.clientY });
      schedulePointers();
    }, { passive: true });
    item.stage.addEventListener('pointerleave', () => clearTilt(item));
    item.stage.addEventListener('pointercancel', () => clearTilt(item));
  });

  if (hero && heroImage) {
    hero.addEventListener('pointermove', (event) => {
      if (!canTilt(event)) return;
      heroPoint = { x: event.clientX, y: event.clientY };
      schedulePointers();
    }, { passive: true });
    hero.addEventListener('pointerleave', clearHero);
    hero.addEventListener('pointercancel', clearHero);
  }

  watchMedia(reduced, applyMotion);
  watchMedia(precisePointer, resetPointers);
  window.addEventListener('blur', resetPointers);
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    userChoice = readPreference();
    applyMotion();
  });
  document.addEventListener('visibilitychange', () => {
    applyMotion();
    if (document.hidden) {
      if (progressFrame) window.cancelAnimationFrame(progressFrame);
      progressFrame = 0;
    } else {
      scheduleProgress();
    }
  });
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', () => {
    resetPointers();
    scheduleProgress();
  }, { passive: true });
  window.addEventListener('load', scheduleProgress, { once: true });
  window.addEventListener('pageshow', () => {
    applyMotion();
    scheduleProgress();
  });

  applyMotion();
  updateProgress();

  // HTML is visible first; animation is an enhancement, never a reveal gate.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        if (!motionActive() || typeof target.animate !== 'function') return;
        try {
          const animation = target.animate([
            { opacity: 0, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' });
          entranceAnimations.add(animation);
          animation.finished.then(
            () => entranceAnimations.delete(animation),
            () => entranceAnimations.delete(animation),
          );
        } catch {
          // Unsupported animation must never hide meaningful page content.
        }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
  }
})();
