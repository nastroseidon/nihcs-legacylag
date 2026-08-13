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
cut('  leaveGoLive(); stopMusic();\n', '  stopMusic();\n', 'leaveGoLive call in goMain')


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
cut("""        <span><kbd>SPACE</kbd><em>jump</em></span>
""",
    """        <span><kbd>SPACE</kbd><em>jump</em></span>
        <span><kbd>E</kbd><em>scanner</em></span>
""",
    'controls hint')


# ------------------------------------------------------------ level 6 music
# Level 6 here is an ordinary canvas level rather than the 3D stage, so it has no
# music of its own and takes the same bed as the levels either side of it.
cut("""// Two looping beds, scheduled a quarter-second ahead of the audio clock so the
// loop joins without a seam. Level 6 in this build is the 3D stage, which brings
// its own music, so the host plays nothing there.
const LEVEL_MUSIC=['cavern','cavern','cavern','legacy','legacy',null,'legacy'];""",
    """// Two looping beds, scheduled a quarter-second ahead of the audio clock so the
// loop joins without a seam.
const LEVEL_MUSIC=['cavern','cavern','cavern','legacy','legacy','legacy','legacy'];""",
    'level music map')


# -------------------------------------------------- high scores come out
# A file passed around by hand has no shared board to belong to: every copy
# would keep its own list, which is more confusing than having none.
# The three-column end panel stays; only the parts that serve the leaderboard --
# the rank line, the miss note, the name field and the victory save prompt -- go.
cut("""  .endRank{color:#8fff7a;font-weight:800;letter-spacing:2px;font-size:clamp(8px,1.1vw,10px);}
  .endMiss{color:#9aa8bd;font-style:italic;line-height:1.35;max-width:230px;font-size:clamp(9px,1.3vw,12px);}
  #nameEntry{display:flex;gap:8px;align-items:center;min-width:0;}
  #nameInput{flex:1 1 auto;min-width:0;padding:9px 10px;border-radius:8px;border:2px solid #ffd54a;
             font-size:clamp(12px,2vw,14px);}
  #nameEntry .pBtn{flex:0 0 auto;width:auto;margin:0;padding:9px 14px;
             font-size:clamp(12px,2vw,14px);white-space:nowrap;}
  #saveMsg{color:#8fff7a;font-weight:700;min-height:1em;font-size:clamp(9px,1.4vw,12px);}
  /* Victory only: the bonus level can still add medallions, so the name is
     asked for on the way out rather than the moment Go Live is cleared. */
  #savePrompt{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;
             background:rgba(6,10,20,.82);}
  #savePromptBox{width:min(88%,460px);background:#0d1424;border:3px solid #ffd54a;border-radius:6px;
             box-shadow:0 0 0 2px #06263a,0 10px 40px rgba(0,0,0,.7);padding:22px 24px;text-align:center;
             display:flex;flex-direction:column;gap:12px;}
  #savePromptRank{color:#8fff7a;font-weight:800;letter-spacing:2px;font-size:clamp(10px,1.8vw,13px);}
  #savePromptText{color:#dfe7ff;line-height:1.45;font-size:clamp(12px,2.2vw,15px);}
  #savePromptRow{display:flex;gap:8px;justify-content:center;}
  #promptName{padding:10px 12px;border-radius:8px;border:2px solid #ffd54a;width:min(60%,190px);
             font-size:clamp(13px,2.2vw,15px);}
  #savePromptRow .pBtn{width:auto;margin:0;padding:10px 18px;font-size:clamp(13px,2.2vw,15px);}
  #promptMsg{color:#8fff7a;font-weight:700;min-height:1em;font-size:clamp(10px,1.7vw,13px);}
  #promptSkip{background:none;border:none;color:#9aa8bd;text-decoration:underline;cursor:pointer;
             padding:2px;font-size:clamp(11px,1.9vw,13px);}
""", '', 'end panel score css')

# #scores block through the last #scoreList rule
s_start = html.index('  #scores{position:absolute;inset:0;z-index:6;')
s_end = html.index("  #scoreList li.scHead span:nth-child(2){color:#7ad0ff;}\n")
html = html[:s_start] + html[s_end + len("  #scoreList li.scHead span:nth-child(2){color:#7ad0ff;}\n"):]
edits += 1

