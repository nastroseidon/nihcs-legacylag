// Shared leaderboard for "The Adventures of Dr. Marion Wayne".
//
// The game is a static site, so it has nowhere to write. This Worker is that
// place: GET returns the board, POST adds one run to it. The whole board lives
// in a single KV key as a JSON array — at this scale that is simpler and
// cheaper than a key per entry, and it keeps reads to one lookup.
//
// Deploy notes are in README.md.

const KEY = 'board';
const MAX_ENTRIES = 200;   // how many runs the board remembers
const MAX_NAME = 14;       // matches the name field in the game
// Medallions plus the achievement bonus. A maximum run — every medallion, the
// bonus level, and every achievement that can co-exist — lands near 320. This
// ceiling only blocks nonsense.
const MAX_SCORE = 1000;
const MAX_BADGES = 12;     // one per achievement

// Only the places the game is actually served from.
const ALLOWED_ORIGINS = [
  'https://nicksmith.app',
  'https://nastroseidon.github.io',
  'http://localhost:8642',
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function readBoard(env) {
  try {
    const raw = await env.SCORES.get(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];   // a corrupt value should not take the leaderboard down
  }
}

// Anything arriving from a browser is untrusted, so build a clean record rather
// than storing what was sent.
function sanitize(body) {
  if (!body || typeof body !== 'object') return null;

  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return null;

  const name = String(body.name ?? '')
    .replace(/[\u0000-\u001F<>]/g, '')   // control chars and angle brackets
    .trim()
    .slice(0, MAX_NAME) || 'Anonymous';

  const badges = Array.isArray(body.badges)
    ? body.badges.filter(b => typeof b === 'string' && b.length <= 4).slice(0, MAX_BADGES)
    : [];

  return { name, score: Math.round(score), badges, date: new Date().toISOString().slice(0, 10) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method === 'GET') {
      return json(await readBoard(env), origin);
    }

    if (request.method === 'POST') {
      if (!env.SCORES) return json({ error: 'KV namespace not bound' }, origin, 500);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'malformed JSON' }, origin, 400);
      }

      const entry = sanitize(body);
      if (!entry) return json({ error: 'name and a plausible score are required' }, origin, 400);

      // Read-modify-write. Two saves in the same instant could drop one; with a
      // handful of players a day that is not worth a Durable Object to avoid.
      const board = await readBoard(env);
      board.push(entry);
      board.sort((a, b) => b.score - a.score);
      const trimmed = board.slice(0, MAX_ENTRIES);
      await env.SCORES.put(KEY, JSON.stringify(trimmed));

      return json({ ok: true, rank: trimmed.indexOf(entry) + 1, board: trimmed }, origin);
    }

    return json({ error: 'method not allowed' }, origin, 405);
  },
};
