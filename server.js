const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();

// ─── Fleet Configurations ────────────────────────────────────────────
const FLEET_CONFIGS = {
  10: [
    { name: 'Carrier', w: 5, h: 1 },
    { name: 'Battleship', w: 4, h: 1 },
    { name: 'Cruiser', w: 3, h: 1 },
    { name: 'Submarine', w: 3, h: 1 },
    { name: 'Destroyer', w: 2, h: 1 },
  ],
  15: [
    { name: 'Dreadnought', w: 6, h: 1 },
    { name: 'Carrier', w: 5, h: 1 },
    { name: 'Battleship A', w: 4, h: 1 },
    { name: 'Battleship B', w: 4, h: 1 },
    { name: 'Cruiser', w: 3, h: 1 },
    { name: 'Destroyer A', w: 2, h: 1 },
    { name: 'Destroyer B', w: 2, h: 1 },
    { name: 'Fortress', w: 4, h: 2 },
  ],
  20: [
    { name: 'Leviathan', w: 7, h: 1 },
    { name: 'Carrier A', w: 5, h: 1 },
    { name: 'Carrier B', w: 5, h: 1 },
    { name: 'Cruiser A', w: 3, h: 1 },
    { name: 'Cruiser B', w: 3, h: 1 },
    { name: 'Cruiser C', w: 3, h: 1 },
    { name: 'Destroyer A', w: 2, h: 1 },
    { name: 'Destroyer B', w: 2, h: 1 },
    { name: 'Destroyer C', w: 2, h: 1 },
    { name: 'Fortress A', w: 4, h: 2 },
    { name: 'Fortress B', w: 4, h: 2 },
  ],
  30: [
    { name: 'Titan', w: 8, h: 1 },
    { name: 'Leviathan A', w: 7, h: 1 },
    { name: 'Leviathan B', w: 7, h: 1 },
    { name: 'Dreadnought', w: 6, h: 1 },
    { name: 'Carrier A', w: 5, h: 1 },
    { name: 'Carrier B', w: 5, h: 1 },
    { name: 'Battleship', w: 4, h: 1 },
    { name: 'Cruiser A', w: 3, h: 1 },
    { name: 'Cruiser B', w: 3, h: 1 },
    { name: 'Cruiser C', w: 3, h: 1 },
    { name: 'Destroyer A', w: 2, h: 1 },
    { name: 'Destroyer B', w: 2, h: 1 },
    { name: 'Destroyer C', w: 2, h: 1 },
    { name: 'Destroyer D', w: 2, h: 1 },
    { name: 'Fortress A', w: 4, h: 2 },
    { name: 'Fortress B', w: 4, h: 2 },
    { name: 'Fortress C', w: 4, h: 2 },
  ],
};

const ITEMS = {
  sonar: { cost: 4 },
  carpet_bomb: { cost: 6 },
  repair: { cost: 8 },
};

const SONAR_SIZES = { 10: 3, 15: 4, 20: 5, 30: 6 };

// ─── Helpers ─────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function generateColLabels(size) {
  const labels = [];
  for (let i = 0; i < size; i++) {
    if (i < 26) {
      labels.push(String.fromCharCode(65 + i));
    } else {
      labels.push('A' + String.fromCharCode(65 + i - 26));
    }
  }
  return labels;
}

// Flood-fill to find all connected ship components on a board
function findShipComponents(board, size) {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const components = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 1 && !visited[r][c]) {
        const cells = [];
        const queue = [[r, c]];
        visited[r][c] = true;
        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          cells.push([cr, cc]);
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc] && board[nr][nc] === 1) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        let minR = size, maxR = 0, minC = size, maxC = 0;
        for (const [cr, cc] of cells) {
          minR = Math.min(minR, cr); maxR = Math.max(maxR, cr);
          minC = Math.min(minC, cc); maxC = Math.max(maxC, cc);
        }
        components.push({ w: maxC - minC + 1, h: maxR - minR + 1, cells });
      }
    }
  }
  return components;
}

