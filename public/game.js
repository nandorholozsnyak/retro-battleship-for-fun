const socket = io();

// ─── Dynamic Config (set from server) ────────────────────────────────
let boardSize = 10;
let COLS = ['A','B','C','D','E','F','G','H','I','J'];
let SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

function setGameConfig(config) {
  boardSize = config.boardSize;
  COLS = config.colLabels;
  SHIPS = config.fleet;
}

// ─── State ───────────────────────────────────────────────────────────
let myBoard = [];
let isMyTurn = false;
let orientation = 'H';
let selectedShip = 0;
let placedShips = [];
let shipCells = [];

// Battle state
let myPoints = 0;
let myStreak = 0;
let opponentPoints = 0;
let battleMode = 'normal'; // 'normal' | 'sonar' | 'carpet_bomb' | 'repair'
let carpetOrientation = 'H';

function resetBoard() {
  myBoard = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
  placedShips = Array(SHIPS.length).fill(false);
  shipCells = Array.from({ length: SHIPS.length }, () => []);
}

// ─── DOM refs ────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  lobby: $('#screen-lobby'),
  waiting: $('#screen-waiting'),
  placing: $('#screen-placing'),
  battle: $('#screen-battle'),
  gameover: $('#screen-gameover'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function setStatus(text) {
  $('#status-bar').textContent = `[ SYSTEM ONLINE ] [ ${text} ]`;
}

// ─── Grid helpers ────────────────────────────────────────────────────
function populateLabels(colContainer, rowContainer) {
  colContainer.innerHTML = '';
  rowContainer.innerHTML = '';
  colContainer.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
  COLS.forEach(c => {
    const s = document.createElement('span');
    s.textContent = c;
    colContainer.appendChild(s);
  });
  for (let i = 1; i <= boardSize; i++) {
    const s = document.createElement('span');
    s.textContent = i;
    rowContainer.appendChild(s);
  }
}

function createGrid(container, onClick, onHover, onLeave, onRightClick) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
  container.style.gridTemplateRows = `repeat(${boardSize}, 1fr)`;
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (onClick) cell.addEventListener('click', () => onClick(r, c));
      if (onHover) cell.addEventListener('mouseenter', () => onHover(r, c));
      if (onLeave) cell.addEventListener('mouseleave', () => onLeave(r, c));
      if (onRightClick) cell.addEventListener('contextmenu', (e) => { e.preventDefault(); onRightClick(r, c); });
      container.appendChild(cell);
    }
  }
}

function getCell(gridEl, r, c) {
  return gridEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function coordStr(r, c) {
  return `${COLS[c]}${r + 1}`;
}

// ─── Sound effects (synthesized) ─────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playHit() {
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(200, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.3);
  g.gain.setValueAtTime(0.15, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  o.start();
  o.stop(audioCtx.currentTime + 0.3);
}

function playMiss() {
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(300, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.15);
  g.gain.setValueAtTime(0.08, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  o.start();
  o.stop(audioCtx.currentTime + 0.15);
}

function playSunk() {
  ensureAudio();
  [200, 150, 100, 60].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.15);
    o.start(audioCtx.currentTime + i * 0.1);
    o.stop(audioCtx.currentTime + i * 0.1 + 0.15);
  });
}

function playVictory() {
  ensureAudio();
  [330, 392, 523, 659].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.15 + 0.3);
    o.start(audioCtx.currentTime + i * 0.15);
    o.stop(audioCtx.currentTime + i * 0.15 + 0.3);
  });
}

function playSonar() {
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(800, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.5);
  g.gain.setValueAtTime(0.1, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  o.start();
  o.stop(audioCtx.currentTime + 0.5);
}

function playRepair() {
  ensureAudio();
  [400, 500, 600, 700].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.08 + 0.12);
    o.start(audioCtx.currentTime + i * 0.08);
    o.stop(audioCtx.currentTime + i * 0.08 + 0.12);
  });
}

// ─── Lobby ───────────────────────────────────────────────────────────
$('#btn-create').addEventListener('click', () => {
  const size = parseInt($('#select-board-size').value);
  socket.emit('create_game', { boardSize: size });
});

