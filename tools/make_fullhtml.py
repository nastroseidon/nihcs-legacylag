#!/usr/bin/env python3
"""Builds FullHTML.html: one self-contained file that runs straight from disk.

Differences from index.html:
  - Level 6 is a normal canvas level again, drawn with the same art as the rest
    of the game. The ThreeJS stage, its iframe and the 7 MB character model are
    gone -- those are what stopped the game working from file://, because
    browsers block ES module imports there.
  - The barcode scanner survives the move: it is reimplemented against the 2D
    engine so Level 6 keeps both ways of clearing a bot.
  - Every image is inlined as a data URI, from the resized copies in
    build/assets (run tools/build_fullhtml.sh first).
  - Anything that needs the network is skipped when running from file://.

Every replacement below is asserted, so if index.html changes shape this fails
loudly instead of quietly emitting a broken game.
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'index.html'
ASSETS = ROOT / 'build' / 'assets'
OUT = ROOT / 'FullHTML.html'

html = SRC.read_text(encoding='utf-8')
edits = 0


def cut(old, new, what):
    """Replace `old` exactly once, or stop with a clear message."""
    global html, edits
    if html.count(old) != 1:
        sys.exit(f'ERROR: expected exactly one match for {what!r}, '
                 f'found {html.count(old)}. index.html has changed shape.')
    html = html.replace(old, new)
    edits += 1


# ---------------------------------------------------------------- 3D removal
cut("""  #golive3d{position:absolute;inset:0;z-index:8;background:#120c06;}
  #golive3d iframe{display:block;width:100%;height:100%;border:0;}
""", '', 'golive3d css')

cut("""    <!-- Level 6 "Go Live" runs as a 2.5D ThreeJS stage embedded here. It reports
         its result back by postMessage so the victory / game-over / bonus-unlock
         flow below stays in charge of the run. -->
    <div id="golive3d" class="hidden"><iframe id="golive3dFrame" title="Level 6: Go Live"
         allow="autoplay" src="about:blank"></iframe></div>
""", '', 'golive3d iframe')

cut("""  if(i===5){ start3DGoLive(); return; }   // Go Live is the embedded 2.5D stage
  leaveGoLive();
""", '', 'loadLevel 3D branch')

cut("""  // Level 5 is the run-up to Go Live: start fetching the 3D stage now.
  if(i===4) preloadGoLive();
""", '', 'preload hook')

# the whole host-bridge block, from its banner comment to the message listener
start = html.index('// ---------- Level 6 "Go Live": embedded 2.5D ThreeJS stage ----------')
end = html.index('// ---------- screens / transitions ----------')
html = html[:start] + html[end:]
edits += 1

cut('function leaveGoLive(){ if(goliveActive||golivePreloaded||pendingBegin)stop3DGoLive(); }\n',
    '', 'leaveGoLive')
cut('  leaveGoLive();\n', '', 'leaveGoLive call in goMain')


# --------------------------------------------------------- scanner mechanic
# Level 6 gained the barcode scanner when it was a 3D stage; keep it here so
# the level still plays the same. Range and cooldown match the 3D engine.
cut("const keys={left:false,right:false,jump:false};",
    "const keys={left:false,right:false,jump:false,scan:false};\n"
    "const SCAN_RANGE=210, SCAN_COOLDOWN=45;   // px reach, ticks between zaps\n"
    "const SCAN_LEVELS={5:true};               // Go Live is where Dr. Wayne carries it",
    'keys decl')

cut("""  if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space')keys.jump=true;
  // ----- admin / testing shortcuts -----""",
    """  if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space')keys.jump=true;
  if(e.code==='KeyE'||e.code==='KeyX')keys.scan=true;
  // ----- admin / testing shortcuts -----""",
    'scan keydown')

cut("""  if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space')keys.jump=false;
});""",
    """  if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space')keys.jump=false;
  if(e.code==='KeyE'||e.code==='KeyX')keys.scan=false;
});""",
    'scan keyup')

# player state + per-level reset
cut("invuln:0,highY:0,walkedOnGround:false,lock:0};",
    "invuln:0,highY:0,walkedOnGround:false,lock:0,scanCd:0};",
    'player scanCd')

# the zap itself, run right after the enemy loop each tick
cut("""  if(overlap(player,goal)){""",
    """  // barcode scanner: zap the nearest live bot ahead, then dissolve it
  if(player.scanCd>0)player.scanCd--;
  if(SCAN_LEVELS[currentLevel]&&keys.scan&&player.scanCd===0&&!locked){
    player.scanCd=SCAN_COOLDOWN;
    const px=player.x+player.w/2;
    let best=null,bd=1e9;
    for(const e of enemies){ if(!e.alive)continue;
      const ex=e.x+e.w/2, dx=(ex-px)*player.face;
      if(dx<0||dx>SCAN_RANGE)continue;
      if(Math.abs((e.floorY-e.h/2)-(player.y+player.h/2))>120)continue;
      if(dx<bd){bd=dx;best=e;} }
    fx.push({type:'beam',x:px,y:player.y+player.h*0.42,
             len:best?bd:SCAN_RANGE,dir:player.face,life:12,max:12});
    if(best){ best.alive=false; score++; updateHud(); spawnZap(best.x+best.w/2,best.floorY-best.h/2); }
  }
  if(overlap(player,goal)){""",
    'scanner tick')

# effects: the beam and the digital dissolve
cut("function spawn1Up(cx,cy){",
    """function spawnZap(cx,cy){
  fx.push({type:'text',txt:'SCANNED!',x:cx,y:cy-24,life:44,max:44,col:'#7affd0'});
  for(let i=0;i<16;i++){const a=Math.random()*Math.PI*2,sp=1+Math.random()*3;
    fx.push({type:'bit',x:cx+(Math.random()-.5)*30,y:cy+(Math.random()-.5)*40,
      vx:Math.cos(a)*sp,vy:-1-Math.random()*2,r:3+Math.random()*4,life:34,max:34});}
}
function spawn1Up(cx,cy){""",
    'spawnZap')

