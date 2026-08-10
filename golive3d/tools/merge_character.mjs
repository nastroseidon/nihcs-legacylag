// Merge the nine per-clip Dr. Marion Wayne GLBs into a single wayne.glb.
//
// All nine exports share an identical skeleton (24 joints), mesh (char1, 19.6k
// tris) and 2048px texture — only the animation differs. Shipping all nine
// means downloading the same 6 MB mesh nine times, so we keep Idle.glb whole as
// the base and graft only the animation data from the other eight onto it.
//
// Channels are re-targeted by NODE NAME, so this stays correct even if the
// exporter ordered nodes differently between files.
//
//   node golive3d/tools/merge_character.mjs
import fs from 'fs';
import path from 'path';

const ASSETS = path.resolve(import.meta.dirname, '../assets');
const OUT = path.join(ASSETS, 'wayne.glb');
const BASE = 'Idle';
const CLIPS = ['Idle', 'Run', 'Jump', 'Fall', 'Land', 'Scan', 'Hurt', 'Victory', 'Death'];

const JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

function readGLB(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const body = b.subarray(off + 8, off + 8 + len);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
    else if (type === BIN_CHUNK) bin = body;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`${file} missing a chunk`);
  return { json, bin };
}

const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM_COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const base = readGLB(path.join(ASSETS, `${BASE}.glb`));
const outJson = base.json;
const chunks = [base.bin];          // BIN pieces, concatenated at the end
let binLen = base.bin.length;

// node name -> index, for retargeting channels onto the base skeleton
const baseNodeByName = new Map();
outJson.nodes.forEach((n, i) => { if (n.name) baseNodeByName.set(n.name, i); });

// Copy one accessor (and the bytes it references) from `src` into the base.
// Animation accessors are tightly packed, so an exact byte-range copy is safe.
function graftAccessor(src, accIndex) {
  const a = src.json.accessors[accIndex];
  const bv = src.json.bufferViews[a.bufferView];
  if (bv.byteStride) throw new Error('interleaved animation accessor is unsupported');
  const width = COMP_SIZE[a.componentType] * NUM_COMP[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const bytes = src.bin.subarray(start, start + a.count * width);

  while (binLen % 4 !== 0) { chunks.push(Buffer.alloc(1)); binLen++; }   // 4-byte align
  const byteOffset = binLen;
  chunks.push(Buffer.from(bytes));
  binLen += bytes.length;

  outJson.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
  outJson.accessors.push({
    bufferView: outJson.bufferViews.length - 1,
    componentType: a.componentType, count: a.count, type: a.type,
    ...(a.min ? { min: a.min } : {}), ...(a.max ? { max: a.max } : {}),
  });
  return outJson.accessors.length - 1;
}

// outJson IS base.json, so stash the base clip before we reset the array
const baseAnim = outJson.animations?.[0];
outJson.animations = [];
const report = [];

for (const clip of CLIPS) {
  const src = clip === BASE ? base : readGLB(path.join(ASSETS, `${clip}.glb`));
  const anim = clip === BASE ? baseAnim : src.json.animations?.[0];
  if (!anim) throw new Error(`${clip}.glb has no animation`);

  const samplers = anim.samplers.map(s => ({
    input: graftAccessor(src, s.input),
    output: graftAccessor(src, s.output),
    interpolation: s.interpolation || 'LINEAR',
  }));

  const channels = [];
  let dropped = 0;
  for (const ch of anim.channels) {
    const name = src.json.nodes[ch.target.node]?.name;
    const target = baseNodeByName.get(name);
    if (target === undefined) { dropped++; continue; }
    channels.push({ sampler: ch.sampler, target: { node: target, path: ch.target.path } });
  }

  outJson.animations.push({ name: clip, samplers, channels });

  let dur = 0;
  for (const s of samplers) dur = Math.max(dur, outJson.accessors[s.input].max?.[0] ?? 0);
  report.push({ clip, source: anim.name, channels: channels.length, dropped, sec: +dur.toFixed(2) });
}

// single buffer, single BIN chunk
const bin = Buffer.concat(chunks);
outJson.buffers = [{ byteLength: bin.length }];

const jsonBuf = Buffer.from(JSON.stringify(outJson), 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const binPad = (4 - (bin.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(JSON_CHUNK, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binChunk.length, 0); bh.writeUInt32LE(BIN_CHUNK, 4);

fs.writeFileSync(OUT, Buffer.concat([header, jh, jsonChunk, bh, binChunk]));

const before = CLIPS.reduce((t, c) => t + fs.statSync(path.join(ASSETS, `${c}.glb`)).size, 0);
console.table(report);
console.log(`\nwrote ${OUT}`);
console.log(`${(before / 1048576).toFixed(1)} MB across ${CLIPS.length} files -> ` +
  `${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
