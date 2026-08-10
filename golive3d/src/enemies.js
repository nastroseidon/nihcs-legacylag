// CONTRACT (character specialist owns this module too):
//   export async function createEnemyVisuals(scene, enemies) ->
//     { update(state, dt), reset(enemies) }
// One visual per engine enemy (state.enemies[i]): CRT-headed army-green "Legacy
// Lag" bot — retro monitor face (glowing green angry eyes), boxy body, cables,
// boots, clutching papers. Death states: e.deathBy 'stomp' (head telescopes in,
// spring back, tip over) or 'scan' (glitch jitter + scanline sweep + voxel
// dissolve burst). e.dying counts down from 40 (stomp) / 60 (scan).
// One shared geometry set for all units; only per-effect materials are cloned.
import * as THREE from '../lib/three.module.js';
import { U, Y } from './leveldata.js';

const COL = {
  green: 0x69763f, greenDark: 0x525d31, greenLight: 0x7d8a4d,
  brass: 0xc19345, boot: 0x6e4a26, bootDark: 0x50351b,
  cable: 0x3c3f3a, paper: 0xd9c9a3, red: 0xdd2a1e,
};
const mat = (c, rough = 0.7, metal = 0.0) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

// ---- tiny merge helper (bakes matrices, concat non-indexed) ----
function mergeGeo(items) {
  const pos = [], nor = [], uv = [];
  for (const { g, m } of items) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (m) gg.applyMatrix4(m);
    pos.push(...gg.attributes.position.array);
    nor.push(...gg.attributes.normal.array);
    const u = gg.attributes.uv;
    if (u) uv.push(...u.array); else uv.push(...new Float32Array(gg.attributes.position.count * 2));
    if (gg !== g) gg.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
const T = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz));

// ---- canvas textures ----
function crtFaceTextures() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // bezel
  g.fillStyle = '#6e7a44'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#586335'; g.fillRect(0, 0, 256, 12); g.fillRect(0, 244, 256, 12);
  // screen well
  g.fillStyle = '#141d10';
  g.beginPath(); g.roundRect(24, 26, 208, 158, 22); g.fill();
  g.fillStyle = '#0a2c12';
  g.beginPath(); g.roundRect(32, 33, 192, 144, 18); g.fill();
  // angry eyes + frown (bright green)
  const face = (ctx, glow) => {
    ctx.fillStyle = glow ? '#8dff5a' : '#7ee84f';
    // left eye: angled angry wedge
    ctx.save(); ctx.translate(88, 86); ctx.rotate(0.28);
    ctx.beginPath(); ctx.roundRect(-26, -12, 52, 26, 9); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(168, 86); ctx.rotate(-0.28);
    ctx.beginPath(); ctx.roundRect(-26, -12, 52, 26, 9); ctx.fill(); ctx.restore();
    // frown
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(128, 178, 34, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  };
  face(g, false);
  // scanlines
  g.globalAlpha = 0.18; g.fillStyle = '#000';
  for (let y = 33; y < 177; y += 4) g.fillRect(32, y, 192, 2);
  g.globalAlpha = 1;
  // name plate
  g.fillStyle = '#c19345'; g.beginPath(); g.roundRect(58, 198, 140, 30, 5); g.fill();
  g.fillStyle = '#4a3413'; g.font = 'bold 17px monospace'; g.textAlign = 'center';
  g.fillText('THE LEGACY LAG', 128, 219);
  // speaker slits
  g.fillStyle = '#4a5228';
  for (let i = 0; i < 3; i++) g.fillRect(20, 200 + i * 9, 26, 4);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;

  // emissive map: only the face glows
  const e = document.createElement('canvas'); e.width = e.height = 256;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  face(ge, true);
  const emis = new THREE.CanvasTexture(e);
  return { map, emis };
}

function papersTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9c9a3'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b7a67e'; g.lineWidth = 2;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#6b5a3a'; g.font = 'bold 16px monospace'; g.textAlign = 'center';
  g.fillText('LEGACY', 64, 46); g.fillText('REPORTS', 64, 66);
  g.strokeStyle = '#8f7d55'; g.lineWidth = 3;
  for (let y = 84; y < 116; y += 9) { g.beginPath(); g.moveTo(20, y); g.lineTo(108, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createEnemyVisuals(scene, enemies) {
  const grp = new THREE.Group(); scene.add(grp);

  // ---------- shared materials & geometries (built once) ----------
  const mGreen = mat(COL.green, 0.65), mGreenD = mat(COL.greenDark, 0.7),
    mBrass = mat(COL.brass, 0.35, 0.7), mBoot = mat(COL.boot, 0.6),
    mCable = mat(COL.cable, 0.5, 0.3);
  const mBeacon = new THREE.MeshStandardMaterial({
    color: COL.red, emissive: 0xff2210, emissiveIntensity: 1.0, roughness: 0.35 });
  const { map: faceMap, emis: faceEmis } = crtFaceTextures();
  const paperTex = papersTexture();

  // CRT head: front face gets the screen texture, rest plain green
  const headGeo = new THREE.BoxGeometry(0.72, 0.56, 0.5);
  const mHeadSide = mat(COL.greenLight, 0.6);
  const makeFaceMat = () => new THREE.MeshStandardMaterial({
    map: faceMap, emissiveMap: faceEmis, emissive: 0x66ff44,
    emissiveIntensity: 1.15, roughness: 0.5,
  });
  const headMats = [mHeadSide, mHeadSide, mHeadSide, mHeadSide, null /*front, per unit*/, mHeadSide];

  // body with vents/hatch/skirt merged in
  const bodyGeo = mergeGeo([
    { g: new THREE.BoxGeometry(0.5, 0.4, 0.38), m: T(0, 0.51, 0) },
    { g: new THREE.BoxGeometry(0.54, 0.06, 0.42), m: T(0, 0.33, 0) },        // skirt
    { g: new THREE.BoxGeometry(0.17, 0.12, 0.03), m: T(-0.1, 0.53, 0.19) },  // hatch
    { g: new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8), m: T(0.12, 0.53, 0.19, 1, 1, 1, Math.PI / 2) }, // dial
    { g: new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10), m: T(0, 0.76, 0) }, // neck
  ]);
  // brass vent plate on head side
  const ventGeo = mergeGeo([
    { g: new THREE.BoxGeometry(0.02, 0.16, 0.2), m: T(0.365, 0, 0) },
    { g: new THREE.BoxGeometry(0.03, 0.02, 0.16), m: T(0.37, 0.05, 0) },
    { g: new THREE.BoxGeometry(0.03, 0.02, 0.16), m: T(0.37, 0, 0) },
    { g: new THREE.BoxGeometry(0.03, 0.02, 0.16), m: T(0.37, -0.05, 0) },
  ]);
  // beacon dome + collar
  const beaconGeo = new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const beaconBaseGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.05, 10);
  // zigzag antenna (tube) + ball
  const zig = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.09, 0),
    new THREE.Vector3(-0.04, 0.17, 0), new THREE.Vector3(0.05, 0.26, 0),
    new THREE.Vector3(0.01, 0.34, 0)], false, 'catmullrom', 0.9);
  const antennaGeo = mergeGeo([
    { g: new THREE.TubeGeometry(zig, 14, 0.012, 5) },
    { g: new THREE.SphereGeometry(0.032, 8, 6), m: T(0.01, 0.35, 0) },
  ]);
  // cable bundle on back: 3 drooping tubes
  const cableItems = [];
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * 0.09;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, 0.95, -0.24), new THREE.Vector3(sx * 1.8, 0.78, -0.44),
      new THREE.Vector3(sx * 2.2, 0.52, -0.5), new THREE.Vector3(sx * 1.6, 0.38, -0.38),
    ]);
    cableItems.push({ g: new THREE.TubeGeometry(curve, 12, 0.028, 6) });
  }
  const cableGeo = mergeGeo(cableItems);
  const plugGeo = mergeGeo([
    { g: new THREE.BoxGeometry(0.08, 0.07, 0.1), m: T(0.14, 0.36, -0.38) },
    { g: new THREE.CylinderGeometry(0.008, 0.008, 0.06, 5), m: T(0.12, 0.36, -0.44, 1, 1, 1, Math.PI / 2) },
    { g: new THREE.CylinderGeometry(0.008, 0.008, 0.06, 5), m: T(0.16, 0.36, -0.44, 1, 1, 1, Math.PI / 2) },
  ]);
  // arm: stub cylinder + mitten
  const armGeo = mergeGeo([
    { g: new THREE.CylinderGeometry(0.045, 0.05, 0.2, 8), m: T(0, -0.1, 0) },
    { g: new THREE.SphereGeometry(0.085, 10, 8), m: T(0, -0.22, 0.01, 1, 0.92, 1.05) },
    { g: new THREE.SphereGeometry(0.045, 8, 6), m: T(0, -0.19, 0.075) }, // thumb
  ]);
  // segmented leg + big boot
  const legGeo = mergeGeo([
    { g: new THREE.CylinderGeometry(0.05, 0.045, 0.13, 8), m: T(0, -0.065, 0) },
    { g: new THREE.SphereGeometry(0.055, 8, 6), m: T(0, -0.14, 0) },     // knee ball
    { g: new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8), m: T(0, -0.2, 0) },
  ]);
  const bootGeo = mergeGeo([
    { g: new THREE.SphereGeometry(0.1, 10, 8), m: T(0, -0.28, 0.02, 1.1, 0.85, 1.25) },
    { g: new THREE.SphereGeometry(0.085, 10, 8), m: T(0, -0.32, 0.1, 1.05, 0.6, 1.35) },
    { g: new THREE.CylinderGeometry(0.105, 0.11, 0.04, 10), m: T(0, -0.345, 0.05, 1.1, 1, 1.5) },
  ]);
  const paperGeo = new THREE.BoxGeometry(0.26, 0.2, 0.06);
  const mPaperSide = mat(COL.paper, 0.9);
  const mPaperFront = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.9 });
  const paperMats = [mPaperSide, mPaperSide, mPaperSide, mPaperSide, mPaperFront, mPaperSide];

  // ---------- voxel dissolve burst (one InstancedMesh for all units) ----------
  const VOX_PER = 56;
  const voxGeo = new THREE.BoxGeometry(0.075, 0.075, 0.075);
  const voxMat = new THREE.MeshStandardMaterial({
    color: 0x0a1806, emissive: 0x2fe818, emissiveIntensity: 3.2,
    roughness: 0.4, transparent: true, opacity: 0.95,
  });
  let voxMesh = null, voxData = [];
  function ensureVox(n) {
    if (voxMesh) { grp.remove(voxMesh); voxMesh.dispose?.(); }
    voxMesh = new THREE.InstancedMesh(voxGeo, voxMat, n * VOX_PER);
    voxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    voxMesh.frustumCulled = false;
    voxData = new Array(n * VOX_PER).fill(null);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < voxMesh.count; i++) voxMesh.setMatrixAt(i, zero);
    grp.add(voxMesh);
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(),
    _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

  function igniteBurst(unitIdx, cx, cy) {
    for (let j = 0; j < VOX_PER; j++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.35;
      voxData[unitIdx * VOX_PER + j] = {
        x: cx + Math.cos(a) * r * 0.8, y: cy + 0.15 + Math.random() * 1.1, z: (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 2.4, vy: 0.6 + Math.random() * 2.6, vz: (Math.random() - 0.5) * 1.8,
        rx: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 10, wz: (Math.random() - 0.5) * 10,
        life: 0.55 + Math.random() * 0.35, age: 0,
      };
    }
  }
  function updateVox(dt) {
    if (!voxMesh) return;
    let any = false;
    for (let i = 0; i < voxData.length; i++) {
      const d = voxData[i]; if (!d) continue;
      d.age += dt;
      if (d.age >= d.life) {
        voxData[i] = null;
        voxMesh.setMatrixAt(i, _m4.makeScale(0, 0, 0)); any = true; continue;
      }
      d.vy -= 5.5 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += d.wx * dt; d.rz += d.wz * dt;
      const s = 1 - (d.age / d.life);
      _q.setFromEuler(_e.set(d.rx, 0, d.rz));
      _m4.compose(_v.set(d.x, d.y, d.z), _q, _s.set(s, s, s));
      voxMesh.setMatrixAt(i, _m4); any = true;
    }
    if (any) voxMesh.instanceMatrix.needsUpdate = true;
  }

  // scan sweep plane (green bar rising over the dying bot) — one shared, reused
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x66ff44, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  sweep.visible = false; grp.add(sweep);

  // ---------- unit assembly ----------
  let units = [];
  function buildUnit() {
    const root = new THREE.Group();
    const rig = new THREE.Group(); root.add(rig);   // scale/tip node

    const body = new THREE.Mesh(bodyGeo, mGreen);
    body.castShadow = true; rig.add(body);

    const headPiv = new THREE.Group(); headPiv.position.y = 1.02; rig.add(headPiv);
    const faceMat = makeFaceMat();
    const head = new THREE.Mesh(headGeo,
      [headMats[0], headMats[1], headMats[2], headMats[3], faceMat, headMats[5]]);
    head.castShadow = true; headPiv.add(head);
    const vents = new THREE.Mesh(ventGeo, mBrass); headPiv.add(vents);
    const beacon = new THREE.Mesh(beaconGeo, mBeacon.clone());
    beacon.position.y = 0.33; headPiv.add(beacon);
    const beaconBase = new THREE.Mesh(beaconBaseGeo, mBrass);
    beaconBase.position.y = 0.295; headPiv.add(beaconBase);
    const antenna = new THREE.Mesh(antennaGeo, mBrass);
    antenna.position.set(0.24, 0.28, -0.08); headPiv.add(antenna);

    const cables = new THREE.Mesh(cableGeo, mCable); rig.add(cables);
    const plug = new THREE.Mesh(plugGeo, mCable); rig.add(plug);

    const armL = new THREE.Group(); armL.position.set(-0.29, 0.64, 0); rig.add(armL);
    armL.add(new THREE.Mesh(armGeo, mGreenD));
    const armR = new THREE.Group(); armR.position.set(0.29, 0.64, 0); rig.add(armR);
    armR.add(new THREE.Mesh(armGeo, mGreenD));
    const papers = new THREE.Mesh(paperGeo, paperMats);
    papers.position.set(0.0, -0.22, 0.15); papers.rotation.set(-0.25, -0.85, 0.05);
    armR.add(papers);

    const legL = new THREE.Group(); legL.position.set(-0.15, 0.36, 0); rig.add(legL);
    const llm = new THREE.Mesh(legGeo, mGreenD); legL.add(llm);
    const lbt = new THREE.Mesh(bootGeo, mBoot); lbt.castShadow = true; legL.add(lbt);
    const legR = new THREE.Group(); legR.position.set(0.15, 0.36, 0); rig.add(legR);
    legR.add(new THREE.Mesh(legGeo, mGreenD));
    const rbt = new THREE.Mesh(bootGeo, mBoot); rbt.castShadow = true; legR.add(rbt);

    return { root, rig, headPiv, faceMat, beacon, armL, armR, legL, legR, papers,
      phase: Math.random() * 7, prevAlive: true, burstDone: false };
  }

  function build(list) {
    for (const u of units) grp.remove(u.root);
    units = list.map(() => { const u = buildUnit(); grp.add(u.root); return u; });
    ensureVox(list.length);
    sweep.visible = false;
  }
  build(enemies);

  let time = 0;
  return {
    reset(list) { build(list); },
    update(state, dt) {
      time += dt;
      let sweepUsed = false;
      for (let i = 0; i < units.length; i++) {
        const e = state.enemies[i], u = units[i];
        if (!e) { u.root.visible = false; continue; }
        if (!e.alive && e.dying <= 0) { u.root.visible = false; continue; }
        u.root.visible = true;
        const cx = U(e.x + e.w / 2), fy = Y(e.floorY);
        u.root.position.set(cx, fy, 0);
        // restore per-frame transforms
        u.rig.rotation.set(0, 0, 0); u.rig.scale.set(1, 1, 1); u.rig.position.set(0, 0, 0);
        u.headPiv.position.y = 1.02; u.headPiv.scale.set(1, 1, 1);

        if (e.alive) {
          u.prevAlive = true; u.burstDone = false;
          const face = e.dir > 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
          u.root.rotation.y += (face - u.root.rotation.y) * Math.min(1, dt * 8);
          // waddle walk
          u.phase += dt * 9;
          const s = Math.sin(u.phase), c = Math.cos(u.phase);
          u.rig.rotation.z = s * 0.085;                 // side-to-side rock
          u.rig.position.y = Math.abs(c) * 0.035;       // bob
          u.legL.rotation.x = s * 0.75; u.legR.rotation.x = -s * 0.75;
          u.armL.rotation.x = -s * 0.35; u.armL.rotation.z = 0.15;
          u.armR.rotation.x = 0.1 + c * 0.06; u.armR.rotation.z = -0.12;
          u.papers.rotation.z = 0.1 + s * 0.08;         // papers bobbing
          u.headPiv.rotation.z = -s * 0.05;
          // CRT flicker + beacon blink
          u.faceMat.emissiveIntensity = 1.15 + Math.sin(time * 24 + i * 2.1) * 0.12
            + (Math.random() < 0.02 ? 0.5 : 0);
          u.beacon.material.emissiveIntensity = (Math.sin(time * 5 + i) > 0.2) ? 1.6 : 0.25;
        } else if (e.deathBy === 'stomp') {
          // t: 0 -> 1 over the death
          const t = 1 - e.dying / 40;
          u.legL.rotation.x = u.legR.rotation.x = 0;
          u.armL.rotation.set(-1.2, 0, 0.6); u.armR.rotation.set(-1.2, 0, -0.6); // arms fly up
          if (t < 0.3) {              // crush: head telescopes into body
            const k = t / 0.3;
            u.headPiv.position.y = 1.02 - k * 0.52;
            u.headPiv.scale.set(1 + k * 0.15, 1 - k * 0.4, 1 + k * 0.15);
            u.rig.scale.set(1 + k * 0.22, 1 - k * 0.3, 1 + k * 0.22);
            u.faceMat.emissiveIntensity = 1.2 + k * 1.5;
          } else if (t < 0.5) {       // spring back overshoot
            const k = (t - 0.3) / 0.2, sp = Math.sin(k * Math.PI);
            u.headPiv.position.y = 0.5 + k * 0.35 + sp * 0.12;
            u.headPiv.scale.set(1.15 - k * 0.15, 0.6 + k * 0.35 + sp * 0.1, 1.15 - k * 0.15);
            u.rig.scale.set(1.22 - k * 0.22, 0.7 + k * 0.25, 1.22 - k * 0.22);
            u.faceMat.emissiveIntensity = 2.7 - k * 2.2;
          } else {                    // tip over, lights out
            const k = (t - 0.5) / 0.5, ke = k * k;
            u.headPiv.position.y = 0.85; u.headPiv.scale.set(1, 0.95, 1);
            u.rig.scale.set(1, 0.95, 1);
            u.rig.rotation.z = (e.dir > 0 ? -1 : 1) * ke * 1.45;
            u.rig.position.y = -ke * 0.12;
            u.faceMat.emissiveIntensity = Math.max(0, 0.5 - k);
            u.beacon.material.emissiveIntensity = 0;
          }
        } else { // 'scan' — digital dissolve
          const t = 1 - e.dying / 60;
          if (t < 0.32) {
            // glitch phase: jitter, slice-scale flicker, screen flare, sweep bar
            const jx = (Math.random() - 0.5) * 0.05, jy = (Math.random() - 0.5) * 0.03;
            u.rig.position.set(jx, jy, 0);
            const slice = Math.random() < 0.35 ? 0.75 + Math.random() * 0.2 : 1;
            u.rig.scale.set(1 + (1 - slice) * 1.5, slice, 1);
            u.faceMat.emissiveIntensity = 2.5 + Math.random() * 2.5;
            u.beacon.material.emissiveIntensity = 3;
            if (!sweepUsed) {
              sweepUsed = true; sweep.visible = true;
              sweep.position.set(cx, fy + (t / 0.32) * 1.55, 0.45);
              sweep.material.opacity = 0.85 - (t / 0.32) * 0.35;
            }
          } else {
            if (!u.burstDone) { u.burstDone = true; igniteBurst(i, cx, fy); }
            u.root.visible = false;
          }
        }
      }
      if (!sweepUsed) sweep.visible = false;
      updateVox(dt);
    },
  };
}