$('#btn-join').addEventListener('click', () => {
  const code = $('#input-code').value.trim();
  if (code.length !== 4) {
    $('#lobby-msg').textContent = 'ENTER A 4-CHARACTER CODE';
    return;
  }
  socket.emit('join_game', code);
});

$('#input-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-join').click();
});

// ─── Placement ───────────────────────────────────────────────────────
function initPlacement() {
  resetBoard();
  selectedShip = 0;
  orientation = 'H';

  // Generate ship list dynamically
  const shipList = $('#ship-list');
  shipList.innerHTML = '';
  SHIPS.forEach((ship, i) => {
    const el = document.createElement('div');
    el.className = 'ship-item' + (i === 0 ? ' selected' : '');
    el.dataset.ship = i;
    el.dataset.size = ship.size;
    el.textContent = `> ${ship.name.toUpperCase()} (${ship.size})`;
    el.addEventListener('click', () => {
      selectedShip = i;
      $$('.ship-item').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    });
    shipList.appendChild(el);
  });

  populateLabels($('#place-col-labels'), $('#place-row-labels'));
  createGrid($('#placement-grid'), onPlaceClick, onPlaceHover, onPlaceLeave, onPlaceRightClick);

  document.addEventListener('keydown', onPlacementKey);
  updateRotateButton();
  updateReadyButton();
}

function toggleOrientation() {
  orientation = orientation === 'H' ? 'V' : 'H';
  updateRotateButton();
}

function updateRotateButton() {
  const btn = $('#btn-rotate');
  if (orientation === 'H') {
    btn.textContent = '> HORIZONTAL \u2194';
  } else {
    btn.textContent = '> VERTICAL \u2195';
  }
}

function onPlacementKey(e) {
  if (e.key === 'r' || e.key === 'R') {
    toggleOrientation();
  }
}

function getShipCells(r, c, size, orient) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const cr = orient === 'V' ? r + i : r;
    const cc = orient === 'H' ? c + i : c;
    cells.push([cr, cc]);
  }
  return cells;
}

function canPlace(cells, excludeShip) {
  const valid = cells.every(([r, c]) => {
    if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) return false;
    if (myBoard[r][c] === 1) {
      if (excludeShip !== undefined) {
        return shipCells[excludeShip].some(([sr, sc]) => sr === r && sc === c);
      }
      return false;
    }
    return true;
  });
  if (!valid) return false;

  for (const [r, c] of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize) continue;
        if (myBoard[nr][nc] === 1) {
          const isOwnCell = cells.some(([cr, cc]) => cr === nr && cc === nc);
          const isExcluded = excludeShip !== undefined &&
            shipCells[excludeShip].some(([sr, sc]) => sr === nr && sc === nc);
          if (!isOwnCell && !isExcluded) return false;
        }
      }
    }
  }
  return true;
}

function onPlaceHover(r, c) {
  clearPreview();
  const size = SHIPS[selectedShip].size;
  const cells = getShipCells(r, c, size, orientation);
  const valid = canPlace(cells, placedShips[selectedShip] ? selectedShip : undefined);

  cells.forEach(([cr, cc]) => {
    if (cr >= 0 && cr < boardSize && cc >= 0 && cc < boardSize) {
      const el = getCell($('#placement-grid'), cr, cc);
      el.classList.add(valid ? 'preview' : 'preview-invalid');
    }
  });
}

function onPlaceLeave() {
  clearPreview();
}

function clearPreview() {
  $$('#placement-grid .cell').forEach(c => {
    c.classList.remove('preview', 'preview-invalid');
  });
}

