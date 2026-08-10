// CONTRACT (character specialist owns this module):
//   export async function createPlayerVisual(scene) ->
//     { group: THREE.Group, update(state, dt) }
// Reads state.player (2D px coords; convert with U()/Y()) and state.player.anim
// in {'idle','run','jump','fall','scan'} plus face (+1/-1).
//
// Implementation: skinned GLB (assets/wayne.glb — one 24-joint skeleton, nine
// clips merged by tools/merge_character.mjs) driven through an AnimationMixer
// with crossfades. The source clips are full-body mocap-style takes, so on load
// we (a) strip root motion — the engine owns position — and (b) trim each clip
// to the window that actually reads as the game action.
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { U, Y } from './leveldata.js';

const MODEL = 'assets/wayne.glb';
const TARGET_HEIGHT = 1.62;      // world units, feet at group origin
const FACE_TURN = 0.34;          // radians turned toward camera off pure profile

// Per-clip authoring notes, tuned by scrubbing the source takes in
// test_wayne.html (see `sheet()` there).
//   from  — source take to cut from, when it differs from the clip name
//   trim  — [startSec, endSec] window of that take; null keeps all of it
//   y     — vertical root-motion policy, see stripRootMotion below
//
// Land is cut from the tail of the Jump take on purpose: the shipped Land take
// is a dive that falls ten units before touching down, which is unusable when
// the engine owns the character's height.
const CLIPS = {
  Idle:    { loop: true,  trim: null,         y: 'keep' },
  Run:     { loop: true,  trim: null,         y: 'keep' },
  Jump:    { loop: false, trim: [0.28, 0.95], y: 'pin'  },
  Fall:    { loop: true,  trim: null,         y: 'keep' },
  Land:    { loop: false, trim: [1.35, 1.95], y: 'base', from: 'Jump' },
  Scan:    { loop: false, trim: [2.50, 3.40], y: 'keep' },
  Hurt:    { loop: false, trim: [0.00, 0.70], y: 'base' },
  Victory: { loop: true,  trim: [0.60, 4.20], y: 'keep' },
  Death:   { loop: false, trim: [0.00, 2.40], y: 'base' },
};

const ROOT_TRACK = /^(Hips|Armature|Root)\.position$/i;

// The engine owns the character's position, so lateral root travel always has
// to go — otherwise he slides out of his own collision box. Vertical is a
// judgement call per clip:
//   keep — leave it alone (natural bob of idle/run/fall)
//   pin  — hold at standing height (the jump's leap; the engine already lifts him)
//   base — shift so the clip starts at standing height but keeps its own
//          relative motion (landing dip, knockdown fall)
function stripRootMotion(clip, mode, standingY) {
  for (const track of clip.tracks) {
    if (!ROOT_TRACK.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0], y0 = v[1], z0 = v[2];
    const shift = standingY - y0;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
      if (mode === 'pin') v[i + 1] = standingY;
      else if (mode === 'base') v[i + 1] += shift;
    }
  }
  return clip;
}

// Standing hip height, read off the Idle take so it tracks the actual rig.
function standingHipY(clips) {
  const idle = clips.find(c => c.name === 'Idle');
  const track = idle?.tracks.find(t => ROOT_TRACK.test(t.name));
  return track ? track.values[1] : 0;
}

function trimClip(clip, name, range) {
  if (!range || globalThis.__NO_TRIM) return clip;   // __NO_TRIM: tuning in test_wayne.html
  const [a, b] = range;
  if (b <= a || a >= clip.duration) return clip;
  const sub = THREE.AnimationUtils.subclip(clip, name, Math.round(a * 30), Math.round(Math.min(b, clip.duration) * 30), 30);
  // subclip keeps the source duration on some three builds; recompute it
  sub.resetDuration();
  return sub;
}

// Handheld barcode scanner — black pistol-grip body, blue trigger, dark read
// window with a red emitter. Parented to the right hand bone.
function buildScanner() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.45, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.35, emissive: 0x11406e, emissiveIntensity: 0.6 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.13), shell);
  head.position.set(0, 0.055, 0.055);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.045, 12), shell);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.055, 0.135);
  const window_ = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), dark);
  window_.position.set(0, 0.055, 0.158);
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3322 }));
  emitter.position.set(0, 0.055, 0.16);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.06), shell);
  grip.position.set(0, -0.02, 0.01); grip.rotation.x = -0.16;
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.038, 0.016), blue);
  trigger.position.set(0, 0.012, 0.048);

  g.add(head, snout, window_, emitter, grip, trigger);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, emitter };
}

