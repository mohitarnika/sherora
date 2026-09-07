'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootPath = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(rootPath, 'assets/js/sherora-launch.js'), 'utf8');
const html = fs.readFileSync(path.join(rootPath, 'index.html'), 'utf8');

function createPage({ storageBlocked = false, reducedMotion = false, preference = null } = {}) {
  class Target {
    constructor() {
      this.listeners = new Map();
      this.properties = {};
      this.style = {
        setProperty: (key, value) => { this.properties[key] = value; },
        removeProperty: (key) => { delete this.properties[key]; },
      };
    }
    addEventListener(name, handler) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(handler);
    }
    emit(name, event = {}) {
      for (const handler of this.listeners.get(name) || []) handler(event);
    }
    setAttribute(name, value) { this[name] = value; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  }

  const root = new Target();
  root.dataset = {};
  root.scrollHeight = 2000;
  const label = new Target();
  const toggle = new Target();
  toggle.querySelector = () => label;
  const hero = new Target();
  const heroImage = new Target();
  hero.querySelector = () => heroImage;
  const stage = new Target();
  const surface = new Target();
  stage.querySelector = () => surface;
  const reduced = new Target();
  reduced.matches = reducedMotion;
  const finePointer = new Target();
  finePointer.matches = true;
  const window = new Target();
  const document = new Target();
  const storage = new Map(preference === null ? [] : [['sherora-motion', preference]]);
  const frames = new Map();
  let frameId = 0;

  document.documentElement = root;
  document.hidden = false;
  document.querySelector = (selector) => ({
    '.hero': hero,
    '[data-motion-toggle]': toggle,
  })[selector] || null;
  document.querySelectorAll = (selector) => selector === '[data-tilt]' ? [stage] : [];
  window.matchMedia = (query) => query.includes('reduce') ? reduced : finePointer;
  window.innerHeight = 1000;
  window.scrollY = 0;
  window.localStorage = {
    getItem(key) {
      if (storageBlocked) throw new Error('Storage is unavailable');
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageBlocked) throw new Error('Storage is unavailable');
      storage.set(key, value);
    },
  };
  window.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  vm.runInNewContext(script, { window, document });

  return {
    root, label, toggle, hero, heroImage, stage, surface, reduced, finePointer,
    window, document, storage,
    flushFrames() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
  };
}

const mousePoint = { clientX: 100, clientY: 0, pointerType: 'mouse' };

test('motion toggle is visible, accessible, persistent, and reversible', () => {
  const page = createPage();
  assert.equal(page.root.dataset.motion, 'on');
  assert.equal(page.toggle.hidden, false);
  assert.equal(page.toggle['aria-pressed'], 'true');
  page.toggle.emit('click');
  assert.equal(page.root.dataset.motion, 'off');
  assert.equal(page.label.textContent, 'Motion off');
  assert.equal(page.toggle['aria-pressed'], 'false');
  assert.equal(page.storage.get('sherora-motion'), 'off');
  page.toggle.emit('click');
  assert.equal(page.root.dataset.motion, 'on');
  assert.equal(page.storage.get('sherora-motion'), 'on');
  assert.equal(createPage({ preference: 'off' }).root.dataset.motion, 'off');
});

test('system reduced motion wins over saved preference and updates dynamically', () => {
  const page = createPage({ reducedMotion: true, preference: 'on' });
  assert.equal(page.root.dataset.motion, 'off');
  assert.equal(page.toggle.disabled, true);
  assert.equal(page.toggle['aria-pressed'], 'false');
  assert.equal(page.label.textContent, 'Motion reduced');
  page.toggle.emit('click');
  assert.equal(page.storage.get('sherora-motion'), 'on');
  page.reduced.matches = false;
  page.reduced.emit('change');
  assert.equal(page.root.dataset.motion, 'on');
  assert.equal(page.toggle.disabled, false);
  page.reduced.matches = true;
  page.reduced.emit('change');
  assert.equal(page.root.dataset.motion, 'off');
});

test('unavailable browser storage does not break the motion control', () => {
  const page = createPage({ storageBlocked: true });
  page.toggle.emit('click');
  assert.equal(page.root.dataset.motion, 'off');
  page.toggle.emit('click');
  assert.equal(page.root.dataset.motion, 'on');
});

