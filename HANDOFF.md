# Handoff — character selection

Written to carry this project into a fresh conversation. **The next job is
finishing character selection.** The mechanics are already built and working;
what is missing is the art and the words. This file covers how the game is put
together, exactly what has been done, and exactly what is left.

Everything here is verified against the repo, not recalled. Line numbers are
from `ddecda5`.

---

## 1. What this is

A browser platformer, *The Adventures of Dr. Marion Wayne and his Journey to the
Electronic Health Record* — a VA Northern Indiana training-adjacent game about
migrating from CPRS to Oracle Cerner. Seven levels: six numbered plus a bonus
"Legacy Labyrinth". Collect medallions, stomp or scan the Legacy Lag bots, avoid
spikes and pits, earn achievements.

Repo: `https://github.com/nastroseidon/nihcs-legacylag`
Live: `https://nicksmith.app/nihcs-legacylag/`

---

## 2. Two builds, and which is for whom

| File | What it is |
|---|---|
| `index.html` | **The source of truth.** ~180 KB. The hosted build, external to the VA, for the author and a few people he shares it with. Level 6 is a 2.5D ThreeJS stage in an iframe. Has high scores. |
| `FullHTML.html` | **Generated, never hand-edited.** 4.7 MB. The VA build. Runs from `file://` with nothing beside it. Level 6 is an ordinary canvas level. No leaderboard, no network calls of any kind. |

**Always edit `index.html`, then regenerate:**

```bash
./tools/build_fullhtml.sh && python3 tools/make_fullhtml.py
```

`build_fullhtml.sh` resizes art into `build/assets` (gitignored). `make_fullhtml.py`
transforms `index.html` → `FullHTML.html`: strips the ThreeJS level, reinstates
the 2D Level 6, removes the leaderboard, and inlines every image as a data URI.
**Every replacement is asserted** — if `index.html` changes shape the build fails
loudly rather than emitting a broken game. It currently applies **37 edits**.
Expect to update it whenever you touch anything it anchors on; it matches on
literal strings including CSS.

The VA build must never gain a network call. It has none today: no `fetch`, no
`XMLHttpRequest`, no absolute URLs, every asset a `data:` URI.

---

## 3. Character selection — what is already built

All of it is in `index.html`, in the part shared by both builds.

### The data — line 543

```js
const CHARACTERS=[
 { id:'wayne', name:'Dr. Marion Wayne', sprite:'',
   blurb:'The man himself. Clipboard in hand, migration in progress, optimism intact.' },
];
```

`sprite:''` means the original `player_*.png` set. Any other character uses its
own prefix, so `sprite:'nurse'` looks for `nurse_idle`, `nurse_walk1`,
`nurse_walk2`, `nurse_jump`.

**With one entry the select screen is skipped entirely** — `chooseCharacter`
returns immediately and the game behaves exactly as it always has. That is why
this could be built and shipped before the art exists.

### The machinery

```
line  543  CHARACTERS            the roster
line  547  CHAR_POSES            ['idle','walk1','walk2','jump']
line  548  charId                remembered in localStorage as 'dmw_char'
line  549  character(id)         look-up, falls back to the first entry
line  553  setCharacter(id)      set and persist
line  559  poseKey(pose)         which loaded image to DRAW; falls back to Dr.
                                 Wayne if a character's art is missing, so a
                                 half-added character can never leave the hero
                                 invisible
line  564  poseSrc(c,pose)       the src for an <img>; works in both builds
                                 because `files` holds a filename in index.html
                                 and a data URI in FullHTML.html
line 1965  buildCharGrid(excl)   fills the card grid
line 1981  showCharDetail(c)     portrait + name + blurb + "Let's Go!"
line 1996  chooseCharacter(next,mode)   the screen; mode 'continue' for the
                                 level-select route
line 2015  startWithCharacter(id)       commits and runs `next`
```

The screen markup is `#chars` at line 455.

### The two ways in

- **START on the main menu** → `chooseCharacter(fn)` → heading "Choose your
  character", every character as a card, no continue panel. Pick one → blurb →
  **Let's Go!** → level 1.
- **A level-select chip** (only shown once Go Live has been beaten) →
  `chooseCharacter(fn,'continue')` → heading "Who is playing?", the last-used
  character on the left under "CONTINUE AS" with a Continue button, the others
  on the right under "OR PICK ANOTHER".

