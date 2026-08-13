repo: nastroseidon/nihcs-legacylag
branch: main

## Last sync
date: 2026-08-13T11:05:00Z

### Updated in this project
- Rebuilt the end-of-run panel in `index.html`: achievements left, medallion total centre, actions right.
- Gave every achievement a bonus-medallion value, shown per row and added to the banked total.
- Gated score submission to top-10 runs, on game over inline and on victory via a prompt on the way out.
- Reworked the start screen (single gold START, quiet secondary row, key caps, no standalone Bonus button) and updated `tools/make_fullhtml.py` to match.

## Screen map
| Project screen | Repo files |
| --- | --- |
| index.html (edited, ready to commit) | index.html |
| tools/make_fullhtml.py (edited, ready to commit) | tools/make_fullhtml.py |
| End Screen Cleanup.dc.html — section 1a (end of run) | index.html end-of-run CSS, `#victory`/`#gameover` markup, `renderAchievements`, `showVictory`, `showGameOver`, high-score module |
| End Screen Cleanup.dc.html — section 2a (start screen) | index.html `#overlay` CSS and markup, `#levelSelect` |
| HANDOFF-endscreen.md | written from the above |

## Sync history
- 2026-08-13T03:13:13Z — first read of the end-of-run UI; copied `victory.png`, `gameover.png`, `bg1_kickoff.png`.
- 2026-08-13T10:52:57Z — read `tools/make_fullhtml.py` to keep the offline build in step.
