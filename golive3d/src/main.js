// Bootstrap: renderer, fixed-timestep loop, cinematic side camera, HUD, screens.
import * as THREE from '../lib/three.module.js';
import { createEngine } from './engine.js';
import { U, Y, GROUND, PHYS } from './leveldata.js';
import { buildWorld } from './world.js';
import { createPlayerVisual } from './character.js';
import { createEnemyVisuals } from './enemies.js';
import { createVFX } from './vfx.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';

const px2 = (x, y) => new THREE.Vector3(U(x), Y(y), 0);

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- input ----------
const keys = { left: false, right: false, jump: false, scan: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyE: 'scan', KeyX: 'scan', ShiftLeft: 'scan',
};
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = KEYMAP[e.code]; if (k) { keys[k] = true; e.preventDefault(); }
  if (e.code === 'Escape') togglePause();
  if (state.status !== 'playing' && (e.code === 'Space' || e.code === 'Enter')) uiAction();
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
// Autoplay policy grants audio on a gesture in *this* document, which we may not
// have when the level auto-starts from level 5. Catch the player's first input.
for (const ev of ['keydown', 'pointerdown']) {
  addEventListener(ev, () => audio.unlock(), { once: true });
}

// ---------- host bridge ----------
// When this level runs inside the 2D game (index.html) it is one stage of a
// longer run: medallions carry in, and the win/lose result goes back to the
// host so the original victory / game-over / bonus-unlock flow stays in charge.
const params = new URLSearchParams(location.search);
const embedded = params.get('embed') === '1' && window.parent !== window;
// Preload mode: the host loads this level in the background during level 5 so
// the switch is instant. Everything is built, then we sit still until the host
// sends "begin" with the medallions and lives the player arrives with.
const preload = params.get('preload') === '1';
let carriedScore = parseInt(params.get('score') || '0', 10) || 0;
let startLives = Math.max(1, parseInt(params.get('lives') || '3', 10) || 3);
function tellHost(type, extra = {}) {
  if (!embedded) return;
  window.parent.postMessage({ source: 'golive3d', type, ...extra }, '*');
}
addEventListener('message', e => {
  const d = e.data;
  if (!d || d.source !== 'golive3d-host') return;
  // Keys the host forwarded because focus was sitting on the parent page. Handled
  // exactly as a local key event, so the controls work without clicking the stage.
  if (d.type === 'key') {
    const k = KEYMAP[d.code]; if (k) keys[k] = !!d.down;
    if (d.down) {
      audio.unlock();
      if (d.code === 'Escape') togglePause();
      if (state && state.status !== 'playing' && (d.code === 'Space' || d.code === 'Enter')) uiAction();
    }
    return;
  }
  if (d.type !== 'begin') return;
  carriedScore = parseInt(d.score, 10) || 0;
  startLives = Math.max(1, parseInt(d.lives, 10) || 3);
  newGame();
  audio.unlock(); audio.setMusic('explore');
  if (!running) { running = true; requestAnimationFrame(loop); }
});
// The HUD shows the run total, so add back what earlier levels already earned.
const showScore = n => hud.setScore(carriedScore + n);

// ---------- subsystems ----------
const hud = createHUD();
const audio = createAudio();
const vfx = createVFX(scene);

let engine, state, playerVis, enemyVis, world;
let running = false;   // the rAF loop is held back while preloading

const events = {
  onCoin: c => { showScore(state.score); vfx.spawnCoinBurst(px2(c.x + 20, c.y + 20)); audio.play('coin'); },
  onStomp: e => { showScore(state.score); vfx.spawnStomp(px2(e.x + e.w / 2, e.floorY - e.h / 2)); audio.play('stomp'); },
  onScan: t => { vfx.spawnScanBeam(playerVis.group.position, state.player.face, !!t); audio.play(t ? 'scanhit' : 'scan'); },
  onScanKill: e => { showScore(state.score); vfx.spawnScanZap(px2(e.x + e.w / 2, e.floorY - e.h / 2)); },
  onHurt: () => { hud.setLives(state.lives); vfx.flashHurt(); audio.play('hurt'); audio.setMusic('danger', 2.5); },
  onGameOver: () => {
    audio.play('gameover'); audio.setMusic('fail');
    if (embedded) setTimeout(() => tellHost('gameover', { score: state.score, deaths: state.deaths }), 1400);
    else hud.showGameOver(state.score);
  },
  onWin: () => {
    audio.play('win'); audio.setMusic('victory');
    vfx.spawnVictory(px2(state.goal.x + 45, state.goal.y + 80));
    // let the victory animation and confetti land before handing back
    // The host folds these into its run totals for the full-run achievements.
    // Only stomps count as stomps: a bot dissolved by the scanner is not one.
    if (embedded) setTimeout(() => tellHost('complete', {
      score: state.score, lives: state.lives, walkedOnGround: state.walkedOnGround,
      deaths: state.deaths,
      coins: state.coins.filter(c => c.got).length, coinsTotal: state.coins.length,
      stomps: state.enemies.filter(e => e.deathBy === 'stomp').length,
      enemiesTotal: state.enemies.length,
    }), 2600);
    else hud.showVictory(state.score);
  },
  onOneUp: () => { hud.setLives(state.lives); hud.toast('1-UP!  +1 LIFE'); audio.play('oneup'); },
  onRespawn: () => { audio.play('respawn'); },
  onJump: () => { audio.play('jump'); },
  onLand: p => { vfx.spawnDust(px2(p.x + p.w / 2, p.y + p.h)); audio.play('land'); },
};