cut('        <div class="btn ghost" id="scoresBtn">High Scores</div>\n',
    '', 'High Scores button')

cut("""          <div class="endRank hidden" id="vRank"></div>
          <div class="endMiss hidden" id="vMiss"></div>
""", '', 'victory rank line')

cut("""      <div id="savePrompt" class="hidden">
        <div id="savePromptBox">
          <div id="savePromptRank"></div>
          <div id="savePromptText"></div>
          <div id="savePromptRow">
            <input id="promptName" maxlength="14" placeholder="Enter your name" autocomplete="off">
            <button class="pBtn" id="promptSave">Save Score</button>
          </div>
          <div id="promptMsg"></div>
          <button id="promptSkip">Skip and go to the main menu</button>
        </div>
      </div>
""", '', 'victory save prompt')

cut("""          <div class="endRank hidden" id="goRank"></div>
          <div class="endMiss hidden" id="goMiss"></div>
          <div id="nameEntry" class="hidden">
            <input id="nameInput" maxlength="14" placeholder="Enter your name" autocomplete="off">
            <button class="pBtn" id="saveScore">Save Score</button>
          </div>
          <div id="saveMsg"></div>
""", '', 'game over name entry markup')

cut("""    <div id="scores" class="hidden">
      <h2>High Scores</h2>
      <ol id="scoreList"></ol>
      <div class="vRow">
        <button class="pBtn" id="scoresBack">Back</button>
      </div>
    </div>
""", '', 'scores screen markup')

# the whole scoring module, banner comment through renderScores()
j_start = html.index('// ---------- high scores ----------')
j_end = html.index('function hideAllScreens()')
html = html[:j_start] + html[j_end:]
edits += 1

cut("const scores=document.getElementById('scores');\n", '', 'scores element ref')
cut(" scores.classList.add('hidden');", '', 'hideAllScreens scores')
cut("function showScores(){ state='scores'; renderScores(); hideAllScreens(); scores.classList.remove('hidden'); }\n",
    '', 'showScores')

for handler, what in [
    ("document.getElementById('scoresBtn').addEventListener('click',function(e){ e.stopPropagation(); fadeTo(showScores); });\n", 'scoresBtn handler'),
    ("document.getElementById('scoresBack').addEventListener('click',function(e){ e.stopPropagation(); fadeTo(goMain); });\n", 'scoresBack handler'),
]:
    cut(handler, '', what)

h_start = html.index("document.getElementById('saveScore').addEventListener('click',")
h_end = html.index("document.getElementById('vBonus').addEventListener('click',")
html = html[:h_start] + html[h_end:]
edits += 1

# Nothing here can make the board, so the gate and both call sites come out.
# showEndRank is written to survive their absence, but it has nothing left to do.
g_start = html.index('// Submission is offered only to a run that makes the top ten.')
g_end = html.index('// Reached by clearing Go Live, and again by clearing the bonus Labyrinth')
html = html[:g_start] + html[g_end:]
edits += 1

cut("""  // The rank is shown here, but the name is not asked for until the player
  // leaves: the bonus level continues this run and can still add to the total.
  showEndRank(total,'vRank','vMiss',null);
  document.getElementById('savePrompt').classList.add('hidden');
""", '', 'showVictory rank gate')

cut("""  // The run is over either way, so the name is asked for here and now.
  showEndRank(total,'goRank','goMiss','nameEntry');
""", '', 'showGameOver rank gate')

cut("""document.getElementById('vMain').addEventListener('click',function(e){ e.stopPropagation();
  if(typeof openSavePrompt==='function'&&openSavePrompt())return;
  fadeTo(goMain);
});""",
    "document.getElementById('vMain').addEventListener('click',function(e){ e.stopPropagation(); fadeTo(goMain); });",
    'vMain handler')


# ------------------------------------------------------------ inline images
if not ASSETS.is_dir():
    sys.exit('ERROR: build/assets missing. Run tools/build_fullhtml.sh first.')

KEYS = {
    # A character's four sprites are inlined under <prefix>_<pose>, matching the
    # keys index.html builds from CHARACTERS. Add e.g. 'nurse_idle': 'nurse_idle'.
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
