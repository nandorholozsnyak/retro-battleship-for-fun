# BATTLESHIP

A two-player online battleship game with a retro terminal look.

```
 ____    _  _____ _____ _     _____ ____  _   _ ___ ____
| __ )  / \|_   _|_   _| |   | ____/ ___|| | | |_ _|  _ \
|  _ \ / _ \ | |   | | | |   |  _| \___ \| |_| || || |_) |
| |_) / ___ \| |   | | | |___| |___ ___) |  _  || ||  __/
|____/_/   \_\_|   |_| |_____|_____|____/|_| |_|___|_|
```

## Setup (Windows)

### Step 1: Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version (the big green button on the left)
3. Run the installer
4. Click **Next** through everything, keep all the defaults
5. When it asks about "Tools for Native Modules", you can skip that (leave it unchecked)
6. Click **Install**, then **Finish**

To check it worked, open **Command Prompt** (press `Win + R`, type `cmd`, hit Enter) and type:

```
node --version
```

You should see something like `v22.x.x`. If you see an error, restart your computer and try again.

### Step 2: Download the Game

Get the game folder onto your computer. You can:
- Copy it from a USB drive
- Download it as a ZIP and extract it
- Clone it with Git if you have that installed

### Step 3: Open the Game Folder in Command Prompt

1. Open **Command Prompt** (`Win + R` > type `cmd` > Enter)
2. Navigate to the game folder. For example if you put it on your Desktop:

```
cd Desktop\battleship
```

Or you can open the folder in File Explorer, click the address bar at the top, type `cmd`, and press Enter. That opens Command Prompt already in the right folder.

### Step 4: Install Dependencies

In Command Prompt, inside the game folder, run:

```
npm install
```

This downloads everything the game needs. Wait for it to finish (takes about 10 seconds).

### Step 5: Start the Server

```
npm start
```

You should see:

```
Battleship server running on http://localhost:3000
```

Leave this window open! The server runs as long as this window stays open.

### Step 6: Play

Open your browser (Chrome, Edge, Firefox) and go to:

```
http://localhost:3000
```

To use a different port:

```
set PORT=8080 && npm start
```

### Playing on Two Devices (Same Wi-Fi)

If you want to play with someone on another phone or computer on the same Wi-Fi:

1. Find your PC's IP address. In Command Prompt, type:

```
ipconfig
```

2. Look for **IPv4 Address** under your Wi-Fi adapter. It looks like `192.168.x.x`
3. On the other device's browser, go to `http://192.168.x.x:3000` (replace with your actual IP)

### Stopping the Server

Press `Ctrl + C` in the Command Prompt window to stop the server.

---

## How to Play

### 1. Start a Game

- Open the game in your browser
- Click **CREATE NEW GAME** -- you'll get a 4-letter code
- Send that code to your opponent

### 2. Join a Game

- Open the game in your browser
- Type in the 4-letter code and click **JOIN**

### 3. Place Your Ships

You have 5 ships to place on your 10x10 grid:

| Ship       | Size |
|------------|------|
| Carrier    | 5    |
| Battleship | 4    |
| Cruiser    | 3    |
| Submarine  | 3    |
| Destroyer  | 2    |

- Click a cell on the grid to place the selected ship
- Press **R** on keyboard or tap the **ROTATE** button to switch between horizontal and vertical
- Tap a placed ship to remove it
- Click **CLEAR ALL** to start over
- Once all 5 ships are placed, click **ALL HANDS READY**

### 4. Battle!

- Take turns firing at the enemy grid
- **Hit** = red X
- **Miss** = blue dot
- If you hit a ship, you get another shot!
- Sink all 5 enemy ships to win

## Tech

- Node.js + Express
- Socket.IO for real-time multiplayer
- Vanilla HTML/CSS/JS frontend
- Retro CRT terminal design with scanlines and glow effects
- Synthesized sound effects (hit, miss, sunk, victory)