function newGame() {
  engine = createEngine(events);
  state = engine.state;
  state.lives = startLives;
  enemyVis?.reset(state.enemies);
  showScore(0); hud.setLives(startLives); hud.hideScreens();
  audio.setMusic('explore');
}

// ---------- UI actions ----------
let paused = false;
function togglePause() { if (state.status !== 'playing') return; paused = !paused; hud.setPaused(paused); }
function uiAction() { if (state.status === 'won' || state.status === 'gameover') { newGame(); } }
hud.onRestart(() => { paused = false; hud.setPaused(false); newGame(); });
hud.onResume(() => { paused = false; hud.setPaused(false); });

// ---------- build scene ----------
init();
async function init() {
  engine = createEngine(events); state = engine.state;
  state.lives = startLives;
  showScore(0); hud.setLives(startLives);
  world = await buildWorld(scene, engine.level);
  playerVis = await createPlayerVisual(scene);
  enemyVis = await createEnemyVisuals(scene, state.enemies);
  resize();
  hud.ready(() => { audio.unlock(); audio.setMusic('explore'); });
  if (embedded) {
    // Arriving straight from level 5 — no splash, just keep playing.
    document.getElementById('startScreen').classList.add('hidden');
  }
  if (preload) {
    // Draw one frame to warm shaders and textures, then wait for "begin".
    // Staying out of the rAF loop keeps the GPU free for level 5.
    renderer.render(scene, camera);
    tellHost('ready');
    return;
  }
  if (embedded) { audio.unlock(); audio.setMusic('explore'); tellHost('ready'); }
  running = true;
  requestAnimationFrame(loop);
}

// ---------- camera ----------
const camState = { x: U(80), y: Y(GROUND) + 2.2, look: 0 };
function updateCamera(dt) {
  const p = state.player;
  const tx = U(p.x + p.w / 2) + p.face * 1.6;             // look-ahead
  const ty = Y(p.y + p.h / 2) + 1.1;
  const k = 1 - Math.pow(0.0018, dt);                     // smooth damp
  camState.x += (tx - camState.x) * k;
  camState.y += (ty - camState.y) * k * 0.8;
  // goal approach: gentle push-in (driven by player x, which can actually reach the gate)
  const goalNear = Math.max(0, 1 - Math.abs(U(5080) - U(p.x)) / 8);
  const dist = 15.5 - goalNear * 3.5;
  // clamp to world using the actual visible half-width at current dist,
  // so the right frame edge lands flush on the world edge and the gate fits on screen
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const halfVis = Math.tan(THREE.MathUtils.degToRad(19)) * dist * aspect;
  // near the goal, allow a slight overshoot past the world edge so the full
  // GO LIVE marquee (which extends to ~U(5260)) composes on screen
  camState.x = Math.max(halfVis, Math.min(U(5200) - halfVis + goalNear * 1.2, camState.x));
  camState.y = Math.max(1.6, camState.y);
  camera.position.set(camState.x, camState.y + 1.35, dist);
  camera.lookAt(camState.x, camState.y, 0);
}

// ---------- fixed-timestep loop ----------
let last = 0, acc = 0; const STEP = 1000 / 60;
const frameTimes = [];
function loop(ts) {
  requestAnimationFrame(loop);
  if (!last) last = ts;
  let dt = ts - last; last = ts;
  frameTimes.push(dt); if (frameTimes.length > 240) frameTimes.shift();
  if (dt > 250) dt = 250;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard < 5) {
    if (!paused && state.status === 'playing') {
      engine.step(keys);
      audio.tickMusic(state);
    }
    acc -= STEP; guard++;
  }
  const dts = Math.min(dt, 50) / 1000;
  playerVis.update(state, dts);
  enemyVis.update(state, dts);
  world.update(dts, ts / 1000, state);
  vfx.update(dts);
  updateCamera(dts);
  renderer.render(scene, camera);
}
export { renderer, scene, camera, frameTimes };
window.__game = { get state() { return state; }, frameTimes, renderer };
// deterministic test hook: run n engine ticks with given keys (throttle-independent)
window.__test = {
  tick(n, k = {}) {
    for (let i = 0; i < n && state.status === 'playing'; i++) {
      engine.step({ left: !!k.left, right: !!k.right, jump: !!k.jump, scan: !!k.scan });
    }
    return { x: state.player.x, y: state.player.y, score: state.score, lives: state.lives, status: state.status, tick: state.tick };
  },
  newGame, start() { document.getElementById('startBtn').click(); },
  get keys() { return keys; },   // live input, so host key forwarding can be checked
  render() { playerVis.update(state, 1 / 60); enemyVis.update(state, 1 / 60); world.update(1 / 60, state.tick / 60, state); updateCamera(1 / 60); renderer.render(scene, camera); },
};
