# CLAUDE.md

## Project Overview

Retro Battleship is a real-time multiplayer battleship board game with a retro terminal aesthetic. Players can play against each other online (via 4-character room codes) or solo against an AI opponent with three difficulty levels. The game features multiple board sizes, a power-up item system, a points/streak system, and a persistent leaderboard.

## Tech Stack

- **Backend:** Node.js + Express + Socket.IO (WebSocket-based real-time communication)
- **Frontend:** Vanilla HTML/CSS/JavaScript (no framework)
- **Audio:** Web Audio API (synthesized sound effects, no audio files)
- **Storage:** JSON file on disk for leaderboard; browser LocalStorage for user preferences

## Project Structure

```
server.js              # Express server, game logic, Socket.IO handlers (~1180 lines)
generate-og-image.js   # Script to generate OG social media preview image (uses canvas)
public/
  index.html           # Single-page HTML with 5 screen sections (lobby, waiting, placing, battle, gameover)
  game.js              # Frontend game logic, Socket.IO client, DOM manipulation (~1300 lines)
  style.css            # Themes, responsive layout, CRT effects (~1290 lines)
  og-image.png         # Generated social media preview image
package.json           # Dependencies and scripts
leaderboard.json       # Auto-generated persistent leaderboard data (gitignored via absence)
```

## Commands

### Install dependencies
```
npm install
```

### Run the server
```
npm start
```
This runs `node server.js`. The server starts on port 3000 by default (configurable via `PORT` env variable).

### Generate OG image (dev only)
```
node generate-og-image.js
```
Requires the `canvas` devDependency.

## Architecture

### Server (server.js)

The server is a single file handling all backend concerns:

- **Game state:** Stored in a `Map<gameCode, gameState>` in memory. No database.
- **Socket.IO events:** Event-driven architecture handling the full game lifecycle — `create_game`, `join_game`, `place_ships`, `fire`, `use_sonar`, `use_carpet_bomb`, `use_repair_start`, `use_repair_place`, `get_leaderboard`, `disconnect`.
- **Board validation:** `validateShips()` uses flood-fill (`findShipComponents()`) to detect ship shapes and `matchShipsToFleet()` to verify they match the expected fleet.
- **AI system:** Three difficulty levels (easy=random, medium=smart targeting of hits, hard=density-based search). AI placement via `generateAIShipPlacement()`, targeting via `findAITargets()`, `pickSmartTarget()`, `pickDensityTarget()`.
- **Leaderboard:** Read/write from `leaderboard.json` on disk. Ranked by wins, then points, then fewest games.
- **Fleet configs:** Four board sizes (10, 15, 20, 30) with escalating fleet compositions defined in `FLEET_CONFIGS`.
- **Power-ups:** Sonar pulse (area scan), carpet bomb (3-cell line attack), repair & move (relocate a damaged ship). Each costs points and has usage constraints.

### Frontend (public/game.js)

- **Screen system:** 5 screens toggled via `.active` CSS class: lobby, waiting, placing, battle, gameover.
- **Socket.IO client:** Mirrors server events for real-time updates.
- **Ship placement:** Click-to-place with hover preview; R key or button to rotate; right-click to remove.
- **Theme system:** 3 themes (Retro/Modern/Warships) stored in LocalStorage, applied via CSS classes.
- **Grid size toggler:** S/M/L display sizes (does not affect board dimensions, only visual cell size).
- **Helper shorthand:** `$()` and `$$()` are aliases for `querySelector`/`querySelectorAll`.

### Styling (public/style.css)

- **CSS custom properties** for theming (`--green`, `--blue`, `--bg`, etc.).
- **Three themes:** Base retro (CRT scanlines + green glow), `.theme-modern` (clean blue), `.theme-warships` (nautical gold).
- **Responsive:** Mobile breakpoint at 800px width. Board grid scales with CSS grid.
- **Grid size classes:** `.grid-size-s`, `.grid-size-m`, `.grid-size-l` control cell dimensions.

## Game Mechanics

- **Board sizes:** 10x10 (standard), 15x15, 20x20, 30x30 — each with its own fleet configuration.
- **Scoring:** Hits award streak-based points (1, 2, 3...). Sinking a ship awards bonus points equal to ship size.
- **Streak shots:** Configurable — when enabled, a hit grants another turn.
- **Ship touching:** Configurable — whether ships can be placed adjacent to each other.
- **Power-ups:** Sonar (scan area, limited uses), Carpet Bomb (3-cell line, resets streak), Repair & Move (relocate damaged ship, two-step process).
- **Solo mode:** Play against AI with Easy/Medium/Hard difficulty.

## Key Conventions

- **No build step.** The frontend is served as-is from `public/`. No bundler, transpiler, or minification.
- **No TypeScript.** Plain JavaScript on both client and server.
- **No testing framework.** No automated tests exist. Test changes manually by running the server and playing.
- **No linter/formatter.** No ESLint or Prettier configured.
- **Code sections** are separated by `// ─── Section Name ───` comment dividers.
- **CommonJS modules** on the server (`require`/`module.exports`). The frontend uses plain `<script>` tags (no ES modules).
- **2-space indentation** throughout the codebase.
- **Single quotes** for strings in JavaScript.

## Dependencies

| Package | Purpose |
|---------|---------|
| express | HTTP server, static file serving |
| socket.io | WebSocket server for real-time multiplayer |
| socket.io-client | Frontend Socket.IO client (served from node_modules) |
| canvas (dev) | OG image generation script |

## Important Notes for AI Assistants

- The entire backend is in `server.js` — there is no module splitting. All game logic, socket handlers, and utility functions live in this single file.
- The entire frontend logic is in `public/game.js` — similarly a single file with all DOM manipulation, state management, and socket communication.
- Game state is **in-memory only** (the `games` Map). Restarting the server loses all active games. Only the leaderboard persists to disk.
- The server injects absolute OG image URLs at request time by templating `index.html` (lines 18-26 of server.js).
- Board coordinates use row/col integers internally (0-indexed). Column labels (A, B, C...) are generated dynamically based on board size.
- Ship validation uses flood-fill to support arbitrary connected shapes, though current ships are all 1-cell-wide rectangles.
- The AI player uses socket ID `'AI_BOT'` and is handled with special-case logic throughout the server.
