// HUD, screens (start/pause/victory/gameover), toast.
export function createHUD() {
  const $ = id => document.getElementById(id);
  const score = $('scoreTxt'), lives = $('livesTxt');
  const startScr = $('startScreen'), pauseScr = $('pauseScreen'),
    endScr = $('endScreen'), endTitle = $('endTitle'), endScore = $('endScore'),
    toast = $('toast');
  let readyCb = null, restartCb = null, resumeCb = null;

  $('startBtn').addEventListener('click', () => { startScr.classList.add('hidden'); readyCb?.(); });
  $('endBtn').addEventListener('click', () => { endScr.classList.add('hidden'); restartCb?.(); });
  $('pResume').addEventListener('click', () => resumeCb?.());
  $('pRestart').addEventListener('click', () => { pauseScr.classList.add('hidden'); restartCb?.(); });
  $('saveScore').addEventListener('click', () => {
    const name = ($('nameInput').value || 'Anonymous').trim().slice(0, 14);
    const sc = parseInt(endScore.dataset.score || '0', 10);
    const list = JSON.parse(localStorage.getItem('golive3d_scores') || '[]');
    list.push({ name, score: sc }); list.sort((a, b) => b.score - a.score);
    localStorage.setItem('golive3d_scores', JSON.stringify(list.slice(0, 10)));
    $('saveMsg').textContent = 'Score saved!';
  });

  let toastTimer = 0;
  return {
    ready(cb) { readyCb = cb; },
    onRestart(cb) { restartCb = cb; },
    onResume(cb) { resumeCb = cb; },
    setScore(v) { score.textContent = 'Medallions: ' + v; },
    setLives(v) { lives.textContent = 'Lives: ' + Math.max(0, v); },
    setPaused(p) { pauseScr.classList.toggle('hidden', !p); },
    hideScreens() { endScr.classList.add('hidden'); pauseScr.classList.add('hidden'); },
    toast(msg) {
      toast.textContent = msg; toast.classList.remove('hidden');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
    },
    showVictory(sc) {
      endTitle.textContent = 'GO LIVE ACHIEVED!';
      endScore.textContent = 'Total Medallions: ' + sc; endScore.dataset.score = sc;
      $('endSub').textContent = '"Go Live" cleared — the Electronic Health Record era begins! Bonus level unlocked in the original game.';
      $('saveMsg').textContent = ''; $('nameInput').value = '';
      endScr.classList.remove('hidden'); endScr.classList.remove('gameover');
      $('endBtn').textContent = 'PLAY AGAIN';
    },
    showGameOver(sc) {
      endTitle.textContent = 'GAME OVER';
      endScore.textContent = 'Total Medallions: ' + sc; endScore.dataset.score = sc;
      $('endSub').textContent = 'The Legacy Lag claims another schedule slip. Try again, doctor.';
      $('saveMsg').textContent = ''; $('nameInput').value = '';
      endScr.classList.remove('hidden'); endScr.classList.add('gameover');
      $('endBtn').textContent = 'RETRY LEVEL';
    },
  };
}
