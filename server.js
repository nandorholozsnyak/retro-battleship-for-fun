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
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 },
  ],
  15: [
    { name: 'Dreadnought', size: 6 },
    { name: 'Carrier A', size: 5 },
    { name: 'Carrier B', size: 5 },
    { name: 'Battleship A', size: 4 },
    { name: 'Battleship B', size: 4 },
    { name: 'Cruiser A', size: 3 },
    { name: 'Cruiser B', size: 3 },
    { name: 'Destroyer A', size: 2 },
    { name: 'Destroyer B', size: 2 },
  ],
  20: [
    { name: 'Leviathan', size: 7 },
    { name: 'Dreadnought', size: 6 },
    { name: 'Carrier A', size: 5 },
    { name: 'Carrier B', size: 5 },
    { name: 'Battleship A', size: 4 },
    { name: 'Battleship B', size: 4 },
    { name: 'Battleship C', size: 4 },
    { name: 'Cruiser A', size: 3 },
    { name: 'Cruiser B', size: 3 },
    { name: 'Cruiser C', size: 3 },
    { name: 'Destroyer A', size: 2 },
    { name: 'Destroyer B', size: 2 },
  ],
  30: [
    { name: 'Titan', size: 8 },
    { name: 'Leviathan A', size: 7 },
    { name: 'Leviathan B', size: 7 },
    { name: 'Dreadnought A', size: 6 },
    { name: 'Dreadnought B', size: 6 },
    { name: 'Dreadnought C', size: 6 },
    { name: 'Carrier A', size: 5 },
    { name: 'Carrier B', size: 5 },
    { name: 'Carrier C', size: 5 },
    { name: 'Battleship A', size: 4 },
    { name: 'Battleship B', size: 4 },
    { name: 'Battleship C', size: 4 },
    { name: 'Cruiser A', size: 3 },
    { name: 'Cruiser B', size: 3 },
    { name: 'Cruiser C', size: 3 },
    { name: 'Cruiser D', size: 3 },
    { name: 'Destroyer A', size: 2 },
    { name: 'Destroyer B', size: 2 },
  ],
};

const ITEMS = {
  sonar: { cost: 4 },
  carpet_bomb: { cost: 6 },
  repair: { cost: 8 },
};

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

function validateShips(board, fleet, size) {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const foundShips = [];
  const shipCellSets = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 1 && !visited[r][c]) {
        let hLen = 0, tc = c;
        while (tc < size && board[r][tc] === 1 && !visited[r][tc]) { hLen++; tc++; }

        let vLen = 0, tr = r;
        while (tr < size && board[tr][c] === 1 && !visited[tr][c]) { vLen++; tr++; }

        if (hLen > 1 && vLen > 1) return false;

        const cells = [];
        if (hLen >= vLen) {
          for (let i = 0; i < hLen; i++) { visited[r][c + i] = true; cells.push([r, c + i]); }
          foundShips.push(hLen);
        } else {
          for (let i = 0; i < vLen; i++) { visited[r + i][c] = true; cells.push([r + i, c]); }
          foundShips.push(vLen);
        }
        shipCellSets.push(cells);
      }
    }
  }

  const expected = fleet.map(s => s.size).sort((a, b) => a - b).join(',');
  const actual = foundShips.sort((a, b) => a - b).join(',');
  if (expected !== actual) return false;

  // Check no two ships are adjacent (including diagonals)
  for (let i = 0; i < shipCellSets.length; i++) {
    for (let j = i + 1; j < shipCellSets.length; j++) {
      for (const [r1, c1] of shipCellSets[i]) {
        for (const [r2, c2] of shipCellSets[j]) {
          if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) return false;
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
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const ships = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 1 && !visited[r][c]) {
        let hLen = 0, tc = c;
        while (tc < size && board[r][tc] === 1 && !visited[r][tc]) { hLen++; tc++; }
        let vLen = 0, tr = r;
        while (tr < size && board[tr][c] === 1 && !visited[tr][c]) { vLen++; tr++; }

        const cells = [];
        if (hLen >= vLen) {
          for (let i = 0; i < hLen; i++) { visited[r][c + i] = true; cells.push([r, c + i]); }
        } else {
          for (let i = 0; i < vLen; i++) { visited[r + i][c] = true; cells.push([r + i, c]); }
        }
        ships.push({ size: cells.length, cells });
      }
    }
  }

  // Match found ships to fleet names using consume-and-match
  const remaining = fleet.map((f, i) => ({ ...f, idx: i }));
  const result = [];
  for (const ship of ships) {
    const matchIdx = remaining.findIndex(f => f.size === ship.size);
    if (matchIdx !== -1) {
      result.push({ name: remaining[matchIdx].name, size: ship.size, cells: ship.cells });
      remaining.splice(matchIdx, 1);
    }
  }
  return result;
}

