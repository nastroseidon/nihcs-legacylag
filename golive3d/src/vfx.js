// CONTRACT (VFX specialist owns this module):
//   export function createVFX(scene) -> {
//     update(dt), spawnDust(v3), spawnCoinBurst(v3), spawnStomp(v3),
//     spawnScanBeam(originV3, face, hit), spawnScanZap(v3), spawnVictory(v3),
//     flashHurt() }
// Premium pooled real-time VFX: landing dust, coin sparkle, stomp debris,
// scanner laser fan + digital dissolve burst, victory confetti fountain,
// ambient sunbeam motes / leaves / confetti drift, hurt vignette flash.
// All procedural (canvas sprites only). Pooled: 2 Points pools + 1 InstancedMesh
// + a handful of reused meshes. Live particles well under 3000.
import * as THREE from '../lib/three.module.js';

// ---------- canvas sprite textures ----------
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sparkTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 1, 32, 32, 28);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  // 4-point star spikes
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
  g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(32, 3); g.lineTo(32, 61); g.moveTo(3, 32); g.lineTo(61, 32); g.stroke();
  g.lineWidth = 1.2; g.globalAlpha = 0.5;
  g.beginPath(); g.moveTo(12, 12); g.lineTo(52, 52); g.moveTo(52, 12); g.lineTo(12, 52); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shaftTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const fy = y / 255;
    const vy = Math.pow(1 - fy, 0.85) * Math.min(1, fy * 12);   // bright top, taper to ground
    for (let x = 0; x < 64; x++) {
      const fx = x / 63;
      const a = Math.pow(Math.sin(fx * Math.PI), 2.2) * vy * 255;
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i+1] = img.data[i+2] = 255; img.data[i+3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- billboard point pool (CPU sim, GPU rotate/fade) ----------
const PT_VERT = `
attribute float aSize; attribute float aAlpha; attribute float aAngle;
attribute vec3 aColor;
varying float vAlpha; varying float vAngle; varying vec3 vColor;
void main() {
  vAlpha = aAlpha; vAngle = aAngle; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (720.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PT_FRAG = `
uniform sampler2D uTex;
varying float vAlpha; varying float vAngle; varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vAngle), s = sin(vAngle);
  uv = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 t = texture2D(uTex, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
}`;

function makePointPool(scene, max, tex, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const siz = new Float32Array(max), alp = new Float32Array(max), ang = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(ang, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex } }, vertexShader: PT_VERT, fragmentShader: PT_FRAG,
    transparent: true, depthWrite: false, blending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 20;
  scene.add(pts);
  // sim arrays (struct-of-arrays, swap-remove)
  const F = n => new Float32Array(n);
  const P = {
    max, n: 0,
    x: F(max), y: F(max), z: F(max), vx: F(max), vy: F(max), vz: F(max),
    life: F(max), max0: F(max), s0: F(max), s1: F(max), a0: F(max),
    r: F(max), g: F(max), b: F(max), an: F(max), av: F(max), gr: F(max), dr: F(max),
    tw: F(max), // twinkle rate (0 = none)
    spawn(o) {
      if (P.n >= max) return -1;
      const i = P.n++;
      P.x[i] = o.x; P.y[i] = o.y; P.z[i] = o.z ?? 0;
      P.vx[i] = o.vx || 0; P.vy[i] = o.vy || 0; P.vz[i] = o.vz || 0;
      P.life[i] = P.max0[i] = o.life;
      P.s0[i] = o.s0; P.s1[i] = o.s1 ?? o.s0; P.a0[i] = o.a ?? 1;
      P.r[i] = o.c.r; P.g[i] = o.c.g; P.b[i] = o.c.b;
      P.an[i] = o.an ?? Math.random() * 6.283; P.av[i] = o.av || 0;
      P.gr[i] = o.gr ?? 0; P.dr[i] = o.dr ?? 0; P.tw[i] = o.tw || 0;
      return i;
    },
    kill(i) {
      const j = --P.n;
      for (const k of ['x','y','z','vx','vy','vz','life','max0','s0','s1','a0','r','g','b','an','av','gr','dr','tw']) P[k][i] = P[k][j];
    },
    update(dt, time) {
      for (let i = 0; i < P.n; i++) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) { P.kill(i); i--; continue; }
        const d = 1 - P.dr[i] * dt;
        P.vx[i] *= d; P.vz[i] *= d; P.vy[i] = P.vy[i] * d + P.gr[i] * dt;
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
        P.an[i] += P.av[i] * dt;
        const t = 1 - P.life[i] / P.max0[i];               // 0..1 age
        let a = P.a0[i] * Math.min(1, t * 10) * (1 - t) * (2 - (1 - t)); // ease-out fade
        if (P.tw[i] > 0) a *= 0.6 + 0.4 * Math.sin(time * P.tw[i] + i * 1.7);
        pos[i*3] = P.x[i]; pos[i*3+1] = P.y[i]; pos[i*3+2] = P.z[i];
        col[i*3] = P.r[i]; col[i*3+1] = P.g[i]; col[i*3+2] = P.b[i];
        siz[i] = P.s0[i] + (P.s1[i] - P.s0[i]) * t;
        alp[i] = a; ang[i] = P.an[i];
      }
      geo.setDrawRange(0, P.n);
      for (const a2 of ['position','aColor','aSize','aAlpha','aAngle']) geo.attributes[a2].needsUpdate = true;
    },
  };
  return P;
}

export function createVFX(scene) {
  const soft = makePointPool(scene, 500, softTex(), THREE.NormalBlending);
  const glow = makePointPool(scene, 1400, sparkTex(), THREE.AdditiveBlending);
  const C = h => new THREE.Color(h);

  // ---------- instanced cube/flake pool (debris, confetti, glitch, leaves) ----------
  const CUBE_MAX = 420;
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const cubeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, CUBE_MAX);
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CUBE_MAX * 3), 3);
  cubes.frustumCulled = false; cubes.renderOrder = 15; cubes.count = 0;
  scene.add(cubes);
  const dummy = new THREE.Object3D();
  const CB = [];  // records {x,y,z,vx,vy,vz,rx,ry,rz,arx,ary,arz,sx,sy,sz,life,max,gr,mode,ph,r,g,b}
  function cubeSpawn(o) {
    if (CB.length >= CUBE_MAX) return;
    CB.push({ z: 0, vx: 0, vy: 0, vz: 0, rx: Math.random()*6, ry: Math.random()*6, rz: Math.random()*6,
      arx: 0, ary: 0, arz: 0, gr: -6, mode: 0, ph: Math.random()*6.28, max: o.life, ...o });
  }
  function cubeUpdate(dt, time) {
    for (let i = CB.length - 1; i >= 0; i--) {
      const p = CB[i]; p.life -= dt;
      if (p.life <= 0) { CB.splice(i, 1); continue; }
      if (p.mode === 1) { // flutter (confetti / paper / leaves): slow fall + sway + tumble
        p.vy = Math.max(p.vy + p.gr * dt, -1.35);
        p.x += (p.vx + Math.sin(time * 2.4 + p.ph) * 0.55) * dt;
        p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += (1.8 + Math.sin(p.ph) * 1.2) * dt; p.ry += 3.2 * dt; p.rz += Math.cos(time + p.ph) * 2 * dt;
        p.vx *= 1 - 0.8 * dt;
      } else {         // ballistic debris / glitch cubes
        p.vy += p.gr * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.arx * dt; p.ry += p.ary * dt; p.rz += p.arz * dt;
      }
    }
    cubes.count = CB.length;
    for (let i = 0; i < CB.length; i++) {
      const p = CB[i], t = 1 - p.life / p.max, sc = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.sx * sc, p.sy * sc, p.sz * sc);
      dummy.updateMatrix();
      cubes.setMatrixAt(i, dummy.matrix);
      cubes.setColorAt(i, _c.setRGB(p.r, p.g, p.b));
    }
    cubes.instanceMatrix.needsUpdate = true;
    if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
  }
  const _c = new THREE.Color();

  // ---------- expanding / collapsing rings ----------
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; m.renderOrder = 18; scene.add(m);
    rings.push({ m, t: 1, dur: 1, from: 1, to: 1, flat: false, a: 1 });
  }
  function ringFx(pos, color, from, to, dur, flat, a = 0.9) {
    const r = rings.find(r => r.t >= r.dur) || rings[0];
    r.t = 0; r.dur = dur; r.from = from; r.to = to; r.flat = flat; r.a = a;
    r.m.visible = true; r.m.material.color.set(color);
    r.m.position.copy(pos); r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    if (flat) r.m.position.y += 0.04;
  }
  function ringsUpdate(dt) {
    for (const r of rings) {
      if (r.t >= r.dur) { r.m.visible = false; continue; }
      r.t += dt;
      const t = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - t, 3);
      const s = r.from + (r.to - r.from) * e;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = r.a * (1 - t);
      if (r.t >= r.dur) r.m.visible = false;
    }
  }

  // ---------- scanner laser fan ----------
  const BEAM_VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const BEAM_FRAG = `
  uniform float uT; uniform float uHit;
  varying vec2 vUv;
  void main(){
    float env = uT < 0.12 ? uT/0.12 : pow(1.0-(uT-0.12)/0.88, 1.6);  // snap on, glow off
    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;                        // fan edge fade
    float core = pow(edge, 6.0) * 1.6;                                // hot center line
    float scan = 0.6 + 0.4 * step(0.5, fract(vUv.y * 10.0 - uT * 22.0)); // scanlines
    float sweepPos = uT < 0.35 ? uT / 0.35 : 1.0;
    float sweep = exp(-pow((vUv.x - sweepPos) * 9.0, 2.0)) * 1.4;     // bright sweep front
    float fade = 1.0 - vUv.x * 0.55;
    float body = 0.9 * scan * edge;                                   // translucent fan body
    float a = env * fade * (body + edge * (core + sweep)) * (0.75 + uHit * 0.4);
    vec3 col = mix(vec3(1.0, 0.12, 0.1), vec3(1.0, 0.55, 0.4), core * 0.5 + sweep * 0.3);
    gl_FragColor = vec4(col * a, a);
  }`;
  // fan geometry: apex at origin, widens along +x, uv.x = length
  const fanGeo = new THREE.BufferGeometry();
  {
    const seg = 14, vv = [], uu = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, h = 0.06 + t * 0.94;
      vv.push(t, h / 2, 0, t, -h / 2, 0); uu.push(t, 1, t, 0);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(vv, 3));
    fanGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2));
    fanGeo.setIndex(idx);
  }
  const beams = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(fanGeo, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 1 }, uHit: { value: 0 } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.visible = false; m.renderOrder = 22; scene.add(m);
    beams.push({ m, t: 1, dur: 0.42 });
  }
  function beamsUpdate(dt) {
    for (const b of beams) {
      if (b.t >= b.dur) { b.m.visible = false; continue; }
      b.t += dt;
      b.m.material.uniforms.uT.value = Math.min(1, b.t / b.dur);
      if (b.t >= b.dur) b.m.visible = false;
    }
  }

  // ---------- god-ray shaft (victory) ----------
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9),
    new THREE.MeshBasicMaterial({ map: shaftTex(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd58a }));
  shaft.visible = false; shaft.renderOrder = 12; scene.add(shaft);
  let shaftT = 1, shaftDur = 1.8;

  // ---------- emitters (timed streams: victory fountain) ----------
  const emitters = []; // {t, dur, rate, acc, fn(pos), pos}
  function emit(pos, dur, rate, fn) { emitters.push({ pos: pos.clone(), t: 0, dur, rate, acc: 0, fn }); }
  function emittersUpdate(dt) {
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i]; e.t += dt;
      if (e.t > e.dur) { emitters.splice(i, 1); continue; }
      e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; e.fn(e.pos, e.t / e.dur); }
    }
  }

  // ---------- palettes ----------
  const GOLD = [C(0xffd54a), C(0xffe89a), C(0xffb02e), C(0xfff3c0)];
  const CONF = [C(0xff5f6d), C(0xffc14a), C(0x4ad9a6), C(0x53a7ff), C(0xd67bff), C(0xfff0b0)];
  const TEAL = [C(0x35ffd0), C(0x51ff88), C(0xa8fff0), C(0x18d99f)];
  const pick = a => a[(Math.random() * a.length) | 0];
  const R = (lo, hi) => lo + Math.random() * (hi - lo);

  // ---------- ambient atmosphere ----------
  let time = 0, moteAcc = 0, leafAcc = 0, confAcc = 0;
  const DUSTC = C(0xffe0b0);
  function ambient(dt) {
    const st = (typeof window !== 'undefined' && window.__game) ? window.__game.state : null;
    const px = st ? st.player.x / 50 : 10;
    // drifting sunbeam motes near camera (~55 alive)
    moteAcc += dt * 9;
    while (moteAcc >= 1) {
      moteAcc -= 1;
      glow.spawn({ x: px + R(-9, 9), y: R(0.6, 7.5), z: R(-2.5, 2.5),
        vx: R(-0.12, 0.2), vy: R(-0.05, 0.09), vz: R(-0.05, 0.05),
        life: R(4.5, 7), s0: R(0.035, 0.09), s1: R(0.035, 0.09), a: R(0.05, 0.16),
        c: DUSTC, tw: R(1.5, 3.5) });
    }
    // falling leaves in zone 1-2 (x < ~2200px)
    if (px < 44) {
      leafAcc += dt;
      if (leafAcc > 0.8) {
        leafAcc = 0;
        const g = R(0.3, 0.8);
        cubeSpawn({ x: px + R(-8, 8), y: R(8, 10.5), z: R(-2, 2.5), vy: R(-0.3, -0.1),
          sx: 0.11, sy: 0.015, sz: 0.075, life: R(7, 9), gr: -0.35, mode: 1,
          r: R(0.25, 0.7), g: 0.55 + g * 0.3, b: R(0.08, 0.2) });
      }
    }
    // faint confetti drift near festival start (x<20u) and near the gate
    if (px < 20 || px > 96) {
      confAcc += dt;
      if (confAcc > 0.45) {
        confAcc = 0;
        const c = pick(CONF);
        cubeSpawn({ x: px + R(-7, 7), y: R(7.5, 10), z: R(-1.5, 2.5), vy: R(-0.4, -0.15),
          sx: 0.07, sy: 0.012, sz: 0.05, life: R(6.5, 8.5), gr: -0.4, mode: 1, r: c.r, g: c.g, b: c.b });
      }
    }
  }

  const flashEl = document.getElementById('hurtflash');

  return {
    update(dt) {
      time += dt;
      ambient(dt);
      emittersUpdate(dt);
      soft.update(dt, time);
      glow.update(dt, time);
      cubeUpdate(dt, time);
      ringsUpdate(dt);
      beamsUpdate(dt);
      if (shaftT < shaftDur) {
        shaftT += dt;
        const t = Math.min(1, shaftT / shaftDur);
        shaft.material.opacity = Math.sin(t * Math.PI) * 0.38;
        shaft.visible = t < 1;
      }
    },

    // landing puff: soft billowy sprites, expand + fade, slight roll
    spawnDust(p) {
      for (let i = 0; i < 9; i++) {
        const a = R(0, Math.PI * 2), s = R(0.3, 1.1);
        soft.spawn({ x: p.x + R(-0.25, 0.25), y: p.y + R(0, 0.12), z: p.z + R(-0.15, 0.15),
          vx: Math.cos(a) * s, vy: R(0.15, 0.7), vz: R(-0.2, 0.2),
          life: R(0.35, 0.7), s0: R(0.18, 0.3), s1: R(0.55, 0.9), a: R(0.22, 0.4),
          c: C(0xdcc49a), av: R(-2.5, 2.5), gr: -0.4, dr: 2.2 });
      }
    },

    // gold sparkle ring + rising glints + starburst flash
    spawnCoinBurst(p) {
      glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.22, s0: 1.15, s1: 0.4, a: 0.95, c: C(0xfff2c0), av: 2 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        glow.spawn({ x: p.x, y: p.y, z: p.z,
          vx: Math.cos(a) * 2.3, vy: Math.sin(a) * 2.3, vz: R(-0.3, 0.3),
          life: R(0.3, 0.5), s0: R(0.1, 0.16), s1: 0.02, a: 0.9, c: pick(GOLD), av: R(-6, 6), dr: 3.5 });
      }
      for (let i = 0; i < 7; i++)
        glow.spawn({ x: p.x + R(-0.3, 0.3), y: p.y + R(-0.1, 0.2), z: p.z + R(-0.2, 0.2),
          vx: R(-0.3, 0.3), vy: R(1, 2.2), vz: 0, life: R(0.5, 0.85),
          s0: R(0.07, 0.13), s1: 0.02, a: 0.85, c: pick(GOLD), av: R(-4, 4), gr: -1.2, tw: 9 });
    },

    // bot stomp: green debris bolts + sparks + fluttering paper + shock ring
    spawnStomp(p) {
      ringFx(p, 0x9adf70, 0.15, 1.7, 0.45, true, 0.7);
      for (let i = 0; i < 12; i++) { // bolts & chassis chips
        const a = R(0, Math.PI * 2), s = R(1.2, 3.4);
        const brass = Math.random() < 0.35;
        cubeSpawn({ x: p.x, y: p.y + 0.2, z: p.z + R(-0.1, 0.1),
          vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s + 1.2, vz: R(-1, 1),
          sx: R(0.04, 0.09), sy: R(0.04, 0.09), sz: R(0.04, 0.09),
          arx: R(-9, 9), ary: R(-9, 9), arz: R(-9, 9), gr: -9, life: R(0.5, 0.9),
          r: brass ? 0.75 : 0.28, g: brass ? 0.58 : 0.42, b: brass ? 0.22 : 0.2 });
      }
      for (let i = 0; i < 6; i++) { // LEGACY REPORTS paper scraps flutter down
        cubeSpawn({ x: p.x + R(-0.3, 0.3), y: p.y + R(0.3, 0.7), z: p.z + R(-0.2, 0.3),
          vx: R(-0.9, 0.9), vy: R(0.8, 2), vz: R(-0.4, 0.4),
          sx: R(0.09, 0.15), sy: 0.01, sz: R(0.07, 0.11), gr: -2.2, mode: 1, life: R(1.2, 2),
          r: 0.94, g: 0.93, b: 0.84 });
      }
      for (let i = 0; i < 10; i++) { // sparks
        const a = R(0, Math.PI * 2), s = R(2, 4);
        glow.spawn({ x: p.x, y: p.y + 0.15, z: p.z, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s, vz: R(-0.8, 0.8),
          life: R(0.2, 0.45), s0: 0.09, s1: 0.015, a: 0.95, c: Math.random() < 0.5 ? C(0xaefc6e) : C(0xffc86a),
          gr: -7, dr: 1.5 });
      }
      glow.spawn({ x: p.x, y: p.y + 0.3, z: p.z, life: 0.18, s0: 1.3, s1: 0.5, a: 0.7, c: C(0xc8ffa0) });
    },

    // HERO: red laser scan fan sweep from the scanner
    spawnScanBeam(origin, face, hit) {
      const b = beams.find(b => b.t >= b.dur) || beams[0];
      b.t = 0;
      const len = hit ? 3.6 : 4.2;
      b.m.visible = true;
      b.m.position.set(origin.x + face * 0.34, origin.y + 1.02, origin.z + 0.12);
      b.m.scale.set(len * face, 1.5, 1);
      b.m.material.uniforms.uT.value = 0;
      b.m.material.uniforms.uHit.value = hit ? 1 : 0;
      // emitter-node glow at scanner
      glow.spawn({ x: b.m.position.x, y: b.m.position.y, z: b.m.position.z + 0.05,
        life: 0.28, s0: 0.5, s1: 0.15, a: 0.9, c: C(0xff4438) });
      if (hit) { // impact flash + red sparks at beam end
        const ex = b.m.position.x + face * len, ey = b.m.position.y;
        glow.spawn({ x: ex, y: ey, z: 0.1, life: 0.22, s0: 1, s1: 0.3, a: 1, c: C(0xff6a50), av: 3 });
        for (let i = 0; i < 8; i++) {
          const a = R(0, Math.PI * 2), s = R(1, 2.6);
          glow.spawn({ x: ex, y: ey, z: 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: R(-0.5, 0.5),
            life: R(0.2, 0.4), s0: 0.08, s1: 0.015, a: 0.9, c: pick([C(0xff5040), C(0xffa060), C(0xff2820)]), dr: 3 });
        }
      }
    },

    // digital dissolve support burst: glitch cubes + data motes + ring collapse
    spawnScanZap(p) {
      ringFx(p, 0x35ffd0, 1.6, 0.12, 0.5, false, 0.85);
      for (let i = 0; i < 16; i++) { // teal/green glitch cubes
        const a = R(0, Math.PI * 2), s = R(0.6, 2.4), c = pick(TEAL);
        cubeSpawn({ x: p.x + R(-0.3, 0.3), y: p.y + R(0, 0.8), z: p.z + R(-0.2, 0.2),
          vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 + 0.8, vz: R(-0.7, 0.7),
          sx: R(0.05, 0.12), sy: R(0.05, 0.12), sz: R(0.05, 0.12),
          arx: R(-12, 12), ary: R(-12, 12), arz: R(-12, 12), gr: -1.2, life: R(0.5, 1),
          r: c.r, g: c.g, b: c.b });
      }
      for (let i = 0; i < 16; i++) { // rising data motes
        glow.spawn({ x: p.x + R(-0.5, 0.5), y: p.y + R(-0.2, 1), z: p.z + R(-0.3, 0.3),
          vx: R(-0.15, 0.15), vy: R(1, 2.6), vz: 0, life: R(0.6, 1.2),
          s0: R(0.05, 0.11), s1: 0.02, a: 0.9, c: pick(TEAL), tw: 12 });
      }
      glow.spawn({ x: p.x, y: p.y + 0.5, z: p.z, life: 0.25, s0: 1.4, s1: 0.5, a: 0.85, c: C(0xb0fff0) });
    },

    // victory: 4s confetti fountain + gold glints + god-ray flash
    spawnVictory(p) {
      shaft.position.set(p.x, p.y + 2.2, p.z - 0.5);
      shaftT = 0; shaftDur = 2.2; shaft.visible = true;
      glow.spawn({ x: p.x, y: p.y + 1, z: p.z, life: 0.6, s0: 2.6, s1: 1, a: 0.8, c: C(0xffe9b0) });
      emit(p, 4, 26, (pos, t) => {   // confetti fountain
        const c = pick(CONF), up = 1 - t * 0.5;
        cubeSpawn({ x: pos.x + R(-0.4, 0.4), y: pos.y + 0.3, z: pos.z + R(-0.3, 0.5),
          vx: R(-2.2, 2.2), vy: R(3.5, 6.5) * up, vz: R(-1.2, 1.2),
          sx: 0.075, sy: 0.012, sz: 0.055, gr: -4, mode: 1, life: R(2.2, 3.6),
          r: c.r, g: c.g, b: c.b });
      });
      emit(p, 4, 9, pos => {         // gold coin glints
        glow.spawn({ x: pos.x + R(-1.4, 1.4), y: pos.y + R(0.5, 3.4), z: pos.z + R(-0.5, 0.5),
          vx: R(-0.2, 0.2), vy: R(0.4, 1.2), vz: 0, life: R(0.6, 1.1),
          s0: R(0.09, 0.17), s1: 0.02, a: 0.95, c: pick(GOLD), av: R(-5, 5), tw: 10 });
      });
      emit(p, 3.2, 5, pos => {       // soft shimmer sparkles drifting wide
        soft.spawn({ x: pos.x + R(-2.4, 2.4), y: pos.y + R(1.5, 4.5), z: pos.z + R(-1, 1),
          vx: R(-0.2, 0.2), vy: R(-0.5, -0.2), vz: 0, life: R(1.4, 2.2),
          s0: 0.25, s1: 0.5, a: 0.16, c: C(0xffe2a8), av: R(-1, 1) });
      });
    },

    flashHurt() {
      if (flashEl) { flashEl.style.opacity = 0.55; setTimeout(() => flashEl.style.opacity = 0, 180); }
      // brief red scatter around the player (cheap, world-space)
      const st = (typeof window !== 'undefined' && window.__game) ? window.__game.state : null;
      if (st) {
        const x = (st.player.x + st.player.w / 2) / 50, y = (640 - st.player.y - st.player.h / 2) / 50;
        for (let i = 0; i < 10; i++) {
          const a = R(0, Math.PI * 2), s = R(1, 2.5);
          glow.spawn({ x: x + R(-0.2, 0.2), y: y + R(0, 0.6), z: R(0.1, 0.5),
            vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: R(0.2, 0.8),
            life: R(0.25, 0.5), s0: 0.12, s1: 0.02, a: 0.85, c: pick([C(0xff4040), C(0xff8060)]), dr: 2, gr: -3 });
        }
      }
    },
  };
}