function onPlaceClick(r, c) {
  if (myBoard[r][c] === 1) {
    for (let i = 0; i < SHIPS.length; i++) {
      if (shipCells[i].some(([sr, sc]) => sr === r && sc === c)) {
        removeShip(i);
        selectedShip = i;
        $$('.ship-item').forEach(s => s.classList.remove('selected'));
        $$('.ship-item')[i].classList.add('selected');
        updateReadyButton();
        return;
      }
    }
  }

  const size = SHIPS[selectedShip].size;
  const cells = getShipCells(r, c, size, orientation);

  if (!canPlace(cells, placedShips[selectedShip] ? selectedShip : undefined)) {
    cells.forEach(([cr, cc]) => {
      if (cr >= 0 && cr < boardSize && cc >= 0 && cc < boardSize) {
        const el = getCell($('#placement-grid'), cr, cc);
        el.classList.add('preview-invalid');
        setTimeout(() => el.classList.remove('preview-invalid'), 400);
      }
    });
    return;
  }

  if (placedShips[selectedShip]) {
    removeShip(selectedShip);
  }

  cells.forEach(([cr, cc]) => {
    myBoard[cr][cc] = 1;
    getCell($('#placement-grid'), cr, cc).classList.add('ship');
  });

  shipCells[selectedShip] = cells;
  placedShips[selectedShip] = true;
  $$('.ship-item')[selectedShip].classList.add('placed');

  const next = placedShips.indexOf(false);
  if (next !== -1) {
    selectedShip = next;
    $$('.ship-item').forEach(s => s.classList.remove('selected'));
    $$('.ship-item')[next].classList.add('selected');
  }

  updateReadyButton();
}

function onPlaceRightClick(r, c) {
  for (let i = 0; i < SHIPS.length; i++) {
    if (shipCells[i].some(([sr, sc]) => sr === r && sc === c)) {
      removeShip(i);
      selectedShip = i;
      $$('.ship-item').forEach(s => s.classList.remove('selected'));
      $$('.ship-item')[i].classList.add('selected');
      updateReadyButton();
      return;
    }
  }
}

function removeShip(idx) {
  shipCells[idx].forEach(([cr, cc]) => {
    myBoard[cr][cc] = 0;
    getCell($('#placement-grid'), cr, cc).classList.remove('ship');
  });
  shipCells[idx] = [];
  placedShips[idx] = false;
  $$('.ship-item')[idx].classList.remove('placed');
}

function updateReadyButton() {
  const allPlaced = placedShips.every(Boolean);
  $('#btn-ready').disabled = !allPlaced;
}

$('#btn-rotate').addEventListener('click', () => {
  toggleOrientation();
});

$('#btn-clear').addEventListener('click', () => {
  for (let i = 0; i < SHIPS.length; i++) {
    if (placedShips[i]) removeShip(i);
  }
  selectedShip = 0;
  $$('.ship-item').forEach(s => s.classList.remove('selected'));
  $$('.ship-item')[0].classList.add('selected');
  updateReadyButton();
});

$('#btn-ready').addEventListener('click', () => {
  socket.emit('place_ships', myBoard);
  $('#btn-ready').disabled = true;
  $('#btn-ready').textContent = '> TRANSMITTING...';
});

// ─── Battle grid toggle (mobile) ─────────────────────────────────────
$('#btn-show-enemy').addEventListener('click', () => {
  $('#enemy-grid-area').classList.remove('mobile-hidden');
  $('#own-grid-area').classList.add('mobile-hidden');
  $('#btn-show-enemy').classList.add('active');
  $('#btn-show-own').classList.remove('active');
});

$('#btn-show-own').addEventListener('click', () => {
  $('#own-grid-area').classList.remove('mobile-hidden');
  $('#enemy-grid-area').classList.add('mobile-hidden');
  $('#btn-show-own').classList.add('active');
  $('#btn-show-enemy').classList.remove('active');
});

// ─── Points & Items ──────────────────────────────────────────────────
function updatePointsDisplay() {
  $('#my-points').textContent = myPoints;
  $('#my-streak').textContent = myStreak;
  $('#enemy-points').textContent = opponentPoints;
  updateItemButtons();
}

function updateItemButtons() {
  const canUse = isMyTurn;
  $('#btn-sonar').disabled = !canUse || myPoints < 4;
  $('#btn-carpet').disabled = !canUse || myPoints < 6;
  $('#btn-repair').disabled = !canUse || myPoints < 8;
}