export async function createPlayerVisual(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const gltf = await new GLTFLoader().loadAsync(MODEL);
  const model = gltf.scene;

  // The export ships emissiveFactor [1,1,1] with the albedo as an emissive map,
  // which renders the character fullbright and flat. Drop it so he actually
  // takes the level's golden-hour light and casts/receives shadow.
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;             // skinned bounds go stale mid-clip
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.emissive = new THREE.Color(0x000000);
      m.emissiveMap = null;
      m.emissiveIntensity = 0;
      m.metalness = 0;
      m.roughness = 0.72;
      if (m.specularColor) m.specularColor.setScalar(1);
      m.side = THREE.FrontSide;
      m.needsUpdate = true;
    }
  });

  // Normalize height and seat the feet at the group origin.
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const scale = height > 0 ? TARGET_HEIGHT / height : 1;
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  group.add(model);

  // Bones we hang props off.
  let rightHand = null, headBone = null;
  model.traverse(o => {
    if (!o.isBone) return;
    if (o.name === 'RightHand') rightHand = o;
    if (o.name === 'Head') headBone = o;
  });

  const scanner = buildScanner();
  if (rightHand) {
    // Bones live in centimetre space under an 0.01-scaled armature, so undo
    // that scale (and trim it a little — the authored prop reads chunky on a
    // 1.6-unit character) to sit the scanner in his grip.
    const s = 0.62 / 0.01;
    scanner.group.scale.setScalar(s);
    scanner.group.position.set(0, 0.01 * s, 0.02 * s);
    scanner.group.rotation.set(-Math.PI / 2, 0, 0);
    rightHand.add(scanner.group);
  } else {
    scanner.group.position.set(0.35, 1.0, 0.12);
    group.add(scanner.group);
  }

  // ---- animation ----
  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(gltf.animations.map(c => [c.name, c]));
  const standingY = standingHipY(gltf.animations);
  const actions = {};
  for (const [name, cfg] of Object.entries(CLIPS)) {
    const src = byName.get(cfg.from || name);
    if (!src) { console.warn(`[wayne] missing source take for ${name}`); continue; }
    let clip = trimClip(src.clone(), name, cfg.trim);
    clip.name = name;
    clip = stripRootMotion(clip, cfg.y, standingY);
    const a = mixer.clipAction(clip);
    a.setLoop(cfg.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !cfg.loop;
    actions[name] = a;
  }

  const FROM_STATE = { idle: 'Idle', run: 'Run', jump: 'Jump', fall: 'Fall', scan: 'Scan' };
  let current = null;

  function play(name, fade = 0.14, restart = false) {
    const next = actions[name];
    if (!next || (current === next && !restart)) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (current && current !== next) next.crossFadeFrom(current, fade, false);
    next.play();
    current = next;
  }
  play('Idle', 0);

  // One-shots that outrank the locomotion state until they finish.
  let overlay = null, overlayUntil = 0, clock = 0;
  function fire(name, seconds, fade = 0.1) {
    if (!actions[name]) return;
    play(name, fade, true);
    overlay = name;
    overlayUntil = clock + seconds;
  }

  let prevLives = null, prevOnGround = true, prevStatus = 'playing';

  return {
    group,
    // exposed so main.js can aim the scan beam from the muzzle
    scannerEmitter: scanner.emitter,
    update(state, dt) {
      clock += dt;
      const p = state.player;

      group.position.set(U(p.x + p.w / 2), Y(p.y + p.h), 0);

      const target = p.face > 0 ? Math.PI / 2 - FACE_TURN : -Math.PI / 2 + FACE_TURN;
      let d = target - group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      group.rotation.y += d * Math.min(1, dt * 14);

      group.visible = !(p.invuln > 0 && Math.floor(state.tick / 5) % 2 === 0);

      // event-driven one-shots
      if (prevLives !== null && state.lives < prevLives) fire('Hurt', 0.6);
      prevLives = state.lives;
      if (state.status !== prevStatus) {
        if (state.status === 'won') fire('Victory', 999, 0.25);
        else if (state.status === 'gameover') fire('Death', 999, 0.2);
        prevStatus = state.status;
      }
      if (!prevOnGround && p.onGround && state.status === 'playing') fire('Land', 0.3);
      prevOnGround = p.onGround;

      if (overlay && clock >= overlayUntil) overlay = null;
      if (!overlay) play(FROM_STATE[p.anim] || 'Idle');

      mixer.update(dt);
    },
    // live-tuning hook: window.__char.trim('Scan', 1.2, 2.1) etc.
    _debug: { actions, mixer, play, fire, CLIPS },
  };
}
