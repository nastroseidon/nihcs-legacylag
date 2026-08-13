#!/bin/bash
# Shrinks the art to the size the game actually draws it at, ready for inlining
# into FullHTML.html. The originals are AI-generated at print resolution --
# tile_ground is 1254x1254 for a 50x50 tile -- so this is mostly free.
#
# Backgrounds have no alpha and become JPEG. Everything else stays PNG so the
# transparency survives.
set -e
cd "$(dirname "$0")/.."
OUT=build/assets
rm -rf "$OUT"; mkdir -p "$OUT"

jpg () {   # file, max-dimension, quality
  sips -Z "$2" -s format jpeg -s formatOptions "$3" "$1.png" --out "$OUT/$1.jpg" >/dev/null
}
png () {   # file, max-dimension
  sips -Z "$2" "$1.png" --out "$OUT/$1.png" >/dev/null
}

# full-screen art, drawn at most 1280 wide
for f in bg1_kickoff bg2_planning bg3_superuser bg4_enduser bg5_migration \
         bg6_golive bonus1_labyrinth victory gameover; do jpg "$f" 1280 82; done

# tiles: drawn at 50x50, so 128 is already 2.5x
for f in tile_ground tile_floating tile_girder; do png "$f" 128; done
png tile_platform 384      # drawn up to ~170x54
png coin 96                # drawn 40x40
png hazard_spikes 256      # drawn ~118 wide
# Hero sprites, drawn ~74x82. Add a character by appending its four names here
# -- <prefix>_idle <prefix>_jump <prefix>_walk1 <prefix>_walk2 -- and adding the
# same four to KEYS in make_fullhtml.py and to CHARACTERS in index.html.
for f in player_idle player_jump player_walk1 player_walk2; do png "$f" 288; done
for f in enemy_walk1 enemy_walk2; do png "$f" 176; done                             # drawn 58x64
for f in goal1_kickoff goal2_planning goal3_superuser goal4_enduser \
         goal5_migration goal6_golive; do png "$f" 320; done                        # drawn 90x160

echo "before: $(du -ch *.png | tail -1 | cut -f1)"
echo "after:  $(du -ch $OUT/* | tail -1 | cut -f1)"