cut("    if(f.type==='dust'){f.x+=f.vx;f.y+=f.vy;f.vy+=0.25;f.vx*=0.94;}else f.y-=1.1;",
    "    if(f.type==='dust'){f.x+=f.vx;f.y+=f.vy;f.vy+=0.25;f.vx*=0.94;}\n"
    "    else if(f.type==='bit'){f.x+=f.vx;f.y+=f.vy;f.vy+=0.06;f.vx*=0.97;}\n"
    "    else if(f.type==='beam'){}\n"
    "    else f.y-=1.1;",
    'fx update')

cut("""    if(f.type==='dust'){ctx.globalAlpha=t*0.8;ctx.fillStyle='#e8ddc0';
      ctx.beginPath();ctx.arc(f.x,f.y,f.r*(0.6+t*0.6),0,7);ctx.fill();}""",
    """    if(f.type==='dust'){ctx.globalAlpha=t*0.8;ctx.fillStyle='#e8ddc0';
      ctx.beginPath();ctx.arc(f.x,f.y,f.r*(0.6+t*0.6),0,7);ctx.fill();}
    else if(f.type==='bit'){ctx.globalAlpha=t;ctx.fillStyle='#7affd0';
      ctx.fillRect(f.x,f.y,f.r,f.r);}
    else if(f.type==='beam'){const w=f.len*Math.min(1,(1-t)*3.2);
      ctx.globalAlpha=t;ctx.fillStyle='#ff4433';
      ctx.fillRect(f.x,f.y-2,f.dir>0?w:-w,4);
      ctx.globalAlpha=t*0.5;ctx.fillStyle='#ffd0c0';
      ctx.fillRect(f.x,f.y-1,f.dir>0?w:-w,2);}""",
    'fx draw')

# tell the player about it
cut("Move: A / D or Arrows&nbsp;&nbsp;&middot;&nbsp;&nbsp;Jump: SPACE / W / Up&nbsp;&nbsp;&middot;&nbsp;&nbsp;Pause: ESC",
    "Move: A / D or Arrows&nbsp;&nbsp;&middot;&nbsp;&nbsp;Jump: SPACE / W / Up"
    "&nbsp;&nbsp;&middot;&nbsp;&nbsp;Scanner: E&nbsp;&nbsp;&middot;&nbsp;&nbsp;Pause: ESC",
    'controls hint')


# ------------------------------------------------------- offline behaviour
# fetch() cannot read a sibling file over file://, so skip it rather than
# logging a failure on every load.
cut("fetch('scores.json',{cache:'no-store'})",
    "(location.protocol==='file:'?Promise.reject():fetch('scores.json',{cache:'no-store'}))",
    'scores.json fetch guard')


# ------------------------------------------------------------ inline images
if not ASSETS.is_dir():
    sys.exit('ERROR: build/assets missing. Run tools/build_fullhtml.sh first.')

KEYS = {
    'idle': 'player_idle', 'walk1': 'player_walk1', 'walk2': 'player_walk2',
    'jump': 'player_jump', 'en1': 'enemy_walk1', 'en2': 'enemy_walk2',
    'coin': 'coin', 'ground': 'tile_ground', 'plat': 'tile_platform',
    'spike': 'hazard_spikes', 'floating': 'tile_floating', 'girder': 'tile_girder',
    'bg1': 'bg1_kickoff', 'bg2': 'bg2_planning', 'bg3': 'bg3_superuser',
    'bg4': 'bg4_enduser', 'bg5': 'bg5_migration', 'bg6': 'bg6_golive',
    'bonus1': 'bonus1_labyrinth',
    'goal1': 'goal1_kickoff', 'goal2': 'goal2_planning', 'goal3': 'goal3_superuser',
    'goal4': 'goal4_enduser', 'goal5': 'goal5_migration', 'goal6': 'goal6_golive',
}

def data_uri(stem):
    for ext, mime in (('jpg', 'image/jpeg'), ('png', 'image/png')):
        p = ASSETS / f'{stem}.{ext}'
        if p.exists():
            return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()
    sys.exit(f'ERROR: no built asset for {stem}')

entries = ',\n'.join(f"  {k}:'{data_uri(v)}'" for k, v in KEYS.items())

old_loader = re.search(
    r"const files=\{.*?im\.src=files\[k\]; img\[k\]=im;\}", html, re.S)
if not old_loader:
    sys.exit('ERROR: image loader block not found')
html = html.replace(old_loader.group(0),
    "// Every image is inlined as a data URI so this file needs nothing beside it.\n"
    "const files={\n" + entries + "\n};\n"
    "const img={},ok={};\n"
    "for(const k in files){const im=new Image();ok[k]=false;\n"
    "  im.onload=function(){ok[k]=true;}; im.onerror=function(){ok[k]=false;};"
    " im.src=files[k]; img[k]=im;}")
edits += 1

# the two CSS background images
for stem, sel in (('victory', "url('victory.png')"), ('gameover', "url('gameover.png')")):
    uri = data_uri(stem)
    if sel not in html:
        sys.exit(f'ERROR: {sel} not found in css')
    html = html.replace(sel, f"url('{uri}')")
    edits += 1

html = html.replace('<title>The Adventures of Dr. Marion Wayne</title>',
                    '<title>The Adventures of Dr. Marion Wayne</title>', 1)

OUT.write_text(html, encoding='utf-8')
print(f'{edits} edits applied')
print(f'wrote {OUT.name}  {OUT.stat().st_size/1048576:.1f} MB')