function setBattleMode(mode) {
  battleMode = mode;

  // Clear active states
  $('#btn-sonar').classList.remove('active-item');
  $('#btn-carpet').classList.remove('active-item');
  $('#btn-repair').classList.remove('active-item');
  $('#btn-cancel-item').style.display = 'none';
  $('#btn-carpet-rotate').style.display = 'none';

  // Clear any item previews
  clearItemPreview();

  if (mode === 'normal') {
    return;
  }

  $('#btn-cancel-item').style.display = '';

  if (mode === 'sonar') {
    $('#btn-sonar').classList.add('active-item');
  } else if (mode === 'carpet_bomb') {
    $('#btn-carpet').classList.add('active-item');
    // Show rotate button on mobile
    if (window.innerWidth <= 800) {
      $('#btn-carpet-rotate').style.display = '';
    }
  } else if (mode === 'repair') {
    $('#btn-repair').classList.add('active-item');
    // Switch to own grid on mobile for repair
    if (window.innerWidth <= 800) {
      $('#own-grid-area').classList.remove('mobile-hidden');
      $('#enemy-grid-area').classList.add('mobile-hidden');
      $('#btn-show-own').classList.add('active');
      $('#btn-show-enemy').classList.remove('active');
    }
  }
}

function clearItemPreview() {
  $$('#enemy-grid .cell').forEach(c => {
    c.classList.remove('preview-sonar', 'preview-carpet');
  });
}

$('#btn-sonar').addEventListener('click', () => {
  if (battleMode === 'sonar') { setBattleMode('normal'); return; }
  setBattleMode('sonar');
});

$('#btn-carpet').addEventListener('click', () => {
  if (battleMode === 'carpet_bomb') { setBattleMode('normal'); return; }
  carpetOrientation = 'H';
  setBattleMode('carpet_bomb');
});

$('#btn-repair').addEventListener('click', () => {
  if (battleMode === 'repair') { setBattleMode('normal'); return; }
  setBattleMode('repair');
});

$('#btn-cancel-item').addEventListener('click', () => {
  setBattleMode('normal');
});

$('#btn-carpet-rotate').addEventListener('click', () => {
  carpetOrientation = carpetOrientation === 'H' ? 'V' : 'H';
});

// ─── Battle ──────────────────────────────────────────────────────────
function initBattle() {
  document.removeEventListener('keydown', onPlacementKey);
  document.addEventListener('keydown', onBattleKey);

  // Reset battle state
  myPoints = 0;
  myStreak = 0;
  opponentPoints = 0;
  battleMode = 'normal';
  carpetOrientation = 'H';

  // Enemy grid
  const enemyCols = screens.battle.querySelector('.col-labels-enemy');
  const enemyRows = screens.battle.querySelector('.row-labels-enemy');
  populateLabels(enemyCols, enemyRows);
  createGrid($('#enemy-grid'), onFireClick, onFireHover, onFireLeave, null);

  // Own grid
  const ownCols = screens.battle.querySelector('.col-labels-own');
  const ownRows = screens.battle.querySelector('.row-labels-own');
  populateLabels(ownCols, ownRows);
  createGrid($('#own-grid'), onOwnGridClick, null, null, null);

  // Show own ships
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (myBoard[r][c] === 1) {
        getCell($('#own-grid'), r, c).classList.add('ship-own');
      }
    }
  }

  $('#battle-log').innerHTML = '';
  updatePointsDisplay();
  setBattleMode('normal');
}

function onBattleKey(e) {
  if (e.key === 'Escape') {
    setBattleMode('normal');
  }
  if ((e.key === 'r' || e.key === 'R') && battleMode === 'carpet_bomb') {
    carpetOrientation = carpetOrientation === 'H' ? 'V' : 'H';
  }
}

function onFireHover(r, c) {
  clearItemPreview();
  if (!isMyTurn) return;

  if (battleMode === 'sonar') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
          const cell = getCell($('#enemy-grid'), nr, nc);
          if (!cell.classList.contains('hit') && !cell.classList.contains('miss') && !cell.classList.contains('sunk')) {
            cell.classList.add('preview-sonar');
          }
        }
      }
    }
  } else if (battleMode === 'carpet_bomb') {
    for (let d = -1; d <= 1; d++) {
      let nr, nc;
      if (carpetOrientation === 'H') { nr = r; nc = c + d; }
      else { nr = r + d; nc = c; }
      if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
        const cell = getCell($('#enemy-grid'), nr, nc);
        if (!cell.classList.contains('hit') && !cell.classList.contains('miss') && !cell.classList.contains('sunk')) {
          cell.classList.add('preview-carpet');
        }
      }
    }
  }
}

function onFireLeave() {
  clearItemPreview();
}

