// Level 6 "Go Live" — exact port of LEVELS[5] from ../index.html (2D original).
// 2D px coords: x right, y down, GROUND=640, BLOCK=50. 3D: 1 unit = 50px = 1 block.
// Convert: X(px)=px/50 ; Y(py)=(GROUND-py)/50  (y up). Widths/heights: w/50.
export const BLOCK = 50, GROUND = 640;
export const U = (px) => px / BLOCK;
export const Y = (py) => (GROUND - py) / BLOCK;

export const LEVEL6 = {
  name: 'Go Live',
  worldW: 5200,                    // px → 104 units
  start: [80, GROUND - 72],
  // ground islands: [x, width] at GROUND, 600px deep
  ground: [[0, 820], [1010, 540], [1740, 510], [2950, 600], [3750, 1450]],
  // solid walls: [x, y, w, h]
  walls: [[500, GROUND - 64, 64, 64], [3200, GROUND - 128, 64, 128]],
  // one-way platforms: [x, yTop, width]
  plats: [[900, 490, 120], [1150, 410, 140], [1360, 350, 130], [1850, 390, 140], [2060, 330, 130],
          [2340, 500, 120], [2790, 500, 120], [3300, 420, 140],
          [3900, 480, 140], [4200, 400, 150], [4550, 480, 140], [4850, 400, 150]],
  // phasing girders (solid ticks 60-240 of 600-tick cycle): [x, yTop, width]
  phase: [[2600, 500, 120], [4400, 470, 120]],
  // spikes at ground level: [x]  (width 98 hitbox, drawn ~118)
  spikes: [[1250], [3050], [4100], [4600]],
  // medallions: [x, y]
  coins: [[300, 560], [560, 560], [760, 560], [900, 440], [1180, 360], [1390, 300],
          [1880, 340], [2090, 280], [2390, 450], [2650, 450], [2840, 450],
          [3080, 540], [3330, 370], [3930, 430], [4230, 350], [4420, 310], [4470, 310],
          // the last one stays clear of the goal's hitbox so it can be jumped
          // over — otherwise the flag cannot be reached without collecting it
          [4580, 430], [4880, 350], [4960, 560]],
  // enemies: [startX, minX, maxX] on GROUND
  enemies: [[1100, 1010, 1540], [1900, 1740, 2240], [3050, 2950, 3540],
            [4300, 3750, 4700], [4900, 4750, 5190]],
  goalRect: [5080, GROUND - 160, 90, 160],
};

// 2D-original physics constants (px/frame @60Hz), used verbatim then scaled by /50.
export const PHYS = {
  GRAV: 0.8, MOVE: 5.0, JUMP: -17, STOMP_SPRING: -24, MAXFALL: 20,
  ENEMY_SPEED: 1.7,
  PLAYER_W: 46, PLAYER_H: 72, ENEMY_W: 46, ENEMY_H: 64,
  SCAN_RANGE: 210,          // px — barcode scanner reach
  SCAN_COOLDOWN: 45,        // ticks
};
