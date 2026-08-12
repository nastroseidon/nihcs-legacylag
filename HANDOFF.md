# Handoff — Dr. Marion Wayne, achievements work

Written to carry this project into a fresh conversation. The next job is
**implementing the ten achievements that are written but not yet detected.**

The spec is `achievements-doc.md` in the repo root — 11 achievement types, 52
flavor variants, rules and emoji all decided. One of the eleven (Pogo) is built.
This file covers how the game is put together and what implementing the rest
will run into.

Everything here is verified against the repo, not recalled. Line numbers are from
`9317f87`; `achievements-doc.md` arrived in `0b6dc39`.

---

## 1. What this is

A browser platformer, *The Adventures of Dr. Marion Wayne and his Journey to the
Electronic Health Record* — a VA Northern Indiana training-adjacent game about
migrating from CPRS to Oracle Cerner. Seven levels: six numbered plus a bonus
"Legacy Labyrinth". Collect medallions, stomp or scan the Legacy Lag bots, avoid
spikes and pits.

Repo: `https://github.com/nastroseidon/nihcs-legacylag`
Live: `https://nicksmith.app/nihcs-legacylag/` (GitHub Pages; the
`nastroseidon.github.io` URL 301-redirects here). **The VA network blocks
nicksmith.app**, which is why the offline build exists.

---

## 2. Two builds — this matters

| File | What it is |
|---|---|
| `index.html` | **The source of truth.** 74 KB. Hosted build. Level 6 is a 2.5D ThreeJS stage in an iframe. Has high scores. |
| `FullHTML.html` | **Generated, never hand-edited.** 4.6 MB. Runs from `file://` with no server. Level 6 is an ordinary canvas level. No high scores. |

**Always edit `index.html`, then regenerate:**

```bash
./tools/build_fullhtml.sh && python3 tools/make_fullhtml.py
```

`build_fullhtml.sh` resizes art into `build/assets` (39 MB → 3.5 MB; gitignored).
`make_fullhtml.py` transforms `index.html` → `FullHTML.html`: strips the ThreeJS
level, reinstates the 2D Level 6, removes high scores, and inlines every image as
a data URI. Every replacement is asserted — if `index.html` changes shape the
build **fails loudly** rather than emitting a broken game. Expect to update
`make_fullhtml.py` when you touch anything it anchors on.

Achievements live in the shared part of `index.html`, so both builds get them
automatically. No `make_fullhtml.py` change should be needed for achievement work.

---

## 3. The achievement system as it stands

All of it is in `index.html`. Line numbers are from `9317f87`.

### The data — `HOP_ACHIEVEMENTS`, line 290

**12 entries, 15.1 KB of the file's 74 KB.** Every one has the same badge emoji
(🦘, written escaped as `'\uD83E\uDD98'`) and the same joke structure: a fake
retro sports championship retroactively awarded to the player, then an "Or..."
pivot to what they actually did.

Shape — exactly four fields, all strings:

```js
{ badge:'\uD83E\uDD98',
  title:'1978 Pogo Stick Champion of Lower Sheboygan, Wisconsin',
  body:'Congratulations!\n\n…\n\nOr...\n\nYou completed an entire level by hopping…',
  reward:'Eternal bragging rights, imaginary trophy, and…' }
```

Conventions worth preserving:
- `\n\n` separates paragraphs; `#achieveBody` is `white-space:pre-wrap`.
- Non-ASCII is escaped (`é`, `’`) rather than literal.
- `reward` renders under a dashed rule, auto-prefixed `REWARD: ` by CSS
  (`#achieveReward::before`). Don't repeat the word in the text.
- `badge` is what shows in the High Scores "Achievements" column, so it should
  stay short. Different achievement families should get different emoji.

### The machinery

```
line 330  usedAchievements[]     indices already awarded this run
line 331  earnedBadges[]         badges this run (feeds High Scores)
line 332  achievementsLeft()     usedAchievements.length < HOP_ACHIEVEMENTS.length
line 333  resetRun()             clears both + lives=3
line 746  showAchievement(next)  picks a random unused one, shows it, then runs next()
line 761  #achieveBtn handler    restores state, then fades to next()
```

`showAchievement` picks at random **from the unused pool**, so each achievement
fires at most once per run; when the pool empties it silently calls `next()` and
shows nothing. `resetRun()` refills the pool and is called on START from the menu,
level select, and the bonus button.