function getSunkShips(board, shots, fleet, size) {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const allShips = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 1 && !visited[r][c]) {
        const cells = [];
        let hLen = 0, tc = c;
        while (tc < size && board[r][tc] === 1) { hLen++; tc++; }
        let vLen = 0, tr = r;
        while (tr < size && board[tr][c] === 1) { vLen++; tr++; }

        if (hLen >= vLen) {
          for (let i = 0; i < hLen; i++) { cells.push([r, c + i]); visited[r][c + i] = true; }
        } else {
          for (let i = 0; i < vLen; i++) { cells.push([r + i, c]); visited[r + i][c] = true; }
        }

        const allHit = cells.every(([cr, cc]) => shots[cr][cc] === 1);
        if (allHit) {
          allShips.push({ size: cells.length, cells });
        }
      }
    }
  }

  // Match to fleet names using consume-and-match
  const remaining = fleet.map((f, i) => ({ ...f, idx: i }));
  const sunk = [];
  for (const ship of allShips) {
    const matchIdx = remaining.findIndex(f => f.size === ship.size);
    if (matchIdx !== -1) {
      sunk.push({ name: remaining[matchIdx].name, size: ship.size, cells: ship.cells });
      remaining.splice(matchIdx, 1);
    }
  }
  return sunk;
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

// ─── Socket Handlers ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_game', ({ boardSize } = {}) => {
    const size = [10, 15, 20, 30].includes(boardSize) ? boardSize : 10;
    const fleet = FLEET_CONFIGS[size];

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
    });

    socket.join(code);
    socket.gameCode = code;
    socket.playerIndex = 0;
    socket.emit('game_created', {
      code,
      boardSize: size,
      fleet,
      colLabels: generateColLabels(size),
    });
    console.log(`Game ${code} created (${size}x${size}) by ${socket.id}`);
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
    if (!validateShips(board, game.fleet, game.boardSize)) {
      socket.emit('error_msg', `Invalid ship placement. Place all ${game.fleet.length} ships correctly.`);
      return;
    }

    game.boards[idx] = board;
    game.ready[idx] = true;
    game.shipPositions[idx] = extractShipPositions(board, game.fleet, game.boardSize);
    socket.emit('ships_accepted');

    if (game.ready[0] && game.ready[1]) {
      game.phase = 'battle';
      game.turn = 0;
      io.to(game.players[0]).emit('battle_start', { yourTurn: true });
      io.to(game.players[1]).emit('battle_start', { yourTurn: false });
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
        pointsEarned += ship.size; // sinking bonus
      }
    } else {
      game.streaks[idx] = 0;
    }
    game.points[idx] += pointsEarned;

    const keepTurn = hit && !won;

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
    }
  });

  // ─── Item: Sonar Pulse ───────────────────────────────────────────
  socket.on('use_sonar', ({ row, col }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;
    if (game.points[idx] < ITEMS.sonar.cost) {
      socket.emit('error_msg', 'Not enough points for Sonar Pulse!');
      return;
    }

    const size = game.boardSize;
    const opponentIdx = 1 - idx;
    game.points[idx] -= ITEMS.sonar.cost;

    const results = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const hasShip = game.boards[opponentIdx][nr][nc] === 1;
          const alreadyShot = game.shots[idx][nr][nc] === 1;
          results.push({ row: nr, col: nc, hasShip, alreadyShot });
        }
      }
    }

    socket.emit('sonar_result', {
      results,
      points: game.points[idx],
    });
  });

  // ─── Item: Carpet Bombing ────────────────────────────────────────
  socket.on('use_carpet_bomb', ({ row, col, carpetOrientation }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;
    if (game.points[idx] < ITEMS.carpet_bomb.cost) {
      socket.emit('error_msg', 'Not enough points for Carpet Bombing!');
      return;
    }

    const size = game.boardSize;
    const opponentIdx = 1 - idx;
    game.points[idx] -= ITEMS.carpet_bomb.cost;
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
      socket.emit('turn_update', { yourTurn: false });
      io.to(game.players[opponentIdx]).emit('turn_update', { yourTurn: true });
    }
  });

  // ─── Item: Repair ────────────────────────────────────────────────
  socket.on('use_repair', ({ row, col }) => {
    const code = socket.gameCode;
    const game = games.get(code);
    if (!game || game.phase !== 'battle') return;

    const idx = socket.playerIndex;
    if (game.turn !== idx) return;
    if (game.points[idx] < ITEMS.repair.cost) {
      socket.emit('error_msg', 'Not enough points for Repair!');
      return;
    }

    const opponentIdx = 1 - idx;
    // Find ship at this cell on OUR board (opponent's shots)
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

    game.points[idx] -= ITEMS.repair.cost;

    // Clear opponent's hits on this ship
    const repairedCells = [];
    for (const [r, c] of ship.cells) {
      if (game.shots[opponentIdx][r][c] === 1) {
        game.shots[opponentIdx][r][c] = 0;
        repairedCells.push([r, c]);
      }
    }

    socket.emit('repair_result', {
      shipName: ship.name,
      cells: repairedCells,
      points: game.points[idx],
    });

    io.to(game.players[opponentIdx]).emit('opponent_repair', {
      cells: repairedCells,
      enemyPoints: game.points[idx],
    });
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
