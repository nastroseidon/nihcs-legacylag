// Runs the real game script against a stub DOM, so the game can be driven
// deterministically from Node. This exists because the preview pane suspends
// requestAnimationFrame -- the game cannot be played there at all -- and because
// asserting on state beats squinting at screenshots.
//
//   import {dmw, pump, elem, startRun, toGoal, drainAchievements} from './tools/testharness.mjs';
//   pump(5); startRun(); toGoal(); console.log(drainAchievements());
//
// Defaults to FullHTML.html; set GAME_FILE to point at index.html instead.
// pump(n) runs n frames. Everything is synchronous: no waiting, no flakiness.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(process.env.GAME_FILE || path.join(ROOT, 'FullHTML.html'), 'utf8');
const code = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

function el(id) {
  const listeners = {};
  const e = {
    id, _text: '', innerHTML: '', value: '', disabled: false, scrollTop: 0,
    get textContent() { return e._text; },
    set textContent(v) { e._text = String(v); if (v === '') e.children.length = 0; },
    dataset: {}, type: '', _classes: new Set(),
    style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    get className() { return [...e._classes].join(' '); },
    set className(v) { e._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => c.forEach(x => e._classes.add(x)),
      remove: (...c) => c.forEach(x => e._classes.delete(x)),
      contains: c => e._classes.has(c),
      toggle: (c, on) => { if (on === undefined) on = !e._classes.has(c); on ? e._classes.add(c) : e._classes.delete(c); },
    },
    addEventListener: (t, fn) => (listeners[t] ||= []).push(fn),
    _attrs: {},
    setAttribute(k, v) { e._attrs[k] = String(v); },
    getAttribute(k) { return k in e._attrs ? e._attrs[k] : null; },
    blur() {}, focus() {},
    _q: {},
    querySelector(sel) { return e._q[sel] || (e._q[sel] = el(id + ' ' + sel)); },
    getContext: () => ctx2d,
    children: [],
    appendChild(c) { e.children.push(c); return c; },
    remove() {}, click() { e.fire('click'); },
    // walk the subtree, so tests can find what renderAchievements built
    find(pred, out = []) {
      for (const c of e.children) { if (pred(c)) out.push(c); c.find && c.find(pred, out); }
      return out;
    },
    fire(t, ev = {}) { (listeners[t] || []).forEach(fn => fn.call(e, { stopPropagation() {}, preventDefault() {}, ...ev })); },
    get hidden() { return e._classes.has('hidden'); },
    get clientWidth() { return 1280; },
  };
  return e;
}
const ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    return () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});

const els = {};
const getEl = id => (els[id] ||= el(id));
const lsBtns = [0, 1, 2, 3, 4, 5, 6].map(n => { const b = el('ls' + n); b.dataset.lvl = String(n); return b; });

const winListeners = {};
let rafQueue = [];
let clock = 0;

const win = {
  console,
  document: {
    getElementById: getEl,
    querySelector: sel => (sel === '.lsRow' ? getEl('lsRow') : getEl(sel)),
    querySelectorAll: sel => (sel === '.lsBtn' ? lsBtns : []),
    createElement: (tag) => el(tag),
    body: { appendChild() {}, removeChild() {} },
    documentElement: el('html'),   // no fullscreen API on it, as in an old browser
    addEventListener() {},
  },
  addEventListener(t, fn) { (winListeners[t] ||= []).push(fn); },
  requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
  performance: { now: () => clock },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('offline')),
  Image: class { set src(v) { this._src = v; queueMicrotask(() => this.onerror && this.onerror()); } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  Blob: class {},
};
const ctx = vm.createContext(win);
ctx.window = ctx;
ctx.self = ctx;
// wall clock the tests can move: the run timer uses Date.now()
let wall = 1700000000000;
ctx.Date = new Proxy(Date, { get: (t, k) => (k === 'now' ? () => wall : Reflect.get(t, k)) });
export function advanceWall(ms) { wall += ms; }
vm.runInContext(code, ctx, { filename: 'game.js' });

const G = ctx.window.__dmw;

// ---- driving ----
export function pump(n = 1) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue; rafQueue = []; clock += 16.7;
    for (const fn of q) fn(clock);
  }
}
export function advance(ms) { clock += ms; }
export const dmw = () => G;
export const elem = getEl;
export const buttons = lsBtns;
// deliver a postMessage from the embedded 3D Level 6
export function fireMessage(data) {
  (winListeners.message || []).forEach(fn => fn({ data }));
}

// Dismiss every queued achievement screen, returning the titles seen.
export function drainAchievements(max = 12) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    pump(20);
    if (elem('achieve').hidden) break;
    seen.push(elem('achieveTitle').textContent);
    elem('achieveBtn').fire('click');
    pump(40);   // let the fade finish
  }
  pump(20);
  return seen;
}
// Real key events, for anything driven by the keyboard rather than by clicks --
// the character carousel, the admin shortcuts, ESC.
function fireKey(type, code, mods = {}) {
  const e = { code, shiftKey: !!mods.shift, target: null, preventDefault() {} };
  for (const fn of winListeners[type] || []) fn(e);
}
export function keydown(code, mods) { fireKey('keydown', code, mods); }
export function keyup(code, mods) { fireKey('keyup', code, mods); }
// Press and release, running frames in between so an edge-detected reader sees it.
export function press(code, frames = 2) { keydown(code); pump(frames); keyup(code); pump(1); }

export function startRun() { elem('overlay').fire('click'); pump(60); }
export function chooseLevel(n) { buttons[n].fire('click'); pump(60); }
export function toGoal() { G.toGoal(); pump(3); }

// Sit just far enough left of each coin to touch it without also touching the
// goal, which sits right beside the last coin on several levels.
export function collectAllCoins() {
  const p = G.player;
  for (const c of G.coins) {
    if (c.got) continue;
    p.x = c.x - 40; p.y = c.y - 30; p.vx = 0; p.vy = 0; p.invuln = 999; p.lock = 0;
    pump(1);
    if (G.state !== 'playing') throw new Error('left play while collecting at ' + c.x + ',' + c.y);
  }
  p.invuln = 999;
}
// Park each bot at the near end of its patrol first, so the drop never lands on
// the goal, then fall onto it from just above.
export function stompAllEnemies() {
  const p = G.player;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    e.x = e.minX;
    for (let tries = 0; tries < 4 && e.alive; tries++) {
      p.x = e.x; p.y = e.floorY - e.h - p.h - 4; p.vy = 6; p.vx = 0; p.invuln = 999; p.lock = 0;
      pump(1);
      if (G.state !== 'playing') throw new Error('left play while stomping at ' + Math.round(e.x));
    }
  }
  p.invuln = 999;
}