function onFireClick(r, c) {
  if (!isMyTurn) return;

  if (battleMode === 'sonar') {
    socket.emit('use_sonar', { row: r, col: c });
    setBattleMode('normal');
    return;
  }

  if (battleMode === 'carpet_bomb') {
    socket.emit('use_carpet_bomb', { row: r, col: c, carpetOrientation });
    setBattleMode('normal');
    return;
  }

  // Normal fire
  const cell = getCell($('#enemy-grid'), r, c);
  if (cell.classList.contains('hit') || cell.classList.contains('miss') || cell.classList.contains('sunk')) return;
  socket.emit('fire', { row: r, col: c });
}

function onOwnGridClick(r, c) {
  if (!isMyTurn) return;
  if (battleMode !== 'repair') return;

  socket.emit('use_repair', { row: r, col: c });
  setBattleMode('normal');
}

function updateTurnIndicator() {
  const el = $('#turn-indicator');
  if (isMyTurn) {
    el.textContent = '>>> YOUR TURN - FIRE AT WILL <<<';
    el.className = 'turn-indicator your-turn';
  } else {
    el.textContent = '... ENEMY IS TARGETING ...';
    el.className = 'turn-indicator enemy-turn';
  }
  updateItemButtons();
}

function addLog(text, cls) {
  const log = $('#battle-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${cls || ''}`;
  entry.textContent = `> ${text}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function markSunkShips(gridEl, sunkShips) {
  sunkShips.forEach(ship => {
    ship.cells.forEach(([r, c]) => {
      const cell = getCell(gridEl, r, c);
      cell.classList.remove('hit');
      cell.classList.add('sunk');
    });
  });
}

// ─── Socket events ───────────────────────────────────────────────────
socket.on('connect', () => {
  $('#connection-status').textContent = 'CONNECTED';
  $('#connection-status').classList.add('connected');
});

socket.on('disconnect', () => {
  $('#connection-status').textContent = 'DISCONNECTED';
  $('#connection-status').classList.remove('connected');
});

socket.on('game_created', ({ code, boardSize: bs, fleet, colLabels }) => {
  setGameConfig({ boardSize: bs, fleet, colLabels });
  $('#game-code-display').textContent = code;
  showScreen('waiting');
  setStatus('AWAITING OPPONENT');
});

socket.on('game_joined', ({ code, boardSize: bs, fleet, colLabels }) => {
  setGameConfig({ boardSize: bs, fleet, colLabels });
  setStatus('DEPLOYING FLEET');
  showScreen('placing');
  initPlacement();
});

socket.on('opponent_joined', () => {
  setStatus('DEPLOYING FLEET');
  showScreen('placing');
  initPlacement();
});

socket.on('phase', (phase) => {
  // handled by opponent_joined / game_joined
});

socket.on('error_msg', (msg) => {
  const activeScreen = document.querySelector('.screen.active');
  const msgEl = activeScreen ? activeScreen.querySelector('.msg') : null;
  if (msgEl) {
    msgEl.textContent = msg;
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  } else {
    addLog(msg, 'log-hit');
  }
});

socket.on('ships_accepted', () => {
  $('#placing-msg').textContent = 'FLEET DEPLOYED. WAITING FOR ENEMY...';
});

socket.on('waiting_for_opponent', () => {});

socket.on('battle_start', ({ yourTurn }) => {
  isMyTurn = yourTurn;
  showScreen('battle');
  setStatus('BATTLE STATIONS');
  initBattle();
  updateTurnIndicator();
  addLog('ALL STATIONS REPORT READY. BATTLE COMMENCED.', '');
  if (yourTurn) {
    addLog('YOU HAVE FIRST STRIKE.', '');
  } else {
    addLog('ENEMY HAS FIRST STRIKE. STAND BY.', '');
  }
});

socket.on('fire_result', ({ row, col, hit, sunkShips, yourTurn, won, points, streak, pointsEarned }) => {
  const cell = getCell($('#enemy-grid'), row, col);

  // Clear sonar markers when fired upon
  cell.classList.remove('sonar-detected', 'sonar-clear');

  if (hit) {
    cell.classList.add('hit');
    playHit();
    addLog(`${coordStr(row, col)} - HIT! (+${pointsEarned} pts)`, 'log-hit');
  } else {
    cell.classList.add('miss');
    playMiss();
    addLog(`${coordStr(row, col)} - MISS`, 'log-miss');
  }

  if (sunkShips && sunkShips.length > 0) {
    markSunkShips($('#enemy-grid'), sunkShips);
    const latest = sunkShips[sunkShips.length - 1];
    playSunk();
    addLog(`ENEMY ${latest.name.toUpperCase()} DESTROYED!`, 'log-sunk');
  }

  myPoints = points;
  myStreak = streak;
  isMyTurn = yourTurn;
  updatePointsDisplay();
  updateTurnIndicator();
});

socket.on('incoming_fire', ({ row, col, hit, sunkShips, yourTurn, lost, enemyPoints: ep }) => {
  const cell = getCell($('#own-grid'), row, col);

  if (hit) {
    cell.classList.add('hit-own');
    playHit();
    addLog(`INCOMING ${coordStr(row, col)} - WE'RE HIT!`, 'log-hit');
  } else {
    cell.classList.add('miss-own');
    playMiss();
    addLog(`INCOMING ${coordStr(row, col)} - MISSED US`, 'log-miss');
  }

  if (sunkShips && sunkShips.length > 0) {
    const latest = sunkShips[sunkShips.length - 1];
    playSunk();
    addLog(`OUR ${latest.name.toUpperCase()} HAS BEEN SUNK!`, 'log-sunk');
  }

  opponentPoints = ep;
  isMyTurn = yourTurn;
  updatePointsDisplay();
  updateTurnIndicator();
});