### The one and only trigger — Pogo

**"Hopped the whole level"** — never walked on the ground while not holding jump.
Tracked at line 905:

```js
if(player.onGround && Math.abs(player.vx)>0.1 && !kJ) player.walkedOnGround=true;
```

Reset per attempt in `loadLevel` (line 480). Checked on reaching the goal:

```js
const hopped = !player.walkedOnGround && achievementsLeft();
```

`hopped` is computed in **two** places, and both must stay in sync:

- **line 924** — inside `if(overlap(player,goal))`, covering every 2D level. One
  computation, then three outcome branches use it: levels 1–5 (927), Level 6
  (930), the Labyrinth (935).
- **line 547** — the postMessage handler for when the hosted 3D Level 6 reports
  back. Easy to miss, because it sits far from the other one.

### Screen DOM (line 179)

`#achieve` › `#achieveBox` › `#achieveHdr` (static "★ NEW ACHIEVEMENT UNLOCKED! ★"),
`#achieveTitle`, `#achieveBody`, `#achieveReward`, `#achieveBtn`.

---

## 4. What the next conversation needs to do

**`achievements-doc.md` in the repo root is the spec.** It was written after the
code and is authoritative: 11 achievement types, **52 flavor variants**, each with
an emoji, a rule, and implementation notes. Its opening table is the contract.

| Achievement | Emoji | Rule | Scope | Variants |
|---|---|---|---|---|
| Pogo | 🦘 | Clear a level hopping the whole way | per level | 12 — **built** |
| Pacifist | 🕊️ | Finish levels 1–6 stomping zero enemies | full run | 4 |
| No-Death Run | 💀 | Finish levels 1–6 with zero deaths | full run | 4 |
| Completionist | 💾 | Every medallion across all 6 levels | full run | 4 |
| Stomp Specialist | 👢 | Stomp every enemy across levels 1–6 | full run | 4 |
| Janitor | 🧹 | Every enemy **and** every medallion, levels 1–6 | full run | 4 |
| Speedrun | ⏱️ | Finish levels 1–6 under a target time | full run | 4 |
| Perfectionist | 💯 | 100% of a single level's medallions | per level | 4 |
| Minimalist | 🪶 | Finish a level with zero medallions | per level | 4 |
| Overtime Hero | 🌀 | Complete the bonus Labyrinth | one-off | 4 |
| Extensive UAT | 🧪 | Die 7+ times in a session (anti-achievement) | per run | 4 |

So the work is: **Pogo already works; the other ten need detection built.** The
texts exist — they need transcribing from Markdown into `HOP_ACHIEVEMENTS`-style
entries (probably renamed `ACHIEVEMENTS`) and wiring to real conditions.

### The three scopes need different bookkeeping

This is the main design decision, and the current code only supports one of them.

- **per level** (Pogo, Perfectionist, Minimalist) — evaluate at the goal. Closest
  to what exists. Note the doc says "once per session, **per level**", so a
  per-achievement `usedAchievements` index is not enough; these need keying by
  achievement *and* level.
- **full run, levels 1–6** (Pacifist, No-Death, Completionist, Stomp Specialist,
  Janitor, Speedrun) — evaluate when Level 6 is cleared, against totals
  accumulated since the run began. **These must only count when the player
  actually started at level 1.** `resetRun()` is currently also called by level
  select and the bonus button, so a run begun mid-game would otherwise qualify.
  Add a `runFromStart` flag set only on the menu START path.
- **per run / one-off** (Extensive UAT, Overtime Hero) — a death counter and a
  bonus-completion hook.

### Tracking that does not exist yet

Everything here needs adding; none of it is currently recorded:

| Needed for | Add |
|---|---|
| Pacifist, Stomp Specialist, Janitor | enemies stomped this run, and the total stompable across levels 1–6 |
| No-Death, Extensive UAT | death counter (increment in `hitPlayer`) |
| Completionist, Janitor | medallions collected per level, summed across the run |
| Perfectionist, Minimalist | medallions collected in the current level (`score - levelStartScore`, already derivable) |
| Speedrun | a run-start timestamp — see the `tick` warning below |
| Overtime Hero | fires on the Labyrinth goal (line 935 branch) |
| all full-run ones | `runFromStart` flag |

