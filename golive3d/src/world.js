// CONTRACT (environment specialist owns this module):
//   export async function buildWorld(scene, level) -> { update(dt, time, state) }
// Must place: ground islands, walls, one-way platforms, phasing girders (read
// state.phaseAlpha for opacity), spikes, medallions (read state.coins[i].got),
// goal gate, lighting, fog, sky, parallax background/foreground layers.
// Coordinates: use U()/Y() from leveldata.js; gameplay plane z=0.
//
// "Golden Hour" environment: original golden-hour jungle-temple Go-Live festival.
// Zone 1 (x 0-20) festival plaza | Zone 2 (20-64) ruined causeway | Zone 3 (64-104) gate approach.
import * as THREE from '../lib/three.module.js';
import { U, Y, GROUND } from './leveldata.js';

// ---------------------------------------------------------------- canvas helpers
function ctex(w, h, fn, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// warm weathered sandstone block texture
function stoneTexture(seed = 1, base = '#b78a58', mortar = '#6e5236') {
  return ctex(512, 512, (g) => {
    const R = rand(seed * 7919 + 13);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    // tonal blotches
    for (let i = 0; i < 140; i++) {
      const r = 20 + R() * 60;
      g.fillStyle = `rgba(${120 + R() * 90 | 0},${85 + R() * 60 | 0},${45 + R() * 40 | 0},${0.05 + R() * 0.09})`;
      g.beginPath(); g.arc(R() * 512, R() * 512, r, 0, 7); g.fill();
    }
    // block courses
    g.strokeStyle = mortar; g.lineWidth = 5;
    const rowH = 64;
    for (let y = 0; y <= 512; y += rowH) {
      g.beginPath(); g.moveTo(0, y + (R() - 0.5) * 4); g.lineTo(512, y + (R() - 0.5) * 4); g.stroke();
      const off = (y / rowH) % 2 ? 64 : 0;
      for (let x = off; x <= 512; x += 128) {
        g.beginPath(); g.moveTo(x + (R() - 0.5) * 6, y); g.lineTo(x + (R() - 0.5) * 6, y + rowH); g.stroke();
      }
    }
    // bevel highlights on top of each course
    g.strokeStyle = 'rgba(255,225,170,0.25)'; g.lineWidth = 2;
    for (let y = 2; y <= 512; y += rowH) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    // cracks
    g.strokeStyle = 'rgba(50,35,20,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      let x = R() * 512, y = R() * 512;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 60; y += R() * 40; g.lineTo(x, y); }
      g.stroke();
    }
    // moss drips from top
    for (let i = 0; i < 26; i++) {
      const x = R() * 512, hgt = 20 + R() * 90;
      const gr = g.createLinearGradient(0, 0, 0, hgt);
      gr.addColorStop(0, 'rgba(90,120,60,0.5)'); gr.addColorStop(1, 'rgba(90,120,60,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 8 + R() * 20, hgt);
    }
  });
}

// pit interior wall: darker brick fading to deep warm maroon at the bottom (never #000)
function pitWallTexture() {
  const src = stoneTexture(17, '#8a6444', '#4a3524').image;
  return ctex(512, 512, (g) => {
    g.drawImage(src, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(42,18,20,0.18)');
    gr.addColorStop(0.55, 'rgba(42,18,20,0.62)');
    gr.addColorStop(1, 'rgba(42,18,20,0.97)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  });
}

// deep warm chasm backdrop gradient (sunset maroon, replaces raw void)
function chasmTexture() {
  return ctex(64, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#6e3a30');
    gr.addColorStop(0.35, '#4a2420');
    gr.addColorStop(1, '#2a1214');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  });
}

// mossy stone top with inlaid gold trim lines
function topTexture(seed = 2) {
  return ctex(512, 256, (g) => {
    const R = rand(seed * 104729 + 7);
    g.fillStyle = '#a8895f'; g.fillRect(0, 0, 512, 256);
    // paving tiles
    g.strokeStyle = 'rgba(80,60,38,0.7)'; g.lineWidth = 4;
    for (let x = 0; x <= 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${140 + R() * 60 | 0},${110 + R() * 40 | 0},${60 + R() * 30 | 0},${0.06 + R() * 0.1})`;
      g.beginPath(); g.arc(R() * 512, R() * 256, 12 + R() * 40, 0, 7); g.fill();
    }
    // moss patches
    for (let i = 0; i < 34; i++) {
      g.fillStyle = `rgba(${70 + R() * 40 | 0},${115 + R() * 40 | 0},${50 + R() * 25 | 0},${0.16 + R() * 0.22})`;
      g.beginPath(); g.ellipse(R() * 512, R() * 256, 10 + R() * 34, 6 + R() * 18, R() * 3, 0, 7); g.fill();
    }
    // inlaid gold trim: double line near front edge (v=1 edge maps to +z front)
    g.strokeStyle = '#e8b542'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, 226); g.lineTo(512, 226); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, 240); g.lineTo(512, 240); g.stroke();
    g.fillStyle = '#e8b542';
    for (let x = 20; x < 512; x += 64) g.fillRect(x, 210, 10, 10);
  });
}

// carved glyph panel for steles / slabs
function glyphTexture(seed = 3, base = '#96744c') {
  return ctex(256, 256, (g) => {
    const R = rand(seed * 31 + 977);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,42,26,${0.05 + R() * 0.08})`;
      g.beginPath(); g.arc(R() * 256, R() * 256, 10 + R() * 30, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(52,36,22,0.85)'; g.lineWidth = 5;
    g.strokeRect(18, 18, 220, 220);
    // grid of original abstract glyphs
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const cx = 52 + gx * 76, cy = 52 + gy * 76, k = (R() * 5) | 0;
      g.strokeStyle = 'rgba(52,36,22,0.8)'; g.lineWidth = 6; g.beginPath();
      if (k === 0) { g.arc(cx, cy, 18, 0.6, 5.2); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 14); }
      else if (k === 1) { g.rect(cx - 16, cy - 16, 32, 32); g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy); }
      else if (k === 2) { g.moveTo(cx - 16, cy + 14); g.lineTo(cx, cy - 16); g.lineTo(cx + 16, cy + 14); g.closePath(); }
      else if (k === 3) { g.moveTo(cx - 16, cy); g.quadraticCurveTo(cx, cy - 26, cx + 16, cy); g.quadraticCurveTo(cx, cy + 26, cx - 16, cy); }
      else { g.arc(cx, cy, 14, 0, 7); g.moveTo(cx - 20, cy + 18); g.lineTo(cx + 20, cy + 18); }
      g.stroke();
      g.strokeStyle = 'rgba(255,220,150,0.25)'; g.lineWidth = 2; g.stroke();
    }
  });
}

// steampunk GO LIVE sign panel
function signTexture() {
  return ctex(1024, 512, (g) => {
    // brass panel
    const brass = g.createLinearGradient(0, 0, 0, 512);
    brass.addColorStop(0, '#caa24f'); brass.addColorStop(0.5, '#9a742f'); brass.addColorStop(1, '#7a5a22');
    g.fillStyle = brass; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#5d431a'; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 498);
    // rivets
    for (let x = 34; x < 1024; x += 62) for (const y of [34, 478]) {
      g.fillStyle = '#e9c877'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
      g.fillStyle = 'rgba(60,40,10,0.6)'; g.beginPath(); g.arc(x + 3, y + 3, 7, 0, 7); g.fill();
    }
    for (const x of [34, 990]) for (let y = 96; y < 460; y += 62) {
      g.fillStyle = '#e9c877'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill();
    }
    // dark inner marquee
    g.fillStyle = '#241812'; g.fillRect(72, 84, 880, 300);
    g.strokeStyle = '#caa24f'; g.lineWidth = 6; g.strokeRect(72, 84, 880, 300);
    // glowing red GO LIVE
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 190px Georgia, serif';
    g.shadowColor = '#ff4422'; g.shadowBlur = 55;
    g.fillStyle = '#ff5533'; g.fillText('GO LIVE', 512, 232);
    g.shadowBlur = 25; g.fillStyle = '#ffd0a0'; g.font = '900 184px Georgia, serif';
    g.fillText('GO LIVE', 512, 228);
    g.shadowBlur = 0;
    // cyan indicator lights row
    for (let i = 0; i < 12; i++) {
      const x = 130 + i * 70;
      g.fillStyle = '#0b2a2e'; g.beginPath(); g.arc(x, 428, 15, 0, 7); g.fill();
      g.shadowColor = '#57f7ff'; g.shadowBlur = 18;
      g.fillStyle = i % 3 === 2 ? '#123c40' : '#7ffbff';
      g.beginPath(); g.arc(x, 428, 9, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    // little gauges in corners
    for (const [gx, gy] of [[120, 52], [904, 52]]) {
      g.fillStyle = '#3a2c16'; g.beginPath(); g.arc(gx, gy, 22, 0, 7); g.fill();
      g.strokeStyle = '#e9c877'; g.lineWidth = 4; g.beginPath(); g.arc(gx, gy, 22, 0, 7); g.stroke();
      g.strokeStyle = '#ff7744'; g.lineWidth = 3; g.beginPath();
      g.moveTo(gx, gy); g.lineTo(gx + 13, gy - 10); g.stroke();
    }
  });
}

// sunset sky with sun disc + clouds
function skyTexture() {
  return ctex(1024, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#3d2a52');
    grad.addColorStop(0.34, '#8a4a5e');
    grad.addColorStop(0.58, '#d97a4e');
    grad.addColorStop(0.78, '#f7b267');
    grad.addColorStop(1, '#ffd98f');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    // sun glow
    const sun = g.createRadialGradient(390, 360, 6, 390, 360, 260);
    sun.addColorStop(0, 'rgba(255,246,214,1)');
    sun.addColorStop(0.08, 'rgba(255,236,180,0.95)');
    sun.addColorStop(0.3, 'rgba(255,190,110,0.55)');
    sun.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = sun; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#fff7dd'; g.beginPath(); g.arc(390, 360, 42, 0, 7); g.fill();
    // streaky clouds
    const R = rand(414);
    for (let i = 0; i < 26; i++) {
      const y = 30 + R() * 330, w = 90 + R() * 260, h = 6 + R() * 14, x = R() * 1024;
      const warm = y > 220;
      g.fillStyle = warm ? `rgba(255,214,150,${0.12 + R() * 0.25})` : `rgba(180,120,150,${0.1 + R() * 0.2})`;
      g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill();
      g.fillStyle = warm ? 'rgba(255,240,200,0.18)' : 'rgba(220,170,190,0.14)';
      g.beginPath(); g.ellipse(x - w * 0.2, y - h * 0.5, w * 0.6, h * 0.6, 0, 0, 7); g.fill();
    }
  });
}

// parallax silhouette layer painters -----------------------------------------
function layerTexture(kind) {
  return ctex(1024, 256, (g) => {
    const R = rand(kind === 'temple' ? 55 : kind === 'jungle' ? 99 : 123);
    g.clearRect(0, 0, 1024, 256);
    if (kind === 'far') { // mountains + volcano
      g.fillStyle = '#9c5f63';
      g.beginPath(); g.moveTo(0, 256);
      let x = 0;
      while (x < 1024) {
        const w = 130 + R() * 160, h = 90 + R() * 110;
        g.lineTo(x + w * 0.5, 256 - h); g.lineTo(x + w, 256 - 20 - R() * 30); x += w;
      }
      g.lineTo(1024, 256); g.closePath(); g.fill();
      // volcano with flat top + smoke
      g.beginPath(); g.moveTo(600, 256); g.lineTo(700, 40); g.lineTo(740, 40); g.lineTo(840, 256); g.closePath(); g.fill();
      g.fillStyle = 'rgba(150,100,120,0.55)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(716 + i * 14, 34 - i * 12, 16 + i * 7, 9 + i * 4, 0, 0, 7); g.fill(); }
      // snow/sunlit caps
      g.fillStyle = 'rgba(255,205,150,0.5)';
      g.beginPath(); g.moveTo(695, 52); g.lineTo(700, 40); g.lineTo(740, 40); g.lineTo(746, 52); g.closePath(); g.fill();
    } else if (kind === 'jungle') { // jungle ridge with canopy bumps + a stepped ruin
      g.fillStyle = '#7c4b52';
      g.beginPath(); g.moveTo(0, 256);
      let x = 0, y = 150;
      while (x < 1024) {
        const w = 30 + R() * 46; y = Math.min(220, Math.max(80, y + (R() - 0.5) * 60));
        g.quadraticCurveTo(x + w * 0.5, y - 26 - R() * 24, x + w, y); x += w;
      }
      g.lineTo(1024, 256); g.closePath(); g.fill();
      // stepped pyramid ruin poking through canopy
      for (const bx of [230, 780]) {
        for (let s = 0; s < 4; s++) {
          const w = 130 - s * 30, h = 22;
          g.fillRect(bx - w / 2, 130 - s * h, w, h + 2);
        }
      }
      // palm fronds
      g.strokeStyle = '#7c4b52'; g.lineWidth = 5;
      for (let i = 0; i < 10; i++) {
        const px = R() * 1024, py = 90 + R() * 60;
        for (let a = 0; a < 5; a++) {
          g.beginPath(); g.moveTo(px, py);
          g.quadraticCurveTo(px + (a - 2) * 14, py - 26, px + (a - 2) * 30, py - 10 - R() * 12); g.stroke();
        }
      }
    } else { // near temple skyline: terraces, stelae, torch dots
      g.fillStyle = '#553441';
      g.beginPath(); g.moveTo(0, 256);
      let x = 0;
      while (x < 1024) {
        const kindR = R();
        if (kindR < 0.4) { // stepped platform
          const w = 90 + R() * 90, steps = 2 + (R() * 3 | 0), sh = 24;
          for (let s = 0; s < steps; s++) g.rect(x + s * 12, 256 - (s + 1) * sh, w - s * 24, sh);
          x += w + 24 + R() * 60;
        } else if (kindR < 0.7) { // stele / column pair
          const w = 22 + R() * 16, h = 90 + R() * 80;
          g.rect(x, 256 - h, w, h); g.rect(x + w + 26, 256 - h + 14, w, h - 14);
          x += w * 2 + 70 + R() * 60;
        } else { x += 50 + R() * 80; }
      }
      g.fill();
      // warm windows / torch dots
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(255,${150 + R() * 60 | 0},70,${0.5 + R() * 0.5})`;
        g.fillRect(R() * 1024, 140 + R() * 90, 4, 6);
      }
    }
  });
}

// soft radial mist blob
function mistTexture() {
  return ctex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,220,180,0.55)');
    gr.addColorStop(0.5, 'rgba(230,190,160,0.25)');
    gr.addColorStop(1, 'rgba(220,180,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
}

// festival garland: rope + triangle flags with droop baked in
function garlandTexture(seed) {
  return ctex(1024, 256, (g) => {
    const R = rand(seed * 17 + 5);
    g.clearRect(0, 0, 1024, 256);
    const droop = 88;
    const ropeY = (x) => 30 + Math.sin((x / 1024) * Math.PI) * droop;
    g.strokeStyle = '#6b4a2c'; g.lineWidth = 6; g.beginPath();
    g.moveTo(0, ropeY(0));
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, ropeY(x));
    g.stroke();
    const cols = ['#e8543f', '#f2b34c', '#3fb0a8', '#efe3c2', '#c05dc2'];
    for (let x = 34; x < 1024; x += 78) {
      const y = ropeY(x), col = cols[(R() * cols.length) | 0], sway = (R() - 0.5) * 14;
      g.fillStyle = col; g.beginPath();
      g.moveTo(x - 26, y); g.lineTo(x + 26, y); g.lineTo(x + sway, y + 64); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,240,200,0.28)'; g.beginPath();
      g.moveTo(x - 26, y); g.lineTo(x + 26, y); g.lineTo(x + sway * 0.5 + 6, y + 20); g.closePath(); g.fill();
    }
  });
}

function leafTexture() {
  return ctex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const R = rand(777);
    g.fillStyle = 'rgba(16,14,10,0.96)';
    for (let i = 0; i < 46; i++) {
      const x = 100 + R() * 330, y = 100 + R() * 330, a = R() * 6.3, L = 60 + R() * 120, W = 16 + R() * 26;
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(L * 0.5, -W, L, 0); g.quadraticCurveTo(L * 0.5, W, 0, 0);
      g.fill(); g.restore();
    }
  });
}

function flameTexture() {
  return ctex(128, 256, (g) => {
    g.clearRect(0, 0, 128, 256);
    const gr = g.createRadialGradient(64, 200, 4, 64, 170, 150);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.2, 'rgba(255,200,90,0.85)');
    gr.addColorStop(0.55, 'rgba(255,120,40,0.35)');
    gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr;
    // teardrop flame shape
    g.beginPath();
    g.moveTo(64, 20);
    g.bezierCurveTo(100, 110, 112, 170, 64, 230);
    g.bezierCurveTo(16, 170, 28, 110, 64, 20);
    g.fill();
  });
}

function godrayTexture() {
  return ctex(256, 512, (g) => {
    g.clearRect(0, 0, 256, 512);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(255,215,150,0.5)');
    gr.addColorStop(0.7, 'rgba(255,190,120,0.12)');
    gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(96, 0); g.lineTo(160, 0); g.lineTo(230, 512); g.lineTo(30, 512); g.closePath(); g.fill();
    // soften side edges so the shaft reads as light, not glass
    const mask = g.createLinearGradient(0, 0, 256, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(0.35, 'rgba(0,0,0,1)');
    mask.addColorStop(0.65, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = mask; g.fillRect(0, 0, 256, 512);
    g.globalCompositeOperation = 'source-over';
  });
}

function coinFaceTexture() {
  return ctex(256, 256, (g) => {
    g.fillStyle = '#d99b2e'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
    g.strokeStyle = '#8a5c12'; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke();
    g.strokeStyle = '#ffe9a8'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.stroke();
    // sun-relic emblem
    g.fillStyle = '#8a5c12';
    g.beginPath(); g.arc(128, 128, 34, 0, 7); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.save(); g.translate(128, 128); g.rotate(a);
      g.beginPath(); g.moveTo(0, -44); g.lineTo(12, -74); g.lineTo(-12, -74); g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(120, 118, 12, 0, 7); g.fill();
  });
}

function glowTexture(color = '255,200,90') {
  return ctex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, `rgba(${color},0.85)`);
    gr.addColorStop(0.4, `rgba(${color},0.3)`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}

// ================================================================ buildWorld
export async function buildWorld(scene, L) {
  const FOG = 0xe89a63;
  scene.background = new THREE.Color(0x3a1a1c); // deep maroon-brown, never black behind everything
  scene.fog = new THREE.Fog(FOG, 26, 92);
  const GY = Y(GROUND); // 0

  // -------------------------------------------------------------- lighting
  const sun = new THREE.DirectionalLight(0xffcf95, 2.9);
  sun.position.set(-14, 16, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0005;
  const sunTarget = new THREE.Object3D();
  scene.add(sun, sunTarget); sun.target = sunTarget;
  scene.add(new THREE.HemisphereLight(0xffcf9a, 0x4a4238, 0.85));
  scene.add(new THREE.AmbientLight(0x745a70, 0.5));

  const pointLights = [];
  const addPoint = (x, y, z, color, intensity, dist) => {
    const p = new THREE.PointLight(color, intensity, dist, 1.8);
    p.position.set(x, y, z); scene.add(p); pointLights.push(p); return p;
  };
  const torchL1 = addPoint(U(250), GY + 2.6, 0.8, 0xff9540, 14, 9);
  const torchL2 = addPoint(U(700), GY + 2.6, 0.8, 0xff9540, 14, 9);
  const braceL = addPoint(U(3450), GY + 2.8, 0.6, 0xff9540, 12, 9);   // Z3 entry brazier
  const gateL = addPoint(U(5125), GY + 1.6, 1.6, 0xffb050, 26, 14);   // doorway spill
  const signL = addPoint(U(5125), GY + 4.6, 1.5, 0xff5533, 10, 9);    // sign red wash

  // -------------------------------------------------------------- shared materials
  const grp = new THREE.Group(); scene.add(grp);
  const sideTexBase = stoneTexture(1);
  const topTexBase = topTexture(2);
  sideTexBase.wrapS = sideTexBase.wrapT = THREE.RepeatWrapping;
  topTexBase.wrapS = topTexBase.wrapT = THREE.RepeatWrapping;
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x5e4a34, roughness: 0.95 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf0b542, roughness: 0.3, metalness: 0.85, emissive: 0x4a3005 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xa8813c, roughness: 0.45, metalness: 0.8 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.9 });
  const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x5a7d33, roughness: 0.9 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x36421e, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
  const silDark = new THREE.MeshStandardMaterial({ color: 0x6a5140, roughness: 0.95 });

  // -------------------------------------------------------------- sky + parallax
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(340, 130),
    new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false, depthWrite: false }));
  sky.position.set(U(2600), 16, -78); grp.add(sky);

  const mkLayer = (kind, z, h, yBase, repeats, fillColor) => {
    const t = layerTexture(kind);
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeats, 1);
    const spanNeeded = 110 + (-z) * 1.4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(spanNeeded, h),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false,
        color: kind === 'temple' ? 0xffffff : 0xffe0c0 }));
    m.position.set(U(2600), yBase + h / 2, z); grp.add(m);
    // extend the silhouette wall below its base so no raw-black band appears behind the ground line
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(spanNeeded, 18),
      new THREE.MeshBasicMaterial({ color: fillColor }));
    fill.position.set(U(2600), yBase - 9 + 0.02, z); grp.add(fill);
    return m;
  };
  mkLayer('far', -44, 26, -8, 2, 0x9c534a);
  mkLayer('jungle', -22, 16, -9, 3, 0x7c423d);
  mkLayer('temple', -9, 11, -11.5, 4, 0x553441);

  // warm chasm gradient behind pits (deep maroon, replaces the old near-black void)
  const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(120, 22),
    new THREE.MeshBasicMaterial({ map: chasmTexture() }));
  voidPlane.position.set(U(2600), GY - 11, -5.5); grp.add(voidPlane);

  // -------------------------------------------------------------- ground islands
  const boxAt = (cx, cy, cz, w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, cy, cz); m.receiveShadow = true; m.castShadow = true;
    grp.add(m); return m;
  };
  for (const g of L.ground) {
    const x = U(g[0]), w = U(g[1]);
    const side = sideTexBase.clone(); side.repeat.set(w / 4, 2.6);
    const top = topTexBase.clone(); top.repeat.set(w / 4, 1);
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.92 });
    const topM = new THREE.MeshStandardMaterial({ map: top, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 11, 6.2), sideM);
    body.position.set(x + w / 2, GY - 5.5, -0.6);
    body.receiveShadow = true; body.castShadow = true; grp.add(body);
    const topPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, 6.2), topM);
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.set(x + w / 2, GY + 0.012, -0.6);
    topPlane.receiveShadow = true; grp.add(topPlane);
    // tier ledge (wider footing below the top course)
    const ledge = boxAt(x + w / 2, GY - 1.55, -0.45, w + 0.5, 0.55, 6.6, darkStone);
    ledge.castShadow = false;
  }
  // inlaid gold trim strips along island top front edges (instanced)
  {
    const geo = new THREE.BoxGeometry(1, 0.07, 0.1);
    const inst = new THREE.InstancedMesh(geo, goldMat, L.ground.length);
    const M = new THREE.Matrix4();
    L.ground.forEach((g, i) => {
      M.makeScale(U(g[1]) - 0.3, 1, 1);
      M.setPosition(U(g[0]) + U(g[1]) / 2, GY - 0.035, 2.51);
      inst.setMatrixAt(i, M);
    });
    grp.add(inst);
  }
  // crumbled pit edges: tumbled rubble blocks at island ends facing pits
  {
    const pits = [];
    for (let i = 0; i < L.ground.length - 1; i++) {
      pits.push([U(L.ground[i][0]) + U(L.ground[i][1]), U(L.ground[i + 1][0])]);
    }
    const R = rand(31337);
    const geo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
    const inst = new THREE.InstancedMesh(geo, darkStone, pits.length * 6);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    let n = 0;
    for (const [a, b] of pits) {
      for (let k = 0; k < 6; k++) {
        const edgeX = k < 3 ? a : b, dir = k < 3 ? -1 : 1;
        e.set(R() * 0.7, R() * 3, R() * 0.7 * dir); q.setFromEuler(e);
        s.setScalar(0.6 + R() * 0.9);
        M.compose(new THREE.Vector3(edgeX + dir * (0.1 + R() * 0.35), GY - 0.3 - R() * 1.6, -1.2 + R() * 3),
          q, s);
        inst.setMatrixAt(n++, M);
      }
    }
    inst.castShadow = true; inst.receiveShadow = true; grp.add(inst);
    // rusted rebar-vines jutting from pit walls
    const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x6e4a30, roughness: 0.7, metalness: 0.5 });
    const bars = new THREE.InstancedMesh(barGeo, barMat, pits.length * 3);
    n = 0;
    for (const [a, b] of pits) {
      for (let k = 0; k < 3; k++) {
        const edgeX = k % 2 ? a : b, dir = k % 2 ? 1 : -1;
        e.set(0, 0, dir * (1.2 + R() * 0.5)); q.setFromEuler(e);
        M.compose(new THREE.Vector3(edgeX + dir * 0.35, GY - 1.2 - R() * 2.4, -0.5 + R() * 2), q, new THREE.Vector3(1, 1, 1));
        bars.setMatrixAt(n++, M);
      }
    }
    grp.add(bars);
    // rim light at each pit lip: warm emissive strip on the edge tiles so the
    // walkable edge separates crisply from the shaft below (readability)
    {
      const rimGeo = new THREE.BoxGeometry(0.34, 0.14, 6.4);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xe8b060, roughness: 0.5,
        emissive: 0xff9038, emissiveIntensity: 1.35 });
      const rims = new THREE.InstancedMesh(rimGeo, rimMat, pits.length * 2);
      let rn = 0;
      for (const [a, b] of pits) {
        M.identity(); M.setPosition(a - 0.16, GY - 0.01, -0.45); rims.setMatrixAt(rn++, M);
        M.setPosition(b + 0.16, GY - 0.01, -0.45); rims.setMatrixAt(rn++, M);
      }
      rims.castShadow = false; rims.receiveShadow = false; grp.add(rims);
    }
    // pit interiors: brick walls fading to deep maroon + jutting ledges (no raw void)
    {
      const wallT = pitWallTexture();
      for (const [a, b] of pits) {
        const pw = b - a;
        const t = wallT.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, pw / 4), 1.8);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(pw + 1.4, 8),
          new THREE.MeshStandardMaterial({ map: t, roughness: 0.96 }));
        wall.position.set((a + b) / 2, GY - 4, -3.2);
        wall.receiveShadow = true; grp.add(wall);
        // 2-3 jutting ledge/root silhouettes at staggered depths for parallax
        const nL = pw > 8 ? 3 : 2;
        for (let k = 0; k < nL; k++) {
          const lw = 0.9 + R() * (pw > 8 ? 2.2 : 0.9);
          const lx = a + (0.2 + 0.6 * (k / Math.max(1, nL - 1))) * pw + (R() - 0.5) * 0.6;
          const ledge = boxAt(lx, GY - 1.6 - k * 1.4 - R() * 0.6, -1.4 - k * 0.8,
            lw, 0.32 + R() * 0.2, 0.9, darkStone);
          ledge.rotation.z = (R() - 0.5) * 0.16;
          ledge.castShadow = false;
        }
      }
    }
    // mist planes drifting up in pits
    var mists = [];
    for (const [a, b] of pits) {
      const cx = (a + b) / 2, pw = Math.max(2.6, b - a);
      for (let k = 0; k < 2; k++) {
        const mistMat = new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true,
          depthWrite: false, opacity: 0.7 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(pw * 1.8, 3.4), mistMat);
        m.position.set(cx + (k - 0.5) * pw * 0.35, GY - 0.9 - k * 1.6, 0.9 + k * 0.5);
        m.userData = { baseY: m.position.y, ph: cx + k * 3 };
        grp.add(m); mists.push(m);
      }
    }
  }

  // -------------------------------------------------------------- walls (stele blocks)
  const glyphT = glyphTexture(4);
  const glyphMat = new THREE.MeshStandardMaterial({ map: glyphT, roughness: 0.9 });
  for (const w of L.walls) {
    const x = U(w[0]), yTop = Y(w[1]), ww = U(w[2]), hh = U(w[3]);
    const stele = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 1.5), glyphMat);
    stele.position.set(x + ww / 2, yTop - hh / 2, 0);
    stele.castShadow = stele.receiveShadow = true; grp.add(stele);
    boxAt(x + ww / 2, yTop + 0.09, 0, ww + 0.24, 0.18, 1.7, darkStone); // capstone
    const trim = boxAt(x + ww / 2, yTop - hh + 0.1, 0, ww + 0.16, 0.2, 1.6, brassMat); // base band
    trim.castShadow = false;
  }

  // -------------------------------------------------------------- one-way platforms
  {
    const slabSide = sideTexBase.clone(); slabSide.repeat.set(1.4, 0.28);
    const slabTop = topTexBase.clone(); slabTop.repeat.set(0.7, 0.5);
    const sideM = new THREE.MeshStandardMaterial({ map: slabSide, roughness: 0.9 });
    const topM = new THREE.MeshStandardMaterial({ map: slabTop, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(1, 0.42, 1.9);
    const inst = new THREE.InstancedMesh(geo, sideM, L.plats.length);
    const M = new THREE.Matrix4();
    L.plats.forEach((p, i) => {
      M.makeScale(U(p[2]), 1, 1);
      M.setPosition(U(p[0]) + U(p[2]) / 2, Y(p[1]) - 0.21, 0);
      inst.setMatrixAt(i, M);
    });
    inst.castShadow = inst.receiveShadow = true; grp.add(inst);
    // mossy top overlay (instanced planes)
    const topInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1.9), topM, L.plats.length);
    const rotX = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    L.plats.forEach((p, i) => {
      M.makeScale(U(p[2]), 1, 1).multiply(rotX);
      M.setPosition(U(p[0]) + U(p[2]) / 2, Y(p[1]) + 0.012, 0);
      topInst.setMatrixAt(i, M);
    });
    topInst.receiveShadow = true; grp.add(topInst);
    // gold edge tick on each slab front lip (readability: standable)
    const tickInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.08), goldMat, L.plats.length);
    L.plats.forEach((p, i) => {
      M.makeScale(U(p[2]) - 0.2, 1, 1);
      M.setPosition(U(p[0]) + U(p[2]) / 2, Y(p[1]) - 0.03, 0.97);
      tickInst.setMatrixAt(i, M);
    });
    grp.add(tickInst);
    // dangling snapped vines below slabs
    const vineGeo = new THREE.CylinderGeometry(0.022, 0.012, 1, 5);
    const vines = new THREE.InstancedMesh(vineGeo, vineMat, L.plats.length * 3);
    const R = rand(909); const q = new THREE.Quaternion(), e = new THREE.Euler();
    let n = 0;
    L.plats.forEach((p) => {
      for (let k = 0; k < 3; k++) {
        const len = 0.4 + R() * 0.7;
        e.set((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.14); q.setFromEuler(e);
        M.compose(new THREE.Vector3(U(p[0]) + 0.3 + R() * (U(p[2]) - 0.6), Y(p[1]) - 0.42 - len / 2, (R() - 0.5) * 1.4),
          q, new THREE.Vector3(1, len, 1));
        vines.setMatrixAt(n++, M);
      }
    });
    grp.add(vines);
  }
  // broken support columns beneath plats that sit over solid ground (behind plane)
  {
    const overGround = (px) => L.ground.some(g => px > g[0] && px < g[0] + g[1]);
    const colTex = stoneTexture(8, '#a37e50');
    colTex.wrapS = colTex.wrapT = THREE.RepeatWrapping; colTex.repeat.set(1.5, 3);
    const colMat = new THREE.MeshStandardMaterial({ map: colTex, roughness: 0.92 });
    const geo = new THREE.CylinderGeometry(0.34, 0.42, 1, 10);
    const supports = L.plats.filter(p => overGround(p[0] + p[2] / 2));
    // + a few free-standing broken stubs for Z2 dressing
    const stubs = [[1120, 1.6], [2000, 2.2], [3080, 1.2], [3390, 2.8], [4750, 1.9]];
    const inst = new THREE.InstancedMesh(geo, colMat, supports.length + stubs.length);
    const M = new THREE.Matrix4();
    let n = 0;
    for (const p of supports) {
      const h = Y(p[1]) - 0.4 - GY;
      M.makeScale(1, h, 1);
      M.setPosition(U(p[0] + p[2] / 2), GY + h / 2, -1.35);
      inst.setMatrixAt(n++, M);
    }
    for (const [sx, h] of stubs) {
      M.makeScale(1.1, h, 1.1);
      M.setPosition(U(sx), GY + h / 2, -2.4);
      inst.setMatrixAt(n++, M);
    }
    inst.castShadow = inst.receiveShadow = true; grp.add(inst);
    // cracked drum tops on the stubs
    const drum = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.44, 0.3, 10), darkStone, stubs.length);
    stubs.forEach(([sx, h], i) => {
      M.makeRotationZ(0.12 * (i % 2 ? 1 : -1));
      M.setPosition(U(sx), GY + h + 0.12, -2.4);
      drum.setMatrixAt(i, M);
    });
    drum.castShadow = true; grp.add(drum);
  }

  // -------------------------------------------------------------- phasing girders
  const phaseGroups = [];
  {
    const glowT = glowTexture('90,240,255');
    for (const p of L.phase) {
      const w = U(p[2]), cx = U(p[0]) + w / 2, ty = Y(p[1]);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4fc0b8, roughness: 0.25, metalness: 0.85,
        transparent: true, opacity: 0.5, emissive: 0x1a8a90, emissiveIntensity: 1.2,
      });
      const girder = new THREE.Mesh(new THREE.BoxGeometry(w, 0.34, 1.5), mat);
      girder.position.set(cx, ty - 0.17, 0); grp.add(girder);
      // bronze rivet rails top edges
      const railMat = new THREE.MeshStandardMaterial({
        color: 0xc08a3a, roughness: 0.4, metalness: 0.85, transparent: true, opacity: 0.5,
        emissive: 0x552a00, emissiveIntensity: 0.6,
      });
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.14), railMat);
      rail.position.set(cx, ty + 0.02, 0.68); grp.add(rail);
      // permanent emitter posts at both ends (always visible: telegraphs location)
      const postMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.5, metalness: 0.7, emissive: 0x30fff0, emissiveIntensity: 0.8 });
      for (const ex of [U(p[0]) - 0.18, U(p[0]) + w + 0.18]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.8, 6), postMat);
        post.position.set(ex, ty - 0.28, 0); grp.add(post);
      }
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 1.1),
        new THREE.MeshBasicMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0.5 }));
      beam.position.set(cx, ty - 0.15, 0.8); grp.add(beam);
      phaseGroups.push({ mat, railMat, postMat, beamMat: beam.material });
    }
  }

  // -------------------------------------------------------------- spikes
  {
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.25, metalness: 0.9 });
    const geo = new THREE.ConeGeometry(0.16, 0.85, 7);
    const inst = new THREE.InstancedMesh(geo, spikeMat, L.spikes.length * 6);
    const M = new THREE.Matrix4();
    const R = rand(5150);
    let n = 0;
    for (const s of L.spikes) {
      for (let i = 0; i < 6; i++) {
        const h = 0.75 + R() * 0.4;
        M.makeScale(1, h, 1);
        M.setPosition(U(s[0]) + 0.22 + i * 0.39, GY + h * 0.42, (i % 2 ? 0.28 : -0.28));
        inst.setMatrixAt(n++, M);
      }
    }
    inst.castShadow = true; grp.add(inst);
    // slotted stone bases
    const baseGeo = new THREE.BoxGeometry(2.6, 0.26, 1.4);
    const baseInst = new THREE.InstancedMesh(baseGeo, darkStone, L.spikes.length);
    L.spikes.forEach((s, i) => {
      M.identity(); M.setPosition(U(s[0]) + 1.18, GY + 0.1, 0);
      baseInst.setMatrixAt(i, M);
    });
    baseInst.receiveShadow = true; grp.add(baseInst);
  }

  // -------------------------------------------------------------- medallions
  const coinCount = L.coins.length;
  const coinFace = coinFaceTexture();
  const coinFaceMat = new THREE.MeshStandardMaterial({ map: coinFace, roughness: 0.3, metalness: 0.6, emissive: 0x664410, emissiveIntensity: 0.5, emissiveMap: coinFace });
  const coinEdgeMat = new THREE.MeshStandardMaterial({ color: 0xd99b2e, roughness: 0.3, metalness: 0.8, emissive: 0x553800 });
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 22);
  const coinInst = new THREE.InstancedMesh(coinGeo, [coinEdgeMat, coinFaceMat, coinFaceMat], coinCount);
  // update() rewrites every instance matrix each frame, so the cached bounding
  // sphere is never trustworthy — leaving culling on can drop the whole mesh.
  coinInst.frustumCulled = false;
  coinInst.castShadow = true; grp.add(coinInst);
  const coinGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: glowTexture('255,205,100'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }), coinCount);
  coinGlow.frustumCulled = false;
  grp.add(coinGlow);

  // -------------------------------------------------------------- goal gate
  const signPulse = [];
  {
    const gx = U(L.goalRect[0] + 45); // 102.5
    const gateSide = sideTexBase.clone(); gateSide.repeat.set(1.4, 3);
    const gateMat = new THREE.MeshStandardMaterial({ map: gateSide, roughness: 0.9 });
    // pillars flanking doorway (recessed so player crosses in front/into)
    for (const dx of [-2.6, 2.6]) {
      const p = boxAt(gx + dx, GY + 3.6, -1.7, 1.7, 7.2, 2.4, gateMat);
      p.material = gateMat;
      boxAt(gx + dx, GY + 7.1, -1.7, 2.3, 0.55, 2.8, darkStone);
      const g2 = boxAt(gx + dx, GY + 5.4, -0.55, 1.5, 0.28, 0.3, goldMat); g2.castShadow = false;
    }
    // lintel + stepped crown
    boxAt(gx, GY + 7.65, -1.7, 7.6, 0.9, 2.6, gateMat);
    boxAt(gx, GY + 8.35, -1.8, 6.2, 0.6, 2.2, darkStone);
    boxAt(gx, GY + 8.9, -1.9, 4.6, 0.55, 1.9, gateMat);
    // dark doorway + warm light spilling out
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.4),
      new THREE.MeshBasicMaterial({ color: 0x1c0f08 }));
    doorway.position.set(gx, GY + 3.2, -1.55); grp.add(doorway);
    const spillT = ctex(128, 256, (g) => {
      const gr = g.createLinearGradient(0, 256, 0, 0);
      gr.addColorStop(0, 'rgba(255,190,110,0.95)');
      gr.addColorStop(0.55, 'rgba(255,150,70,0.4)');
      gr.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.9),
      new THREE.MeshBasicMaterial({ map: spillT, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, color: 0xcc8844, opacity: 0.8 }));
    spill.position.set(gx, GY + 2.95, -1.5); grp.add(spill);
    signPulse.push(spill.material);
    // floor glow where light lands
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 3),
      new THREE.MeshBasicMaterial({ map: glowTexture('255,180,90'), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.65 }));
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(gx, GY + 0.02, 0.2); grp.add(floorGlow);
    // the steampunk GO LIVE sign mounted over the lintel, tilted toward camera
    const signT = signTexture();
    const signMat = new THREE.MeshStandardMaterial({ map: signT, roughness: 0.5, metalness: 0.4,
      emissive: 0xffffff, emissiveMap: signT, emissiveIntensity: 0.55 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.7, 0.26), brassMat);
    sign.position.set(gx, GY + 5.75, -0.45); sign.rotation.x = -0.1;
    sign.castShadow = true; grp.add(sign);
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.7), signMat);
    signFace.position.set(gx, GY + 5.75 - Math.sin(0.1) * 0.14, -0.45 + Math.cos(0.1) * 0.14);
    signFace.rotation.x = -0.1; grp.add(signFace);
    signPulse.push(signMat);
    // hanging brackets
    for (const dx of [-2.2, 2.2]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), brassMat);
      rod.position.set(gx + dx, GY + 7.2, -0.5); rod.rotation.x = -0.18; grp.add(rod);
    }
    // celebratory garlands on the gate
    const gT = garlandTexture(9);
    const gar = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.8),
      new THREE.MeshBasicMaterial({ map: gT, transparent: true, side: THREE.DoubleSide }));
    gar.position.set(gx, GY + 7.0, -0.4); grp.add(gar);
  }

  // -------------------------------------------------------------- ZONE 1: festival plaza (0-20)
  {
    // banner poles + garlands
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 7);
    const poles = new THREE.InstancedMesh(poleGeo, woodMat, 5);
    const poleXs = [1.5, 5.5, 9.5, 13.5, 17.5];
    const M = new THREE.Matrix4();
    poleXs.forEach((px, i) => {
      M.identity(); M.setPosition(px, GY + 2.1, -1.3);
      poles.setMatrixAt(i, M);
    });
    poles.castShadow = true; grp.add(poles);
    for (let i = 0; i < 4; i++) {
      const t = garlandTexture(i + 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
      m.position.set((poleXs[i] + poleXs[i + 1]) / 2, GY + 3.55, -1.3);
      grp.add(m);
    }
    // torch braziers (bowl + stand), flames as additive planes
    const torchXs = [U(250), U(700), U(3450)];
    const standGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.5, 7);
    const bowlGeo = new THREE.CylinderGeometry(0.34, 0.16, 0.3, 8);
    const stands = new THREE.InstancedMesh(standGeo, brassMat, torchXs.length);
    const bowls = new THREE.InstancedMesh(bowlGeo, darkStone, torchXs.length);
    torchXs.forEach((tx, i) => {
      M.identity(); M.setPosition(tx, GY + 0.75, 0.8); stands.setMatrixAt(i, M);
      M.setPosition(tx, GY + 1.6, 0.8); bowls.setMatrixAt(i, M);
    });
    stands.castShadow = true; grp.add(stands, bowls);
    var flameMeshes = [];
    const fT = flameTexture();
    for (const tx of torchXs) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.35),
        new THREE.MeshBasicMaterial({ map: fT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.position.set(tx, GY + 2.45, 0.8); grp.add(f); flameMeshes.push(f);
    }
    // lush planters
    const potGeo = new THREE.BoxGeometry(0.9, 0.55, 0.9);
    const bushGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const potXs = [3.2, 7.6, 11.4, 15.2, 19.2];
    const pots = new THREE.InstancedMesh(potGeo, glyphMat, potXs.length);
    const bush = new THREE.InstancedMesh(bushGeo, foliageMat, potXs.length);
    const bush2 = new THREE.InstancedMesh(bushGeo, foliageMat2, potXs.length);
    potXs.forEach((px, i) => {
      M.identity(); M.setPosition(px, GY + 0.28, 1.1); pots.setMatrixAt(i, M);
      M.makeScale(1, 0.85, 1); M.setPosition(px, GY + 0.95, 1.1); bush.setMatrixAt(i, M);
      M.makeScale(0.6, 0.55, 0.6); M.setPosition(px + 0.3, GY + 0.8, 1.35); bush2.setMatrixAt(i, M);
    });
    pots.castShadow = bush.castShadow = true; grp.add(pots, bush, bush2);
    // drifting confetti (instanced quads, animated in update)
    var confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.16),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 44);
    confetti.frustumCulled = false;   // animated each frame; see the coin note above
    const R = rand(2024);
    var confettiSeeds = [];
    const cCols = [new THREE.Color(0xe8543f), new THREE.Color(0xf2b34c), new THREE.Color(0x3fb0a8), new THREE.Color(0xefe3c2), new THREE.Color(0xc05dc2)];
    for (let i = 0; i < 44; i++) {
      confettiSeeds.push({ x: R() * 19, y: R() * 6, z: -1 + R() * 2.6, sp: 0.25 + R() * 0.5, ph: R() * 7, rot: R() * 7 });
      confetti.setColorAt(i, cCols[i % cCols.length]);
    }
    grp.add(confetti);
  }

  // -------------------------------------------------------------- ZONE 2 dressing (20-64)
  {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    // fallen column drums
    const R = rand(626);
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 10);
    const drumTex = stoneTexture(12, '#9a7648'); drumTex.wrapS = drumTex.wrapT = THREE.RepeatWrapping;
    const drumMat = new THREE.MeshStandardMaterial({ map: drumTex, roughness: 0.92 });
    const fallenAt = [[1300, -2.1], [2150, -1.8], [3150, -2.6], [2200, -1.6]];
    const fallen = new THREE.InstancedMesh(drumGeo, drumMat, fallenAt.length);
    fallenAt.forEach(([px, z], i) => {
      e.set(0, R() * 3, Math.PI / 2 + (R() - 0.5) * 0.2); q.setFromEuler(e);
      M.compose(new THREE.Vector3(U(px), GY + 0.42, z), q, new THREE.Vector3(1, 1, 1));
      fallen.setMatrixAt(i, M);
    });
    fallen.castShadow = fallen.receiveShadow = true; grp.add(fallen);
    // strangler-fig root arcs gripping island edges
    const rootGeo = new THREE.TorusGeometry(0.8, 0.09, 6, 10, Math.PI);
    const roots = new THREE.InstancedMesh(rootGeo, vineMat, 7);
    const rootAt = [[1030, -0.4], [1520, 0.9], [1780, -1.6], [2230, 0.6], [2980, -1.2], [3520, 0.7], [3790, -0.9]];
    rootAt.forEach(([px, z], i) => {
      e.set(0, (R() - 0.5) * 0.8, 0); q.setFromEuler(e);
      M.compose(new THREE.Vector3(U(px), GY, z), q, new THREE.Vector3(1, 0.8 + R() * 0.7, 1));
      roots.setMatrixAt(i, M);
    });
    roots.castShadow = true; grp.add(roots);
    // collapsed arch in the big pit background (x ~ 50)
    const archCol1 = boxAt(45.9, GY + 1.3, -4.4, 0.9, 2.6, 0.9, drumMat);
    const archCol2 = boxAt(49.2, GY + 2.0, -4.4, 0.9, 4.0, 0.9, drumMat);
    const archLintel = boxAt(47.5, GY + 3.5, -4.4, 3.2, 0.55, 1, darkStone);
    archLintel.rotation.z = -0.22;
    archCol1.castShadow = archCol2.castShadow = false;
  }

  // -------------------------------------------------------------- ZONE 3 dressing (64-104)
  {
    // guardian statues (original bird-jaguar hybrid: plinth, seated body, beaked head, folded wings)
    const statTex = stoneTexture(21, '#9a7a55'); statTex.wrapS = statTex.wrapT = THREE.RepeatWrapping;
    const statMat = new THREE.MeshStandardMaterial({ map: statTex, roughness: 1 });
    const mkGuardian = (x, z, s, mirror) => {
      const g = new THREE.Group();
      const add = (geo, px, py, pz, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, statMat);
        m.position.set(px, py, pz); m.rotation.x = rx; m.rotation.z = rz;
        m.castShadow = true; g.add(m); return m;
      };
      add(new THREE.BoxGeometry(2.0, 3.2, 1.9), 0, -1.6, 0);                    // pedestal column (reaches down)
      add(new THREE.BoxGeometry(2.4, 1, 2.2), 0, 0.5, 0);                       // plinth
      add(new THREE.BoxGeometry(1.5, 1.7, 1.7), 0, 1.85, 0);                    // haunches
      add(new THREE.BoxGeometry(1.1, 1.5, 1.1), 0.15 * mirror, 3.2, 0, 0, -0.08 * mirror); // chest
      add(new THREE.BoxGeometry(0.95, 0.85, 0.95), 0.2 * mirror, 4.25, 0);      // head
      add(new THREE.ConeGeometry(0.28, 0.9, 5), 0.75 * mirror, 4.15, 0, 0, mirror * -Math.PI / 2.3); // beak
      add(new THREE.ConeGeometry(0.2, 0.6, 4), 0.05 * mirror, 4.85, -0.2, 0, 0.15); // ear/crest
      add(new THREE.ConeGeometry(0.2, 0.6, 4), 0.35 * mirror, 4.85, 0.2, 0, -0.15);
      const wing = add(new THREE.BoxGeometry(0.22, 1.7, 1.2), -0.6 * mirror, 2.9, 0, 0, mirror * 0.12); // folded wing
      wing.rotation.y = 0.1;
      // gold collar
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.22, 10), goldMat);
      collar.position.set(0.16 * mirror, 3.85, 0); g.add(collar);
      g.position.set(x, GY, z); g.scale.setScalar(s);
      if (mirror < 0) g.scale.x *= 1; // orientation via mirror offsets above
      grp.add(g);
    };
    // grand stair silhouette rising behind the causeway toward the gate (pushed deep, darker)
    const stairMat = new THREE.MeshStandardMaterial({ color: 0x8a6a50, roughness: 1 });
    for (let s = 0; s < 4; s++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(17 - s * 3.4, 1.0, 2.4), stairMat);
      m.position.set(88.5, GY + 0.5 + s * 1.0, -6.8 - s * 0.5);
      grp.add(m);
    }
    // guardians flanking the approach as background statuary
    mkGuardian(74.5, -6.0, 1.15, 1);
    mkGuardian(92.5, -7.5, 1.2, -1);
    // god-ray shafts
    var godrays = [];
    const gT = godrayTexture();
    for (const [gx, gy, s, rot] of [[70, 6.5, 1.1, -0.35], [80.5, 7, 1.35, -0.3], [93, 7.5, 1.5, -0.32]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * s, 10 * s),
        new THREE.MeshBasicMaterial({ map: gT, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0.5 }));
      m.position.set(gx, gy, -2.8); m.rotation.z = rot;
      m.userData = { ph: gx };
      grp.add(m); godrays.push(m);
    }
  }

  // -------------------------------------------------------------- foreground silhouettes
  {
    const lT = leafTexture();
    const mat = new THREE.MeshBasicMaterial({ map: lT, transparent: true, depthWrite: false, opacity: 0.92 });
    const spots = [[0.5, 9.8, 3.5, 3.2], [27, 10.2, 4, 3.6], [57.5, 10.1, 3.5, 3], [84, 10.4, 4, 3.4]];
    for (const [x, y, z, s] of spots) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
      m.position.set(x, y, z); m.rotation.z = (x * 13 % 7) / 5;
      grp.add(m);
    }
  }

  // ================================================================ update
  const M4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const pos = new THREE.Vector3();

  return {
    update(dt, t, state) {
      const px = U(state.player.x);
      // sun follows player (preserve existing behavior)
      sun.position.x = px - 14; sunTarget.position.x = px;
      sunTarget.updateMatrixWorld();

      // phasing girders: 0=gone, 0.5=warning shimmer, 1=solid
      const a = state.phaseAlpha;
      const warning = a > 0.02 && a < 0.98;
      const flick = warning ? (Math.sin(t * 22) * 0.5 + 0.5) : 0;
      for (const g of phaseGroups) {
        const vis = a > 0.02;
        g.mat.visible = g.railMat.visible = vis;
        g.mat.opacity = warning ? 0.25 + flick * 0.45 : a;
        g.railMat.opacity = g.mat.opacity;
        if (warning) {
          g.mat.emissive.setHex(flick > 0.5 ? 0xff5510 : 0x1a8a90); // hazard flash amber/teal
          g.mat.emissiveIntensity = 1.6 + flick * 1.4;
          g.beamMat.opacity = 0.25 + flick * 0.5;
          g.beamMat.color.setHex(0xffaa66);
        } else {
          g.mat.emissive.setHex(0x1a8a90);
          g.mat.emissiveIntensity = a > 0.5 ? 1.2 : 0.6;
          g.beamMat.opacity = a > 0.5 ? 0.5 : 0.06;
          g.beamMat.color.setHex(0xffffff);
        }
        g.postMat.emissiveIntensity = 0.6 + Math.sin(t * 5) * 0.3 + flick * 1.2;
      }

      // medallions: spin + bob, hide when got
      for (let i = 0; i < coinCount; i++) {
        const c = state.coins[i];
        if (c.got) {
          M4.makeScale(0, 0, 0);
          coinInst.setMatrixAt(i, M4); coinGlow.setMatrixAt(i, M4);
          continue;
        }
        const cx = U(c.x + 20), cy = Y(c.y + 20) + Math.sin(t * 2.6 + i * 1.7) * 0.09;
        eul.set(Math.PI / 2, t * 2.4 + i * 0.9, 0, 'YXZ'); quat.setFromEuler(eul);
        M4.compose(pos.set(cx, cy, 0), quat, one);
        coinInst.setMatrixAt(i, M4);
        const gs = 0.85 + Math.sin(t * 3.4 + i) * 0.14;
        M4.makeScale(gs, gs, 1); M4.setPosition(cx, cy, -0.1);
        coinGlow.setMatrixAt(i, M4);
      }
      coinInst.instanceMatrix.needsUpdate = true;
      coinGlow.instanceMatrix.needsUpdate = true;

      // confetti drift in festival plaza
      for (let i = 0; i < confettiSeeds.length; i++) {
        const s = confettiSeeds[i];
        const yy = GY + 6.4 - ((s.y + t * s.sp) % 6.4);
        const xx = s.x + Math.sin(t * 1.4 + s.ph) * 0.5;
        eul.set(t * 2 + s.rot, t * 1.3 + s.ph, s.rot); quat.setFromEuler(eul);
        M4.compose(pos.set(xx, yy, s.z), quat, one);
        confetti.setMatrixAt(i, M4);
      }
      confetti.instanceMatrix.needsUpdate = true;

      // torch flames flicker + billboard wobble
      for (let i = 0; i < flameMeshes.length; i++) {
        const f = flameMeshes[i];
        const k = 0.9 + Math.sin(t * 11 + i * 2.4) * 0.12 + Math.sin(t * 23 + i) * 0.06;
        f.scale.set(k, k * (1 + Math.sin(t * 17 + i) * 0.08), 1);
        f.rotation.z = Math.sin(t * 7 + i * 3) * 0.08;
      }
      torchL1.intensity = 13 + Math.sin(t * 13) * 2.5;
      torchL2.intensity = 13 + Math.sin(t * 11 + 2) * 2.5;
      braceL.intensity = 11 + Math.sin(t * 12 + 4) * 2.2;

      // mist drifts upward in pits (kept below rim height for readability)
      for (const m of mists) {
        m.position.y = m.userData.baseY + ((t * 0.3 + m.userData.ph) % 2.2) - 1.6;
        m.material.opacity = 0.55 + Math.sin(t * 0.9 + m.userData.ph) * 0.18;
      }

      // god rays breathe
      for (const m of godrays) m.material.opacity = 0.38 + Math.sin(t * 0.7 + m.userData.ph) * 0.14;

      // GO LIVE sign pulse + gate lights
      const sp = 0.5 + Math.sin(t * 3.2) * 0.14 + Math.sin(t * 9.7) * 0.05;
      for (const m of signPulse) {
        if (m.isMeshStandardMaterial) m.emissiveIntensity = sp + 0.15;
        else m.opacity = 0.55 + sp * 0.35;
      }
      gateL.intensity = 24 + Math.sin(t * 2.1) * 4;
      signL.intensity = 8 + sp * 8;
    },
  };
}