test('pointer motion is batched, bounded, and excluded for touch or coarse pointers', () => {
  const page = createPage();
  page.stage.emit('pointermove', { ...mousePoint, clientX: 900 });
  page.hero.emit('pointermove', { ...mousePoint, clientX: 900 });
  assert.deepEqual(page.surface.properties, {});
  page.flushFrames();
  assert.equal(page.surface.properties['--tilt-x'], '4.00deg');
  assert.equal(page.surface.properties['--tilt-y'], '4.00deg');
  assert.equal(page.heroImage.properties['--hx'], '7.00px');
  page.stage.emit('pointerleave');
  page.hero.emit('pointerleave');
  page.stage.emit('pointermove', { ...mousePoint, pointerType: 'touch' });
  page.hero.emit('pointermove', { ...mousePoint, pointerType: 'touch' });
  page.flushFrames();
  assert.deepEqual(page.surface.properties, {});
  assert.deepEqual(page.heroImage.properties, {});
  page.finePointer.matches = false;
  page.finePointer.emit('change');
  page.stage.emit('pointermove', mousePoint);
  page.flushFrames();
  assert.deepEqual(page.surface.properties, {});
});

test('pointer transforms reset on cancellation, blur, motion off, and hidden tabs', () => {
  const resetActions = [
    (page) => { page.stage.emit('pointercancel'); page.hero.emit('pointercancel'); },
    (page) => page.window.emit('blur'),
    (page) => page.toggle.emit('click'),
    (page) => { page.document.hidden = true; page.document.emit('visibilitychange'); },
  ];
  for (const reset of resetActions) {
    const page = createPage();
    page.stage.emit('pointermove', mousePoint);
    page.hero.emit('pointermove', mousePoint);
    page.flushFrames();
    assert.ok(page.surface.properties['--tilt-x']);
    reset(page);
    page.flushFrames();
    assert.deepEqual(page.surface.properties, {});
    assert.deepEqual(page.heroImage.properties, {});
  }
});

test('cross-tab preference updates and scroll progress stay synchronized', () => {
  const page = createPage();
  page.storage.set('sherora-motion', 'off');
  page.window.emit('storage', { key: 'sherora-motion' });
  assert.equal(page.root.dataset.motion, 'off');
  for (const [scrollY, expected] of [[9000, '1'], [-200, '0'], [500, '0.5']]) {
    page.window.scrollY = scrollY;
    page.window.emit('scroll');
    page.flushFrames();
    assert.equal(page.root.properties['--read'], expected);
  }
});

test('standalone page uses the launch assets and authentic local gallery links', () => {
  assert.match(html, /<link\b[^>]*href="assets\/css\/sherora-launch\.css"/);
  assert.match(html, /<script\b[^>]*src="assets\/js\/sherora-launch\.js"[^>]*\bdefer/);
  assert.doesNotMatch(html, /<iframe\b/i);
  const links = html.match(/<a\b[^>]*class="[^"]*\bgallery-photo\b[^"]*"[^>]*>/g) || [];
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.match(link, /href="https:\/\/www\.instagram\.com\/_devu_rajawat\/"/);
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="[^"\n]*\bnoopener\b[^"\n]*"/);
  }
});

test('founder family information and website-first launch sequence remain correct', () => {
  assert.match(html, /<dt>Mother<\/dt>\s*<dd>Neelam Rajawat<\/dd>/);
  assert.doesNotMatch(html, /Neelam Devi/);
  assert.match(html, /Satendra Singh Rajawat/);
  const websiteCard = html.match(/<article\b[^>]*launch-card--website[\s\S]*?<\/article>/)?.[0];
  const storeCard = html.match(/<article\b[^>]*launch-card--store[\s\S]*?<\/article>/)?.[0];
  assert.ok(websiteCard && storeCard, 'both opening cards are present');
  assert.ok(html.indexOf(websiteCard) < html.indexOf(storeCard), 'website card appears first');
  assert.match(websiteCard, /website is opening first/);
  assert.match(storeCard, /Coming soon · Gwalior/);
  assert.match(storeCard, /will follow the website opening/);
});