`hideAllScreens()` tears the screen down, and the keydown handler ignores
everything except ESC while it is open.

### Verified working

With a second entry spliced in temporarily, the whole flow was exercised
headlessly: both headings, the card grid, the continue panel excluding the
current character, the blurb, Back, Let's Go!, and the choice persisting into
the next run.

---

## 4. What is left — the art and the words

**Four PNGs per character**, transparent background:

| File | Pose |
|---|---|
| `<prefix>_idle.png` | standing still, facing right |
| `<prefix>_walk1.png` | walk pose A |
| `<prefix>_walk2.png` | walk pose B |
| `<prefix>_jump.png` | airborne |

- **384 × 576 px**, matching the existing `player_*.png`, facing **right** (the
  game mirrors for left).
- Feet at the bottom of the frame, body horizontally centred, or characters sit
  at different heights. Drawn into a 74 × 82 box with a 14px bleed each side, so
  some hat and boot overhang is expected.
- Repo root, alongside the current set.
- **The idle pose is the selection portrait.**

**Per character, also needed:** a display name and a blurb. The blurb appears
after the player picks them, above the Let's Go! button.

### Adding one is three edits and a drop of files

1. Drop the four PNGs in the repo root.
2. Add an entry to `CHARACTERS` (line 543).
3. Register the art in **both** build files, or the offline build will not have it:
   - `tools/build_fullhtml.sh` line 32 — add the four names to the `for f in
     player_idle player_jump player_walk1 player_walk2` loop.
   - `tools/make_fullhtml.py` `KEYS` (line ~296) — add
     `'nurse_idle': 'nurse_idle'` and the other three.
4. Add them to the `files={...}` map in `index.html` (line 516) so the hosted
   build loads them.

Then rebuild and check the select screen shows the new card.

### Two things decided already

- **Every word of the game's writing stays Dr. Marion Wayne.** The name appears
  65 times inside achievement flavour text alone. Characters are him in
  different guises; their own names appear on the select screen and nowhere
  else.
- **Level 6 in the hosted build will not follow.** It is the 2.5D stage and uses
  a rigged model (`golive3d/assets/wayne.glb` plus nine animation files, 63 MB).
  A new character there means a new rigged model. Selection applies to the 2D
  game — all of `FullHTML.html`, and levels 1–5 plus the Labyrinth in the hosted
  build.

### Size, which matters for the VA build

`FullHTML.html` embeds every image as base64 and cannot know which character
will be picked, so all of them ship. **Each character adds about 314 KB.** Two
takes it from 4.7 MB to 5.3 MB; five takes it to 6.2 MB. If that is a problem,
the sprites are built at 288px but only drawn at 74px wide — dropping to 160px
in `build_fullhtml.sh` would roughly halve the cost with nothing visible lost.

---

## 5. Testing — read this before trying to test in a browser

**The preview pane suspends `requestAnimationFrame`.** The game cannot be played
there at all; the loop never runs, fades never finish, and nothing progresses.
Screenshots of static DOM work fine, gameplay does not.

Use `tools/testharness.mjs`, which runs the real game script against a stub DOM
in Node. Everything is synchronous, so there is no flakiness and no waiting:

```js
import {dmw, pump, elem, startRun, toGoal, drainAchievements} from './tools/testharness.mjs';
pump(5);
startRun();            // click START
toGoal();              // teleport onto the goal: also a hop-clear, since teleporting never walks
console.log(drainAchievements());
```

- `pump(n)` runs n frames. `elem(id)` returns the stub for that element, with
  `.fire('click')`, `.hidden`, `.textContent`, `.children`, `.find(pred)`.
- `GAME_FILE=index.html node yourtest.mjs` tests the hosted build instead.
- `buttons[n]` are the level-select chips; `fireMessage(data)` delivers a
  postMessage from the embedded 3D Level 6.
- The stub is deliberately thin. When something new touches an unimplemented DOM
  API the harness throws — that is a gap in the stub, not a bug in the game.
  Several were added this way (`setAttribute`, `getBoundingClientRect`,
  `className`, `style.setProperty`).

`window.__dmw` also exists in both builds: `jumpTo(n)`, `toGoal()`, `kill(n)`,
`key(k,v)`, and getters for `state`, `lives`, `score`, `keys`, `run`, `earned`,
`earnedRows`, `sound`, `player`, `enemies`, `coins`.