// ─── Sonar result ────────────────────────────────────────────────────
socket.on('sonar_result', ({ results, points }) => {
  playSonar();
  myPoints = points;
  updatePointsDisplay();

  let detected = 0;
  results.forEach(({ row, col, hasShip, alreadyShot }) => {
    if (alreadyShot) return;
    const cell = getCell($('#enemy-grid'), row, col);
    // Clear previous sonar markers
    cell.classList.remove('sonar-detected', 'sonar-clear');
    if (hasShip) {
      cell.classList.add('sonar-detected');
      detected++;
    } else {
      cell.classList.add('sonar-clear');
    }
  });

  addLog(`SONAR PULSE: ${detected} CONTACT${detected !== 1 ? 'S' : ''} DETECTED (-4 pts)`, 'log-sonar');
});

// ─── Carpet bomb result ──────────────────────────────────────────────
socket.on('carpet_bomb_result', ({ results, sunkShips, points, streak, won }) => {
  let hitCount = 0;
  results.forEach(({ row, col, hit }) => {
    const cell = getCell($('#enemy-grid'), row, col);
    cell.classList.remove('sonar-detected', 'sonar-clear');
    if (hit) {
      cell.classList.add('hit');
      hitCount++;
    } else {
      cell.classList.add('miss');
    }
  });

  if (hitCount > 0) playHit();
  else playMiss();

  if (sunkShips && sunkShips.length > 0) {
    markSunkShips($('#enemy-grid'), sunkShips);
    const latest = sunkShips[sunkShips.length - 1];
    playSunk();
    addLog(`ENEMY ${latest.name.toUpperCase()} DESTROYED!`, 'log-sunk');
  }

  myPoints = points;
  myStreak = streak;
  addLog(`CARPET BOMB: ${hitCount}/${results.length} HITS (-6 pts)`, 'log-carpet');

  if (!won) {
    isMyTurn = false;
    updateTurnIndicator();
  }
  updatePointsDisplay();
});

socket.on('incoming_carpet_bomb', ({ results, sunkShips, enemyPoints: ep, lost }) => {
  results.forEach(({ row, col, hit }) => {
    const cell = getCell($('#own-grid'), row, col);
    if (hit) {
      cell.classList.add('hit-own');
    } else {
      cell.classList.add('miss-own');
    }
  });

  playHit();
  addLog(`INCOMING CARPET BOMB! ${results.filter(r => r.hit).length} HITS ON OUR FLEET`, 'log-carpet');

  if (sunkShips && sunkShips.length > 0) {
    const latest = sunkShips[sunkShips.length - 1];
    playSunk();
    addLog(`OUR ${latest.name.toUpperCase()} HAS BEEN SUNK!`, 'log-sunk');
  }

  opponentPoints = ep;
  if (!lost) {
    isMyTurn = true;
    updateTurnIndicator();
  }
  updatePointsDisplay();
});

