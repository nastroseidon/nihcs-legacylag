// Headless Level 6 game logic — identical rules to the 2D original, run at a fixed
// 60Hz tick in 2D pixel space. Rendering layers read this state and convert to 3D.
import { LEVEL6 as L, PHYS, GROUND } from './leveldata.js';

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function createEngine(events) {
  // events: {onCoin, onStomp, onScanKill, onHurt, onDeath, onWin, onGameOver, onOneUp, onRespawn, onPhase}
  const solids = L.ground.map(g => ({ x: g[0], y: GROUND, w: g[1], h: 600 }))
    .concat(L.walls.map(w => ({ x: w[0], y: w[1], w: w[2], h: w[3] })));
  const state = {
    tick: 0, score: 0, lives: 3, status: 'playing', // playing|dead|won|gameover
    allCoinsAwarded: false, phaseSolid: false, phaseAlpha: 0,
    walkedOnGround: false,        // false for a whole run == the hop achievement
    player: { x: L.start[0], y: L.start[1], w: PHYS.PLAYER_W, h: PHYS.PLAYER_H,
      vx: 0, vy: 0, onGround: false, face: 1, prevBottom: 0, invuln: 60, lock: 0,
      scanCd: 0, anim: 'idle' },
    coins: L.coins.map(c => ({ x: c[0], y: c[1], got: false })),
    enemies: L.enemies.map(e => ({ x: e[0], minX: e[1], maxX: e[2], dir: 1, alive: true,
      dying: 0, deathBy: null, w: PHYS.ENEMY_W, h: PHYS.ENEMY_H, floorY: GROUND, talked: false })),
    spikes: L.spikes.map(s => ({ x: s[0], y: GROUND, w: 98 })),
    goal: { x: L.goalRect[0], y: L.goalRect[1], w: L.goalRect[2], h: L.goalRect[3] },
  };

  function respawn() {
    const p = state.player;
    p.x = L.start[0]; p.y = L.start[1]; p.vx = 0; p.vy = 0;
    p.onGround = false; p.face = 1; p.invuln = 70; p.prevBottom = p.y + p.h; p.lock = 12;
    events.onRespawn?.();
  }
  function hitPlayer() {
    const p = state.player;
    if (p.invuln > 0) return;
    state.lives--;
    events.onHurt?.();
    if (state.lives <= 0) { state.status = 'gameover'; events.onGameOver?.(); }
    else respawn();
  }

  function step(keys) {
    const s = state, p = s.player;
    if (s.status !== 'playing') return;
    s.tick++;
    if (p.invuln > 0) p.invuln--;
    if (p.scanCd > 0) p.scanCd--;
    const locked = p.lock > 0; if (locked) p.lock--;
    const kL = locked ? false : keys.left, kR = locked ? false : keys.right,
      kJ = locked ? false : keys.jump, kS = locked ? false : keys.scan;

    // horizontal
    p.vx = (kR ? PHYS.MOVE : 0) - (kL ? PHYS.MOVE : 0);
    if (kR) p.face = 1; else if (kL) p.face = -1;
    p.x += p.vx;
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > L.worldW) p.x = L.worldW - p.w;
    for (const r of solids) if (overlap(p, r)) {
      if (p.vx > 0) p.x = r.x - p.w; else if (p.vx < 0) p.x = r.x + r.w;
    }

    // vertical
    p.prevBottom = p.y + p.h;
    if (kJ && p.onGround) { p.vy = PHYS.JUMP; p.onGround = false; events.onJump?.(); }
    p.vy += PHYS.GRAV; if (p.vy > PHYS.MAXFALL) p.vy = PHYS.MAXFALL;
    p.y += p.vy;
    const wasAir = !p.onGround;
    p.onGround = false;
    for (const r of solids) if (overlap(p, r)) {
      if (p.vy > 0) { p.y = r.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = r.y + r.h; p.vy = 0; }
    }
    for (const pl of L.plats) {
      if (p.vy >= 0 && p.prevBottom <= pl[1] + 4 && p.y + p.h >= pl[1] &&
          p.x + p.w > pl[0] && p.x < pl[0] + pl[2]) {
        p.y = pl[1] - p.h; p.vy = 0; p.onGround = true;
      }
    }
    // phasing girders: 9s (540-tick) cycle — solid 3s, fade-out 2s, gone 2s, fade-in 2s
    const cp = s.tick % 540;
    s.phaseSolid = cp < 180;
    s.phaseAlpha = cp < 180 ? 1 : cp < 300 ? 1 - (cp - 180) / 120 : cp < 420 ? 0 : (cp - 420) / 120;
    if (s.phaseSolid) for (const pl of L.phase) {
      if (p.vy >= 0 && p.prevBottom <= pl[1] + 4 && p.y + p.h >= pl[1] &&
          p.x + p.w > pl[0] && p.x < pl[0] + pl[2]) {
        p.y = pl[1] - p.h; p.vy = 0; p.onGround = true;
      }
    }
    if (wasAir && p.onGround) events.onLand?.(p);

    // "walked" = moved along the ground without holding jump; a hop landing
    // doesn't count. Matches the 2D game's hop-achievement rule.
    if (p.onGround && Math.abs(p.vx) > 0.1 && !kJ) s.walkedOnGround = true;

    // pit death (original: y > H+120 in screen space == fell below world)
    if (p.y > GROUND + 200) { hitPlayer(); return; }

    // coins
    for (const c of s.coins) {
      if (!c.got && overlap(p, { x: c.x - 4, y: c.y - 4, w: 44, h: 44 })) {
        c.got = true; s.score++; events.onCoin?.(c);
        if (!s.allCoinsAwarded && s.coins.every(cc => cc.got)) {
          s.allCoinsAwarded = true; s.lives++; events.onOneUp?.();
        }
      }
    }
    // spikes
    for (const sp of s.spikes)
      if (overlap(p, { x: sp.x + 3, y: sp.y - 40, w: sp.w - 6, h: 40 })) hitPlayer();

    // enemies
    for (const e of s.enemies) {
      if (!e.alive) { if (e.dying > 0) e.dying--; continue; }
      e.x += e.dir * PHYS.ENEMY_SPEED;
      if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.dir = -1; }
      const eb = { x: e.x, y: e.floorY - e.h, w: e.w, h: e.h };
      if (overlap(p, eb)) {
        if (p.vy > 0 && p.prevBottom <= eb.y + 16) {
          e.alive = false; e.dying = 40; e.deathBy = 'stomp';
          p.vy = PHYS.STOMP_SPRING; s.score++; events.onStomp?.(e);
        } else hitPlayer();
      }
    }

    // barcode scanner: zap nearest living enemy in front, within range & rough height
    if (kS && p.scanCd === 0) {
      p.scanCd = PHYS.SCAN_COOLDOWN;
      const px = p.x + p.w / 2;
      let best = null, bd = 1e9;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        const ex = e.x + e.w / 2, dx = (ex - px) * p.face;
        if (dx < 0 || dx > PHYS.SCAN_RANGE) continue;
        if (Math.abs((e.floorY - e.h / 2) - (p.y + p.h / 2)) > 120) continue;
        if (dx < bd) { bd = dx; best = e; }
      }
      events.onScan?.(best);
      if (best) {
        best.alive = false; best.dying = 60; best.deathBy = 'scan';
        s.score++; events.onScanKill?.(best);
      }
    }

    // goal
    if (overlap(p, s.goal)) { s.status = 'won'; events.onWin?.(); }

    // animation state
    p.anim = !p.onGround ? (p.vy < 0 ? 'jump' : 'fall')
      : Math.abs(p.vx) > 0.1 ? 'run' : 'idle';
    if (p.scanCd > PHYS.SCAN_COOLDOWN - 18) p.anim = 'scan';
  }

  return { state, step, respawn, level: L };
}