Admin keys: **Shift+P** level select, **Shift+L** infinite lives, **M** mute.

### Checks worth running after any change

```bash
node -e "import('./tools/testharness.mjs').then(async h=>{
  h.pump(5);
  for (let i=0;i<7;i++){ h.buttons[i].fire('click'); h.pump(2);
    h.elem('charGo').fire('click');
    h.pump(60); h.toGoal(); h.drainAchievements();
    console.log(i+':'+h.dmw().state); }})"
```

The `charGo` click is the character carousel, which now stands between a
level-select chip and the level. `h.keydown(code)`, `h.keyup(code)` and
`h.press(code)` drive it from the keyboard.

Expect `0:leveldone 1:leveldone 2:leveldone 3:leveldone 4:leveldone 5:victory
6:victory`.

---

## 6. Gotchas that have already cost time

1. **Test screen visibility, not just state.** "Try Again does nothing" was the
   level restarting correctly *underneath* a game-over screen nothing hid.
   Assert `classList.contains('hidden')` alongside state.

2. **`make_fullhtml.py` matches on literal CSS.** A sweeping change to the
   stylesheet will break its patterns. It fails loudly, which is right, but
   budget for updating it in the same pass.

3. **Screens size themselves off the stage, not the window.** `--vw` and `--vh`
   are one per cent of `#stage`, kept in step by a ResizeObserver. Use them for
   anything inside the stage. Viewport units there will look enormous on a
   phone, because the stage is a small letterboxed box inside a much bigger
   viewport. The stage's own width and the touch band are the exceptions and
   stay on `dvh`.

4. **No screen may scroll.** Everything must fit its stage. This was got wrong
   once and looked awful.

5. **Touch input is derived, not accumulated.** Every touch event recomputes
   which pads are held from `event.touches`. Do not go back to per-button
   listeners toggling a key — that is what made the controls sticky.

6. **Achievements: earned, announced and scored are three different things.**
   `earned[id@level]` gates a win, `announced[id]` gates the popup (once a
   game), and `earnedList` rows carry a `count` that the score multiplies by.
   Changing one does not change the others.

7. **Regenerate `FullHTML.html` after every `index.html` change** and confirm
   the edit count. Commit both together.

---

## 7. Repo state at handoff

Clean, pushed, live. `main` is linear.

```
ddecda5 Pogo and Minimalist pay per level
2f27e87 Leaderboard: use the real maximum score
3fd4bc0 Level 6: reposition six medallions so each one is earned
7a3d3e9 Derive touch state from the live touch list
4f2e8cf Scale the screens to the stage, not the window; drop the scanner hint
1da474d Bigger touch buttons, and input that survives a second finger
d38fe94 Fit the stage to the screen on mobile, and add a full-screen button
```

Files that matter for this work:
- `index.html` — the game; edit here
- `tools/make_fullhtml.py`, `tools/build_fullhtml.sh` — the build
- `tools/testharness.mjs` — headless testing
- `achievements-doc.md` — the achievement spec, fully implemented

Present but not involved:
- `golive3d/` — the ThreeJS Level 6 for the hosted build
- `leaderboard/` — an undeployed Cloudflare Worker; `LEADERBOARD_URL` in
  `index.html` is empty, so it is inert. **Tabled** — the author has no
  Cloudflare account, and the VA build must never have a leaderboard.
- `End Screen Cleanup.dc.html`, `HANDOFF-endscreen.md`, `github.md`,
  `support.js` — artefacts of an earlier Claude Design pass, already applied
- Untracked and local only: `Repository UI cleanup request/`, `tools1/`

### Numbers worth knowing

- Maximum score in a run: **424** — 154 collected (74 medallions and 26 bots
  across levels 1–6, 35 and 19 in the Labyrinth) plus 270 in achievements. The
  last 75 is **Avengers… Assemble!**, which needs Levels 1–6 finished with all
  eight characters in one session; before that the ceiling is 349. Once earned
  it pays 75 on every later run in the session, so a run's total is not
  comparable with one from a session that has not assembled the roster.
- **29 of the Labyrinth's 64 medallions are unreachable by design.** Verified
  with a physics search; do not "fix" them.
- Pogo is levels 1–6 only. The Labyrinth is built so it cannot be hopped.
- Speedrun target is `SPEEDRUN_TARGET_MS`, 4 minutes.