// ─── Repair result ───────────────────────────────────────────────────
socket.on('repair_result', ({ shipName, cells, points }) => {
  playRepair();
  myPoints = points;
  updatePointsDisplay();

  cells.forEach(([r, c]) => {
    const cell = getCell($('#own-grid'), r, c);
    cell.classList.remove('hit-own');
    cell.classList.add('ship-own', 'repair-flash');
    setTimeout(() => cell.classList.remove('repair-flash'), 600);
  });

  addLog(`${shipName.toUpperCase()} REPAIRED! (${cells.length} cells restored, -8 pts)`, 'log-repair');
});

socket.on('opponent_repair', ({ cells, enemyPoints: ep }) => {
  opponentPoints = ep;
  updatePointsDisplay();

  cells.forEach(([r, c]) => {
    const cell = getCell($('#enemy-grid'), r, c);
    cell.classList.remove('hit', 'sunk');
  });

  addLog(`ENEMY REPAIRED A SHIP! (${cells.length} hits removed)`, 'log-repair');
});

// ─── Turn update (from carpet bomb) ─────────────────────────────────
socket.on('turn_update', ({ yourTurn }) => {
  isMyTurn = yourTurn;
  updateTurnIndicator();
});

// ─── Game over ───────────────────────────────────────────────────────
socket.on('game_over', ({ winner, opponentBoard, myPoints: mp, enemyPoints: ep }) => {
  document.removeEventListener('keydown', onBattleKey);

  setTimeout(() => {
    showScreen('gameover');

    if (winner) {
      playVictory();
      $('#gameover-title').textContent = '> VICTORY';
      $('#gameover-title').className = 'victory-text';
      $('#gameover-art').textContent = `
    _   __ ____ ______ ______ ____   ____ __  __
   | | / //  _// ____//_  __// __ \\ / __ \\\\ \\/ /
   | |/ / / / / /      / /  / / / // /_/ / \\  /
   |   /_/ / / /___   / /  / /_/ // _, _/  / /
   |__//___/ \\____/  /_/   \\____//_/ |_|  /_/
      `;
      $('#gameover-msg').textContent = 'ALL ENEMY VESSELS DESTROYED. MISSION COMPLETE.';
      $('#gameover-msg').className = 'victory-text';
    } else {
      $('#gameover-title').textContent = '> DEFEAT';
      $('#gameover-title').className = 'defeat-text';
      $('#gameover-art').textContent = `
    ____   ____ ______ ____ ___  ______
   / __ \\ / __// ____// __// _ |/_  __/
  / / / // _/ / /_   / _/ / __ | / /
 / /_/ // /  / __/  / /  / / | |/ /
/_____//_/  /_/    /_/  /_/  |_/_/
      `;
      $('#gameover-msg').textContent = 'OUR FLEET HAS BEEN ANNIHILATED. WE HAVE FAILED.';
      $('#gameover-msg').className = 'defeat-text';
    }

    $('#gameover-score').textContent = `YOUR POINTS: ${mp || 0} | ENEMY POINTS: ${ep || 0}`;
    setStatus('MISSION COMPLETE');
  }, 1500);
});

socket.on('opponent_disconnected', () => {
  document.removeEventListener('keydown', onBattleKey);
  setStatus('OPPONENT DISCONNECTED');
  showScreen('gameover');
  $('#gameover-title').textContent = '> SIGNAL LOST';
  $('#gameover-title').className = '';
  $('#gameover-art').textContent = '';
  $('#gameover-msg').textContent = 'ENEMY HAS RETREATED. CONNECTION SEVERED.';
  $('#gameover-msg').className = '';
  $('#gameover-score').textContent = '';
});

$('#btn-newgame').addEventListener('click', () => {
  document.removeEventListener('keydown', onBattleKey);
  showScreen('lobby');
  setStatus('AWAITING ORDERS');
  $('#lobby-msg').textContent = '';
  $('#input-code').value = '';
  setBattleMode('normal');
});
