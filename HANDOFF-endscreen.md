# Handoff — end-of-run panel, achievement values, top-10 gating, start screen

**Status: applied.** `index.html` and `tools/make_fullhtml.py` in this project have
been edited and are ready to diff and commit. Nothing has been pushed — the copies
here are the deliverable.

The approved design is the mockup `End Screen Cleanup.dc.html` (section `1a` = end
of run, section `2a` = start screen). Sections 1 and 2 below describe what changed
and why; section 3 covers the build script; section 4 is what still needs testing
in a real browser, which is the one thing that could not be done here.

`FullHTML.html` was not edited by hand and must not be — it is generated. Run
`tools/build_fullhtml.sh` to rebuild it from the new `index.html`.

---

## 1. What is being changed and why

### The end-of-run screens

Today `.results` is an absolutely positioned box floating at `right:2.5%; top:17%`
over the artwork on both `#victory` and `#gameover`. It overlaps the art, and on a
long run it runs past the stage edge.

The fix: delete the floating box. The bottom panel (`#victoryPanel` /
`#gameoverPanel`) becomes three columns, centred as a group:

| column | width | contents |
| --- | --- | --- |
| left | flexible (~380px at 960px stage) | `ACHIEVEMENTS EARNED — n`, one row per achievement |
| middle | 186px, hairline border each side | `TOTAL MEDALLIONS`, the number, breakdown line |
| right | 246px | rank line, name entry (game over only), buttons |

Background images stay exactly as they are — `victory.png` and `gameover.png` are
untouched.

Each achievement is **one line**, never two: icon, name, short trigger
description, then its bonus value right-aligned in green. Rows clip with an
ellipsis rather than wrapping. The list holds a constant height (106px at full
stage) whether it shows four achievements or none, so the panel is the same
height on every end screen. With none earned, the column keeps its place and
shows a muted italic note.

The middle column reads e.g. **198** with `128 collected · +70 earned` beneath it.

### Achievement values

Every achievement is worth bonus medallions, added to the collected total. The
score that goes to the leaderboard is the combined figure.

| id | achievement | badge | short description | pts | scope |
| --- | --- | --- | --- | --- | --- |
| `pogo` | Pogo Champion | 🦘 | Cleared a level without landing | 5 | per level |
| `perfectionist` | Perfectionist | 💯 | Every medallion in one level | 5 | **once per run** |
| `minimalist` | Minimalist | 🪶 | Cleared a level with zero medallions | 5 | per level |
| `uat` | Extensive UAT | 🧪 | Died seven times in a session | 10 | once per run |
| `overtime` | Overtime Hero | 🌀 | Cleared the bonus Labyrinth | 15 | one-off |
| `stomper` | Stomp Specialist | 👢 | Every enemy, levels 1–6 | 20 | full run |
| `pacifist` | Pacifist | 🕊️ | Levels 1–6 stomping zero enemies | 20 | full run |
| `speedrun` | Speedrun | ⏱️ | Levels 1–6 well under par | 20 | full run |
| `nodeath` | No-Death Run | 💀 | Levels 1–6 without dying | 25 | full run |
| `completionist` | Completionist | 💾 | Every medallion, all six levels | 30 | full run |
| `janitor` | Janitor | 🧹 | Every enemy and medallion, 1–6 | 50 | full run |

Shape of the system: per-level achievements are small and repeatable (5–10);
full-run achievements are worth several levels of collecting (20–50). Extensive
UAT is an anti-achievement but still pays 10 — dying seven times is not easy.

Two changes beyond the numbers:

- **`perfectionist` scope moves from `'level'` to `'run'`** — it can now only be
  earned once per game.
- **`speedrun` is a full-run achievement**, described as levels 1–6 rather than a
  single level. Its `when()` predicate already checks `f.fullRun`, so only the
  description and value need setting.

The short descriptions above are new data on each `ACHIEVEMENTS` entry. They are
what the end-of-run rows show — not the flavour `title`, which is the joke
headline and far too long for one line.

### High-score submission — `index.html` only

`FullHTML.html` has no leaderboard at all and must not grow one.

In `index.html`:

- Submission is offered on **both** victory and game over, not just victory.
- It is offered **only when the run makes the top 10** of the merged board.
  Outside the top 10, no input appears — just a muted line naming the score
  needed to make the board.
- Inside the top 10, a green line reads `TOP 10 SCORE — RANK #n`.
- **Game over**: the name field sits inline in the right column. The run is over
  either way, so there is nothing to interrupt.
- **Victory**: the rank line shows, but the name field does **not**. The run may
  continue into the bonus level, and the bonus level adds medallions — asking for
  a name mid-run would bank a score that is about to change. Instead, choosing
  **Main Menu** raises a small modal over the victory screen asking for the name,
  with a "Skip and go to the main menu" escape. The Bonus Level button is
  unaffected.
- The score submitted is the combined total (collected + achievement bonus).

### The start screen

Today: START and Main Menu in a row, then Bonus, High Scores and Sound each on
their own line, in four different button colours at equal weight. Nothing reads
as the main action, and the stack pushes the credit line to the edge.

Proposed:

- START is the only gold thing on the screen, and larger.
- High Scores and Sound sit together in one row of quiet outlined buttons — the
  same treatment `.lsBtn` already uses, so no new visual language is invented.
- The controls line becomes small key caps.
- The scrim becomes a gradient so the artwork shows through at the top.
- **The standalone Bonus button is removed.** The Labyrinth cannot be reached
  until Go Live is cleared, and once it is, the level-select row already has a
  `Bonus · Labyrinth` chip. Two routes to one destination is one too many.
- The level-select row keeps full level names at full stage size and falls back
  to the existing `.lsRow.compact` short labels below 760px, which is what
  `fitLevelButtons()` already does. Same row, same behaviour, in the quieter
  style. It also covers the Shift+P testing state, where `.lsLabel` reads
  `TESTING — jump to level`.

Every word of copy is preserved. Nothing is rewritten.

---

## 2. What changed in `index.html`

Twenty-eight replacements, all of them asserted unique before writing.

1. **CSS, ~lines 65–100.** Delete the `.results` / `.resHdr` / `.resList` /
   `.resNone` block and the old `#victoryPanel` / `#victoryScore` /
   `#gameoverPanel` / `#gameoverScore` rules. Add an `.endPanel` grid used by both
   panels, plus `.endAch`, `.endScore`, `.endActions`, `.endRank`, `.endMiss`,
   `.nameRow`. Keep the sizes on `clamp()` like the rest of the file — the stage
   scales from 1280px down to phone width. Let the three columns **wrap** on a
   narrow stage (flex-wrap, not fixed grid tracks), or the panel will overflow on
   a phone.
   Do **not** change the global `.vRow` rules — `#scores` uses them and wants its
   buttons centred. Scope the changes as `.endActions .vRow`.
2. **Markup, ~lines 218–248.** Rebuild both panels to the three-column structure.
   Keep the ids `victoryScore`, `gameoverScore`, `vBonus`, `vMain`, `goRetry`,
   `goMain` so existing handlers keep working. Rename the two victory buttons to
   **Bonus Level** and **Main Menu**; game over keeps **Try Again** / **Main
   Menu**. Move `#nameEntry` into the game-over actions column. Add the victory
   save modal as a separate element with its own ids (`promptName`, `promptSave`,
   `promptMsg`) — do not reuse `nameInput` / `saveScore` / `saveMsg` in two
   places.
3. **`ACHIEVEMENTS`, ~line 416.** Add `pts:` and `desc:` to all eleven entries per
   the table above, and change `perfectionist` from `scope:'level'` to
   `scope:'run'`. Leave every `variants` block alone.
4. **`earnedList.push`, ~line 1472.** Carry the new fields through:
   `{id,badge,name,title,desc:a.desc,pts:a.pts||0}`.
5. **Scoring helpers.** Add `achievementBonus()` summing `pts` over `earnedList`,
   and `finalScore()` returning `score + achievementBonus()`. Every place that
   banks or displays a run total uses `finalScore()` — including the `entry` built
   in `saveScore()`, which currently reads `score:score`.