// Match ship components to fleet definitions (supports rotation: w×h or h×w)
function matchShipsToFleet(ships, fleet) {
  const remaining = fleet.map((f, i) => ({ ...f, idx: i }));
  const matched = [];
  for (const ship of ships) {
    const matchIdx = remaining.findIndex(f =>
      (f.w === ship.w && f.h === ship.h) || (f.w === ship.h && f.h === ship.w)
    );
    if (matchIdx !== -1) {
      matched.push({
        name: remaining[matchIdx].name,
        w: remaining[matchIdx].w,
        h: remaining[matchIdx].h,
        cells: ship.cells,
      });
      remaining.splice(matchIdx, 1);
    }
  }
  return { matched, remaining };
}

function validateShips(board, fleet, size, settings) {
  const components = findShipComponents(board, size);

  // Each component must be a filled rectangle
  for (const comp of components) {
    if (comp.cells.length !== comp.w * comp.h) return false;
  }

  // All fleet ships must be matched
  const { remaining } = matchShipsToFleet(components, fleet);
  if (remaining.length !== 0) return false;

  // No two ships adjacent (including diagonals) - unless touching is allowed
  if (!settings.allowTouching) {
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        for (const [r1, c1] of components[i].cells) {
          for (const [r2, c2] of components[j].cells) {
            if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) return false;
          }
        }
      }
    }
  }

  return true;
}

function countHits(board, shots, size) {
  let hits = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] === 1 && shots[r][c] === 1) hits++;
  return hits;
}

function totalShipCells(board, size) {
  let count = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] === 1) count++;
  return count;
}

function extractShipPositions(board, fleet, size) {
  const components = findShipComponents(board, size);
  const { matched } = matchShipsToFleet(components, fleet);
  return matched;
}

function getSunkShips(board, shots, fleet, size) {
  const components = findShipComponents(board, size);
  const sunkComponents = components.filter(comp =>
    comp.cells.every(([r, c]) => shots[r][c] === 1)
  );
  const { matched } = matchShipsToFleet(sunkComponents, fleet);
  return matched;
}

function findShipAt(shipPositions, row, col) {
  return shipPositions.find(ship => ship.cells.some(([r, c]) => r === row && c === col));
}

function isShipSunk(ship, shots) {
  return ship.cells.every(([r, c]) => shots[r][c] === 1);
}

function isShipDamaged(ship, shots) {
  return ship.cells.some(([r, c]) => shots[r][c] === 1);
}

function canPlaceShipOnBoard(board, newCells, excludeCells, size, settings) {
  // Check all new cells are in bounds and not occupied (ignoring excludeCells)
  const excludeSet = new Set(excludeCells.map(([r, c]) => r + ',' + c));
  for (const [r, c] of newCells) {
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    if (board[r][c] === 1 && !excludeSet.has(r + ',' + c)) return false;
  }
  // Check no adjacent cells belong to other ships - unless touching is allowed
  if (!settings.allowTouching) {
    const newSet = new Set(newCells.map(([r, c]) => r + ',' + c));
    for (const [r, c] of newCells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (board[nr][nc] === 1 && !excludeSet.has(nr + ',' + nc) && !newSet.has(nr + ',' + nc)) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function parseSettings(settings) {
  return {
    streakShots: settings?.streakShots !== false,
    allowTouching: settings?.allowTouching === true,
    maxSonars: Math.max(1, Math.min(99, parseInt(settings?.maxSonars) || 4)),
    sonarCost: Math.max(1, Math.min(20, parseInt(settings?.sonarCost) || 4)),
    carpetCost: Math.max(1, Math.min(20, parseInt(settings?.carpetCost) || 6)),
    repairCost: Math.max(1, Math.min(20, parseInt(settings?.repairCost) || 8)),
  };
}

// ─── AI Helpers ──────────────────────────────────────────────────────
function generateAIShipPlacement(fleet, size, settings) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const board = createEmptyBoard(size);
    let success = true;

    for (const ship of fleet) {
      let placed = false;
      for (let t = 0; t < 200; t++) {
        const orient = Math.random() < 0.5 ? 'H' : 'V';
        const pw = orient === 'H' ? ship.w : ship.h;
        const ph = orient === 'H' ? ship.h : ship.w;
        const maxR = size - ph;
        const maxC = size - pw;
        if (maxR < 0 || maxC < 0) continue;

        const r = Math.floor(Math.random() * (maxR + 1));
        const c = Math.floor(Math.random() * (maxC + 1));

        const cells = [];
        for (let dr = 0; dr < ph; dr++) {
          for (let dc = 0; dc < pw; dc++) {
            cells.push([r + dr, c + dc]);
          }
        }

        let canPlace = cells.every(([cr, cc]) => board[cr][cc] === 0);

        if (canPlace && !settings.allowTouching) {
          for (const [cr, cc] of cells) {
            if (!canPlace) break;
            for (let dr = -1; dr <= 1; dr++) {
              if (!canPlace) break;
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = cr + dr, nc = cc + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                  const isOwnCell = cells.some(([r2, c2]) => r2 === nr && c2 === nc);
                  if (board[nr][nc] === 1 && !isOwnCell) {
                    canPlace = false;
                    break;
                  }
                }
              }
            }
          }
        }

        if (canPlace) {
          for (const [cr, cc] of cells) {
            board[cr][cc] = 1;
          }
          placed = true;
          break;
        }
      }

      if (!placed) {
        success = false;
        break;
      }
    }

    if (success) return board;
  }
  return null;
}

