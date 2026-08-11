# Shared leaderboard

A Cloudflare Worker that holds the high-score board, because the game itself is
a static site and has nowhere to write.

- `GET /` returns the board as a JSON array
- `POST /` with `{ "name": "...", "score": 42, "badges": ["🦘"] }` adds one run

The board lives in a single KV key. It keeps the top 200 runs, sorted by score.

## Deploy

Run these from this directory. You need a Cloudflare account; the free plan is
enough (100k requests/day, 1k KV writes/day — a saved score is one write).

```bash
npx wrangler login
npx wrangler kv namespace create SCORES
```

The second command prints an `id`. Put it in `wrangler.toml` in place of
`PASTE_KV_NAMESPACE_ID_HERE`, then:

```bash
npx wrangler deploy
```

Wrangler prints the URL, something like
`https://legacylag-leaderboard.<your-subdomain>.workers.dev`.

Set that URL as `LEADERBOARD_URL` near the top of the high-score section in
`../index.html`. Until it is set, the game falls back to `scores.json` plus
whatever this browser has in localStorage, so it keeps working either way.

## Check it

```bash
curl -s https://YOUR-WORKER-URL/
curl -s -X POST https://YOUR-WORKER-URL/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","score":5,"badges":[]}'
```

## Editing the board

There is no admin UI. To remove an entry or reset the board:

```bash
# see what is stored
npx wrangler kv key get board --binding SCORES --remote

# overwrite it (an empty board)
npx wrangler kv key put board '[]' --binding SCORES --remote
```

## What this does and does not protect against

Requests are only accepted from the origins listed in `ALLOWED_ORIGINS` in
`worker.js`, names are stripped of control characters and angle brackets, and
scores above `MAX_SCORE` are rejected. That stops accidents and casual junk.

It does **not** stop someone who opens devtools from posting a score they did
not earn — there is no login, so the Worker cannot tell a real run from a
crafted request. That is inherent to any leaderboard without accounts. If a
fake entry shows up, delete it with the `kv key put` command above.