The doc notes the **Speedrun target time is still undecided** and needs a clean
timed run to establish. That is a judgement call for the user, not something to
invent.

Also worth deciding early: **can two achievements fire from one goal touch?**
Janitor by definition also satisfies Completionist and Stomp Specialist, and the
doc says it "also grants" them. `showAchievement(next)` shows exactly one screen
and then continues, so showing several means chaining it — feasible, since `next`
is already a continuation, but it needs designing rather than falling out.

### Suggested shape

Give each entry an `id`, a `scope`, and a predicate over a facts object:

```js
{ id:'pacifist', scope:'run', badge:'\uD83D\uDD4A',
  when:f => f.fromStart && f.level===5 && f.stomps===0,
  title:…, body:…, reward:… }
```

Then one evaluator replaces both `hopped` computations (see §3), building the
facts object once and asking which achievements match.

---

## 5. Testing

`window.__dmw` exists in both builds (no UI, no effect on play):

```js
__dmw.jumpTo(n)   // load level n (0-6)
__dmw.toGoal()    // teleport onto the goal — also triggers the hop achievement,
                  //   since teleporting means never walking
__dmw.kill(n)     // lose n lives
__dmw.player / .enemies / .coins / .state / .lives / .score
__dmw.key(k,v)    // set an input: 'left','right','jump','scan'
```

Serve locally (needed for `index.html`; `FullHTML.html` also opens directly):

```bash
python3 -m http.server 8642
```

Admin keys: **Shift+P** level select, **Shift+L** infinite lives.

### Checks worth running after achievement changes

```js
// each hop-clear gives a DIFFERENT achievement, pool exhausts, new run refills
for (let i=0;i<3;i++){ __dmw.jumpTo(i); __dmw.toGoal();
  /* read #achieveTitle, click #achieveBtn */ }
```

Also verify: dismissing the screen returns to the right screen (see gotcha 2), and
all seven levels still complete —
`0:leveldone 1:leveldone 2:leveldone 3:leveldone 4:leveldone 5:victory 6:won`.

---

## 6. Gotchas that already cost time here

1. **Test screen visibility, not just state.** "Try Again does nothing" was
   actually the level restarting correctly *underneath* a game-over screen that
   `loadLevel` never hid. Game state was right; only the DOM was wrong. Assert
   `classList.contains('hidden')` alongside state.

2. **`showAchievement` must restore `state`.** It sets `state='achieve'` and the
   dismiss handler puts back `stateBeforeAchieve`. Without that the level-complete
   button dies, because `overlayAction()` matches on `state`. If you add
   achievement paths, keep this.

3. **`loadLevel` calls `hideAllScreens()`** rather than naming screens. Keep it
   that way — the old per-screen list is exactly what broke Try Again.

4. **`fadeTo` chains rather than drops.** A second `fadeTo` during a fade appends
   its callback instead of being ignored. Achievement → victory relies on this.

5. **The preview pane throttles `requestAnimationFrame`** and caches ES modules
   hard. Things look frozen or stale when they are fine. Test `FullHTML.html` from
   `file://` and use real waits, not tight polling loops that fight the physics.

6. **Regenerate `FullHTML.html` after every `index.html` change,** and confirm
   `make_fullhtml.py` still reports its full edit count (33 at `9317f87`).

---

## 7. Repo state at handoff

Clean, pushed, live. Recent history:

```
a5812d8 Add HANDOFF.md for continuing achievement work in a new conversation
0b6dc39 Normalize achievement reference format
235d4d6 Complete remaining achievement flavor text
b936f22 Add Stomp Specialist achievement flavor variants
535ce85 Add Completionist achievement flavor variants
6badc68 Add No-Death Run achievement flavor variants
```

Files that matter for this work:
- `achievements-doc.md` — **the spec. Read this first.**
- `index.html` — the game; edit here
- `tools/` — the two build scripts that produce `FullHTML.html`

Present but not involved:
- `golive3d/` — the ThreeJS Level 6 used by the hosted build
- `leaderboard/` — an undeployed Cloudflare Worker for a shared score board;
  `LEADERBOARD_URL` in `index.html` is empty, so it is inert
- `scores.json` — empty array; the optional committed high-score board