6. **`renderAchievements`, ~line 1371.** Emit the new row shape: icon span, a text
   span holding name + separator + `desc`, and a `+n` span. Keep building nodes
   rather than markup — the comment there explains why (the offline build strips
   `escapeHtml`).
7. **Top-10 gate.** Add `scoreRank(v)` (count of `highScores` entries strictly
   above `v`, plus one) and `neededForTop10()` (1 if the board is short of ten,
   else `highScores[9].score + 1`). `highScores` is already merged and sorted.
   Both `showVictory` and `showGameOver` use these to fill the rank line, show or
   hide the entry, and fill the muted miss note.
8. **`showVictory` / `showGameOver`, ~lines 1398–1418.** Set the number and the
   breakdown line, call `renderAchievements`, apply the gate. `showVictory` keeps
   its existing `vBonus` hide-on-`labyrinth` behaviour.
9. **`vMain` handler, ~line 1577.** If the run made the top 10 and has not been
   saved yet, open the modal instead of leaving; otherwise `fadeTo(goMain)` as
   today. Wire the modal's save and skip buttons.
10. **Start screen markup, ~lines 182–211, and CSS ~lines 49–56.** Apply the
    layout above. Delete `#bonusBtn` and its `updateBonusBtn()` call sites, or
    keep the function and stop rendering the button — check `updateBonusBtn` at
    ~line 1333 before choosing.

## 3. `tools/make_fullhtml.py` — updated in the same pass

`FullHTML.html` is generated, not edited. `make_fullhtml.py` performs exact-string
`cut()` replacements against `index.html` and **exits with an error** if a pattern
does not match exactly once. Several of the edits above land directly on those
patterns. Update the script in the same commit or the next
`tools/build_fullhtml.sh` run will fail.

Patterns that were rewritten:

- `'name entry css'` — the `#nameEntry` / `#nameInput` / `#saveMsg` rules are being
  replaced by `.nameRow`.
- `'name entry markup'` — the `#nameEntry` div moves from the victory panel to the
  game-over panel.
- `'controls hint'` — the controls line becomes key caps, so the literal string it
  matches no longer exists.
- `'showVictory name reset'` — those three lines move or change.
- The `saveScore` handler slice, which cuts from
  `document.getElementById('saveScore')` to
  `document.getElementById('vBonus')` — anything new placed between those two
  points will be silently removed from the offline build. Put the modal handlers
  inside that range deliberately, so they are stripped with the rest of the
  leaderboard.

Also new, and needed for the offline build to come out right:

- Strip the rank line, the miss note, the name entry and the save modal from both
  end screens.
- Keep the achievement values — they are gameplay, not leaderboard, and the
  offline build should show the same totals and the same `+n` rows.
- The three-column panel stays; only the right column's score block loses its
  contents, leaving the buttons.

New cuts were added for the rank line, the miss note, the game-over name field
and the victory save prompt, and one for the gate itself. The rank maths
(`endRankInfo`, `TOP_N`) and the prompt handlers sit inside ranges the script
already slices out with the rest of the leaderboard, so they need no cut of their
own. `achievementBonus` and `finalScore` deliberately sit outside those ranges:
the offline build keeps the achievement values and the same totals.

Every `cut()` is asserted, so the script will say loudly if anything still does
not line up. Run `tools/build_fullhtml.sh` — it needs `build/assets`, which is
why it could not be run here.

## 4. Still to verify in a browser

The start screen was rendered and is correct, and the page loads with no console
errors. The end screens could not be driven from outside the game's script, so
these are unchecked:

- Clear a level by hopping, then die out: the game-over panel should show Pogo
  Champion at `+5` and a total 5 above the collected count.
- Finish a run with no achievements: the panel keeps its height and shows the
  muted note, and the columns stay put.
- With a board already holding ten scores above yours, confirm no input appears
  on either screen and the miss note names the right number.
- On victory inside the top 10, confirm Bonus Level goes straight through and
  Main Menu raises the modal; confirm the bonus level's medallions are included
  in what the modal banks.
- Shift+P on the start screen: level select shows with full names at full size,
  short labels below 760px.
- Build `FullHTML.html` and confirm it has no name field, no rank line, no High
  Scores button, and still shows achievement values.