function findAITargets(game, size) {
  const aiIdx = 1;
  const playerIdx = 0;
  const targets = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (game.shots[aiIdx][r][c] === 1 && game.boards[playerIdx][r][c] === 1) {
        const ship = findShipAt(game.shipPositions[playerIdx], r, c);
        if (ship && !isShipSunk(ship, game.shots[aiIdx])) {
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && game.shots[aiIdx][nr][nc] === 0) {
              if (!targets.some(([tr, tc]) => tr === nr && tc === nc)) {
                targets.push([nr, nc]);
              }
            }
          }
        }
      }
    }
  }
  return targets;
}

function pickSmartTarget(game, targets, size) {
  const aiIdx = 1;
  const playerIdx = 0;

  // Find hits on unsunk ships and determine orientation
  const hitsByShip = new Map();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (game.shots[aiIdx][r][c] === 1 && game.boards[playerIdx][r][c] === 1) {
        const ship = findShipAt(game.shipPositions[playerIdx], r, c);
        if (ship && !isShipSunk(ship, game.shots[aiIdx])) {
          if (!hitsByShip.has(ship.name)) hitsByShip.set(ship.name, []);
          hitsByShip.get(ship.name).push([r, c]);
        }
      }
    }
  }

  let bestTargets = [];
  let bestScore = -1;

  for (const target of targets) {
    let score = 1;
    const [tr, tc] = target;

    for (const [, hits] of hitsByShip) {
      if (hits.length >= 2) {
        const allSameRow = hits.every(([r]) => r === hits[0][0]);
        const allSameCol = hits.every(([, c]) => c === hits[0][1]);

        if (allSameRow && tr === hits[0][0]) {
          score += 10;
        } else if (allSameCol && tc === hits[0][1]) {
          score += 10;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTargets = [target];
    } else if (score === bestScore) {
      bestTargets.push(target);
    }
  }

  return bestTargets[Math.floor(Math.random() * bestTargets.length)];
}

function pickDensityTarget(game, unfired, size) {
  const scored = unfired.map(([r, c]) => {
    let score = 1;
    // Checkerboard bonus (ships of length >= 2 must cross checkerboard)
    if ((r + c) % 2 === 0) score += 2;
    // Center bias
    const centerDist = Math.abs(r - size / 2) + Math.abs(c - size / 2);
    score += (size - centerDist) / size;
    return { cell: [r, c], score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topN = Math.min(5, scored.length);
  const idx = Math.floor(Math.random() * topN);
  return scored[idx].cell;
}

function aiTakeTurn(game, code) {
  if (!games.has(code) || game.phase !== 'battle' || game.turn !== 1) return;

  const aiIdx = 1;
  const playerIdx = 0;
  const size = game.boardSize;

  const unfired = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (game.shots[aiIdx][r][c] === 0) {
        unfired.push([r, c]);
      }
    }
  }
  if (unfired.length === 0) return;

  let target;

  if (game.aiDifficulty === 'easy') {
    target = unfired[Math.floor(Math.random() * unfired.length)];
  } else {
    const targets = findAITargets(game, size);
    if (targets.length > 0) {
      if (game.aiDifficulty === 'hard') {
        target = pickSmartTarget(game, targets, size);
      } else {
        target = targets[Math.floor(Math.random() * targets.length)];
      }
    } else {
      if (game.aiDifficulty === 'hard') {
        target = pickDensityTarget(game, unfired, size);
      } else {
        target = unfired[Math.floor(Math.random() * unfired.length)];
      }
    }
  }

  const [row, col] = target;
  game.shots[aiIdx][row][col] = 1;
  const hit = game.boards[playerIdx][row][col] === 1;
  const sunkShips = getSunkShips(game.boards[playerIdx], game.shots[aiIdx], game.fleet, size);
  const hits = countHits(game.boards[playerIdx], game.shots[aiIdx], size);
  const total = totalShipCells(game.boards[playerIdx], size);
  const won = hits === total;

  if (hit) {
    game.streaks[aiIdx]++;
    let pointsEarned = game.streaks[aiIdx];
    const ship = findShipAt(game.shipPositions[playerIdx], row, col);
    if (ship && isShipSunk(ship, game.shots[aiIdx])) {
      pointsEarned += ship.w * ship.h;
    }
    game.points[aiIdx] += pointsEarned;
  } else {
    game.streaks[aiIdx] = 0;
  }

  const keepTurn = game.settings.streakShots ? (hit && !won) : false;

  io.to(game.players[playerIdx]).emit('incoming_fire', {
    row, col, hit, sunkShips,
    yourTurn: won ? false : !keepTurn,
    lost: won ? true : undefined,
    enemyPoints: game.points[aiIdx],
  });

  if (won) {
    game.phase = 'finished';
    io.to(game.players[playerIdx]).emit('game_over', {
      winner: false,
      opponentBoard: game.boards[aiIdx],
      myPoints: game.points[playerIdx],
      enemyPoints: game.points[aiIdx],
    });
  } else if (keepTurn) {
    setTimeout(() => {
      if (games.has(code) && game.phase === 'battle') {
        aiTakeTurn(game, code);
      }
    }, 500 + Math.random() * 500);
  } else {
    game.turn = playerIdx;
    game.sonarUsedThisRound[aiIdx] = false;
  }
}

// ─── Socket Handlers ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_game', ({ boardSize, settings } = {}) => {
    const size = [10, 15, 20, 30].includes(boardSize) ? boardSize : 10;
    const fleet = FLEET_CONFIGS[size];
    const gameSettings = parseSettings(settings);

    let code = generateCode();
    while (games.has(code)) code = generateCode();

    games.set(code, {
      players: [socket.id],
      boards: [null, null],
      shots: [createEmptyBoard(size), createEmptyBoard(size)],
      ready: [false, false],
      turn: 0,
      phase: 'waiting',
      boardSize: size,
      fleet,
      shipPositions: [null, null],
      points: [0, 0],
      streaks: [0, 0],
      repairedShips: [new Set(), new Set()],
      settings: gameSettings,
      sonarUsedThisRound: [false, false],
      sonarUsedTotal: [0, 0],
    });

    socket.join(code);
    socket.gameCode = code;
    socket.playerIndex = 0;
    socket.emit('game_created', {
      code,
      boardSize: size,
      fleet,
      colLabels: generateColLabels(size),
      settings: gameSettings,
    });
    console.log(`Game ${code} created (${size}x${size}, streak:${gameSettings.streakShots}, touch:${gameSettings.allowTouching}) by ${socket.id}`);
  });

  socket.on('create_solo_game', ({ boardSize, difficulty, settings } = {}) => {
    const size = [10, 15, 20, 30].includes(boardSize) ? boardSize : 10;
    const fleet = FLEET_CONFIGS[size];
    const aiDiff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const gameSettings = parseSettings(settings);

    let code = generateCode();
    while (games.has(code)) code = generateCode();

    games.set(code, {
      players: [socket.id, 'AI_BOT'],
      boards: [null, null],
      shots: [createEmptyBoard(size), createEmptyBoard(size)],
      ready: [false, false],
      turn: 0,
      phase: 'placing',
      boardSize: size,
      fleet,
      shipPositions: [null, null],
      points: [0, 0],
      streaks: [0, 0],
      repairedShips: [new Set(), new Set()],
      settings: gameSettings,
      sonarUsedThisRound: [false, false],
      sonarUsedTotal: [0, 0],
      isSolo: true,
      aiDifficulty: aiDiff,
    });

    socket.join(code);
    socket.gameCode = code;
    socket.playerIndex = 0;

    socket.emit('solo_game_created', {
      code,
      boardSize: size,
      fleet,
      colLabels: generateColLabels(size),
      settings: gameSettings,
    });
    console.log(`Solo game ${code} created (${size}x${size}, streak:${gameSettings.streakShots}, touch:${gameSettings.allowTouching}, AI: ${aiDiff}) by ${socket.id}`);
  });

  socket.on('join_game', (code) => {
    code = code.toUpperCase().trim();
    const game = games.get(code);

    if (!game) {
      socket.emit('error_msg', 'Game not found. Check the code and try again.');
      return;
    }
    if (game.players.length >= 2) {
      socket.emit('error_msg', 'Game is already full.');
      return;
    }

    game.players.push(socket.id);
    game.phase = 'placing';
    socket.join(code);
    socket.gameCode = code;
    socket.playerIndex = 1;

    socket.emit('game_joined', {
      code,
      playerIndex: 1,
      boardSize: game.boardSize,
      fleet: game.fleet,
      colLabels: generateColLabels(game.boardSize),
      settings: game.settings,
    });
    io.to(game.players[0]).emit('opponent_joined');
    io.to(code).emit('phase', 'placing');
    console.log(`Player ${socket.id} joined game ${code}`);
  });

  socket.on('place_ships', (board) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'placing') return;

    const idx = socket.playerIndex;
    if (!validateShips(board, game.fleet, game.boardSize, game.settings)) {
      socket.emit('error_msg', `Invalid ship placement. Place all ${game.fleet.length} ships correctly.`);
      return;
    }

    game.boards[idx] = board;
    game.ready[idx] = true;
    game.shipPositions[idx] = extractShipPositions(board, game.fleet, game.boardSize);
    socket.emit('ships_accepted');

    // In solo mode, auto-place AI ships when player is ready
    if (game.isSolo && idx === 0) {
      let aiBoard = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateAIShipPlacement(game.fleet, game.boardSize, game.settings);
        if (candidate && validateShips(candidate, game.fleet, game.boardSize, game.settings)) {
          aiBoard = candidate;
          break;
        }
      }
      if (!aiBoard) {
        socket.emit('error_msg', 'Failed to generate AI placement. Try again.');
        game.boards[idx] = null;
        game.ready[idx] = false;
        game.shipPositions[idx] = null;
        return;
      }
      game.boards[1] = aiBoard;
      game.ready[1] = true;
      game.shipPositions[1] = extractShipPositions(aiBoard, game.fleet, game.boardSize);
    }

    if (game.ready[0] && game.ready[1]) {
      game.phase = 'battle';
      game.turn = 0;
      io.to(game.players[0]).emit('battle_start', { yourTurn: true });
      if (!game.isSolo) {
        io.to(game.players[1]).emit('battle_start', { yourTurn: false });
      }
    } else {
      socket.emit('waiting_for_opponent');
    }
  });

  socket.on('fire', ({ row, col }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) {
      socket.emit('error_msg', 'Not your turn!');
      return;
    }

    const size = game.boardSize;
    const opponentIdx = 1 - idx;
    if (game.shots[idx][row][col] === 1) {
      socket.emit('error_msg', 'Already fired there!');
      return;
    }

    game.shots[idx][row][col] = 1;
    const hit = game.boards[opponentIdx][row][col] === 1;
    const sunkShips = getSunkShips(game.boards[opponentIdx], game.shots[idx], game.fleet, size);
    const hits = countHits(game.boards[opponentIdx], game.shots[idx], size);
    const total = totalShipCells(game.boards[opponentIdx], size);
    const won = hits === total;

    // Points/streak
    let pointsEarned = 0;
    if (hit) {
      game.streaks[idx]++;
      pointsEarned = game.streaks[idx]; // streak value

      // Check if a ship was just sunk
      const ship = findShipAt(game.shipPositions[opponentIdx], row, col);
      if (ship && isShipSunk(ship, game.shots[idx])) {
        pointsEarned += ship.w * ship.h; // sinking bonus
      }
    } else {
      game.streaks[idx] = 0;
    }
    game.points[idx] += pointsEarned;

    // Streak shots: keep turn on hit if enabled
    const keepTurn = game.settings.streakShots ? (hit && !won) : false;

    socket.emit('fire_result', {
      row, col, hit, sunkShips,
      yourTurn: keepTurn,
      won: won ? true : undefined,
      points: game.points[idx],
      streak: game.streaks[idx],
      pointsEarned,
    });

    io.to(game.players[opponentIdx]).emit('incoming_fire', {
      row, col, hit, sunkShips,
      yourTurn: won ? false : !keepTurn,
      lost: won ? true : undefined,
      enemyPoints: game.points[idx],
    });

    if (won) {
      game.phase = 'finished';
      io.to(game.players[idx]).emit('game_over', {
        winner: true,
        opponentBoard: game.boards[opponentIdx],
        myPoints: game.points[idx],
        enemyPoints: game.points[opponentIdx],
      });
      io.to(game.players[opponentIdx]).emit('game_over', {
        winner: false,
        opponentBoard: game.boards[idx],
        myPoints: game.points[opponentIdx],
        enemyPoints: game.points[idx],
      });
    } else if (!keepTurn) {
      game.turn = opponentIdx;
      game.sonarUsedThisRound[idx] = false;

      // Trigger AI turn if solo mode
      if (game.isSolo && opponentIdx === 1) {
        setTimeout(() => {
          if (games.has(code) && game.phase === 'battle') {
            aiTakeTurn(game, code);
          }
        }, 500 + Math.random() * 500);
      }
    }
  });

  // ─── Item: Sonar Pulse ───────────────────────────────────────────
  socket.on('use_sonar', ({ row, col }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;

    const sonarCost = game.settings.sonarCost;
    const maxSonars = game.settings.maxSonars;

    if (game.sonarUsedThisRound[idx]) {
      socket.emit('error_msg', 'Sonar already used this round!');
      return;
    }
    if (game.sonarUsedTotal[idx] >= maxSonars) {
      socket.emit('error_msg', 'No sonars remaining!');
      return;
    }
    if (game.points[idx] < sonarCost) {
      socket.emit('error_msg', 'Not enough points for Sonar Pulse!');
      return;
    }

    const size = game.boardSize;
    const opponentIdx = 1 - idx;
    game.points[idx] -= sonarCost;
    game.sonarUsedThisRound[idx] = true;
    game.sonarUsedTotal[idx]++;

    // Scan area scales with board size: 3x3, 4x4, 5x5, 6x6
    const sonarSize = SONAR_SIZES[size] || 3;
    const half = Math.floor((sonarSize - 1) / 2);
    const cells = [];
    let shipCount = 0;
    let unfiredCount = 0;
    for (let dr = -half; dr < -half + sonarSize; dr++) {
      for (let dc = -half; dc < -half + sonarSize; dc++) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const alreadyShot = game.shots[idx][nr][nc] === 1;
          if (!alreadyShot) {
            unfiredCount++;
            if (game.boards[opponentIdx][nr][nc] === 1) {
              shipCount++;
            }
          }
          cells.push({ row: nr, col: nc, alreadyShot });
        }
      }
    }
    const probability = unfiredCount > 0 ? Math.round((shipCount / unfiredCount) * 100) : 0;

    socket.emit('sonar_result', {
      cells,
      probability,
      shipCount,
      unfiredCount,
      points: game.points[idx],
      sonarsRemaining: maxSonars - game.sonarUsedTotal[idx],
    });
  });

  // ─── Item: Carpet Bombing ────────────────────────────────────────
  socket.on('use_carpet_bomb', ({ row, col, carpetOrientation }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;

    const carpetCost = game.settings.carpetCost;
    if (game.points[idx] < carpetCost) {
      socket.emit('error_msg', 'Not enough points for Carpet Bombing!');
      return;
    }

    const size = game.boardSize;
    const opponentIdx = 1 - idx;
    game.points[idx] -= carpetCost;
    game.streaks[idx] = 0; // carpet bomb resets streak

    // Calculate 3 cells in a line
    const targets = [];
    for (let d = -1; d <= 1; d++) {
      let nr, nc;
      if (carpetOrientation === 'H') {
        nr = row; nc = col + d;
      } else {
        nr = row + d; nc = col;
      }
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && game.shots[idx][nr][nc] !== 1) {
        targets.push({ row: nr, col: nc });
      }
    }

    const results = [];
    for (const t of targets) {
      game.shots[idx][t.row][t.col] = 1;
      const hit = game.boards[opponentIdx][t.row][t.col] === 1;
      if (hit) {
        game.points[idx] += 1; // flat 1pt per hit
      }
      results.push({ row: t.row, col: t.col, hit });
    }

    const sunkShips = getSunkShips(game.boards[opponentIdx], game.shots[idx], game.fleet, size);
    const hits = countHits(game.boards[opponentIdx], game.shots[idx], size);
    const total = totalShipCells(game.boards[opponentIdx], size);
    const won = hits === total;

    socket.emit('carpet_bomb_result', {
      results,
      sunkShips,
      points: game.points[idx],
      streak: 0,
      won: won ? true : undefined,
    });

    io.to(game.players[opponentIdx]).emit('incoming_carpet_bomb', {
      results,
      sunkShips,
      enemyPoints: game.points[idx],
      lost: won ? true : undefined,
    });

    if (won) {
      game.phase = 'finished';
      io.to(game.players[idx]).emit('game_over', {
        winner: true,
        opponentBoard: game.boards[opponentIdx],
        myPoints: game.points[idx],
        enemyPoints: game.points[opponentIdx],
      });
      io.to(game.players[opponentIdx]).emit('game_over', {
        winner: false,
        opponentBoard: game.boards[idx],
        myPoints: game.points[opponentIdx],
        enemyPoints: game.points[idx],
      });
    } else {
      // Carpet bomb always ends turn
      game.turn = opponentIdx;
      game.sonarUsedThisRound[idx] = false;
      socket.emit('turn_update', { yourTurn: false });
      io.to(game.players[opponentIdx]).emit('turn_update', { yourTurn: true });

      if (game.isSolo && opponentIdx === 1) {
        setTimeout(() => {
          if (games.has(code) && game.phase === 'battle') {
            aiTakeTurn(game, code);
          }
        }, 500 + Math.random() * 500);
      }
    }
  });

  // ─── Item: Repair & Move ─────────────────────────────────────────
  // Step 1: Select a damaged ship to repair
  socket.on('use_repair_select', ({ row, col }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;

    const repairCost = game.settings.repairCost;
    if (game.points[idx] < repairCost) {
      socket.emit('error_msg', 'Not enough points for Repair!');
      return;
    }

    const opponentIdx = 1 - idx;
    const ship = findShipAt(game.shipPositions[idx], row, col);
    if (!ship) {
      socket.emit('error_msg', 'No ship at that location!');
      return;
    }
    if (isShipSunk(ship, game.shots[opponentIdx])) {
      socket.emit('error_msg', 'Cannot repair a sunken ship!');
      return;
    }
    if (!isShipDamaged(ship, game.shots[opponentIdx])) {
      socket.emit('error_msg', 'That ship is not damaged!');
      return;
    }
    // Check if already repaired
    if (game.repairedShips[idx].has(ship.name)) {
      socket.emit('error_msg', 'This ship has already been repaired!');
      return;
    }

    // Send ship info back so client can enter placement mode
    socket.emit('repair_select_ok', {
      shipName: ship.name,
      shipW: ship.w,
      shipH: ship.h,
      oldCells: ship.cells,
    });
  });

  // Step 2: Confirm repair with new position
  socket.on('use_repair_move', ({ shipName, newCells }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;

    const repairCost = game.settings.repairCost;
    if (game.points[idx] < repairCost) {
      socket.emit('error_msg', 'Not enough points for Repair!');
      return;
    }

    const opponentIdx = 1 - idx;
    const size = game.boardSize;

    // Find the ship by name
    const shipIdx = game.shipPositions[idx].findIndex(s => s.name === shipName);
    if (shipIdx === -1) {
      socket.emit('error_msg', 'Ship not found!');
      return;
    }
    const ship = game.shipPositions[idx][shipIdx];

    // Re-validate: damaged, not sunk, not already repaired
    if (isShipSunk(ship, game.shots[opponentIdx])) {
      socket.emit('error_msg', 'Cannot repair a sunken ship!');
      return;
    }
    if (!isShipDamaged(ship, game.shots[opponentIdx])) {
      socket.emit('error_msg', 'That ship is not damaged!');
      return;
    }
    if (game.repairedShips[idx].has(ship.name)) {
      socket.emit('error_msg', 'This ship has already been repaired!');
      return;
    }

    // Validate new cells
    if (!newCells || newCells.length !== ship.w * ship.h) {
      socket.emit('error_msg', 'Invalid repair position!');
      return;
    }

    // Validate the new position on the board
    if (!canPlaceShipOnBoard(game.boards[idx], newCells, ship.cells, size, game.settings)) {
      socket.emit('error_msg', 'Cannot place ship there!');
      return;
    }

    // Execute the repair and move
    game.points[idx] -= repairCost;
    game.repairedShips[idx].add(ship.name);

    const oldCells = ship.cells.slice();

    // Remove old ship from board
    for (const [r, c] of oldCells) {
      game.boards[idx][r][c] = 0;
    }

    // Clear opponent's hits on old cells
    const clearedHits = [];
    for (const [r, c] of oldCells) {
      if (game.shots[opponentIdx][r][c] === 1) {
        game.shots[opponentIdx][r][c] = 0;
        clearedHits.push([r, c]);
      }
    }

    // Place ship at new position
    for (const [r, c] of newCells) {
      game.boards[idx][r][c] = 1;
    }

    // Update ship positions
    ship.cells = newCells;

    // Repair & Move ends the turn
    game.turn = opponentIdx;
    game.sonarUsedThisRound[idx] = false;

    socket.emit('repair_result', {
      shipName: ship.name,
      oldCells,
      newCells,
      clearedHits,
      points: game.points[idx],
    });

    io.to(game.players[opponentIdx]).emit('opponent_repair', {
      oldCells,
      clearedHits,
      enemyPoints: game.points[idx],
    });

    if (game.isSolo && opponentIdx === 1) {
      setTimeout(() => {
        if (games.has(code) && game.phase === 'battle') {
          aiTakeTurn(game, code);
        }
      }, 500 + Math.random() * 500);
    }
  });

  socket.on('disconnect', () => {
    const code = socket.gameCode;
    if (code && games.has(code)) {
      io.to(code).emit('opponent_disconnected');
      games.delete(code);
    }
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Battleship server running on http://localhost:${PORT}`);
});
