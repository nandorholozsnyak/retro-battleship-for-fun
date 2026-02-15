const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#0a0a0a';
ctx.fillRect(0, 0, W, H);

// Grid pattern (subtle background)
ctx.strokeStyle = 'rgba(51, 255, 51, 0.035)';
ctx.lineWidth = 1;
const gridStep = 40;
for (let x = 0; x < W; x += gridStep) {
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
}
for (let y = 0; y < H; y += gridStep) {
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
}

// Scatter some "miss" dots across the grid
const misses = [
  { x: 120, y: 80 }, { x: 360, y: 120 }, { x: 520, y: 80 },
  { x: 840, y: 120 }, { x: 1000, y: 80 }, { x: 80, y: 280 },
  { x: 200, y: 520 }, { x: 680, y: 560 }, { x: 1080, y: 520 },
  { x: 440, y: 520 }, { x: 920, y: 560 }, { x: 1120, y: 280 },
  { x: 160, y: 440 }, { x: 760, y: 80 },
];
misses.forEach(({ x, y }) => {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(51, 153, 255, 0.25)';
  ctx.fill();
});

// Scatter some "hit" X markers
const hits = [
  { x: 80, y: 160 }, { x: 120, y: 160 }, { x: 160, y: 160 },
  { x: 1040, y: 120 }, { x: 1080, y: 120 }, { x: 1120, y: 120 }, { x: 1080, y: 160 },
  { x: 80, y: 480 }, { x: 120, y: 480 },
  { x: 1040, y: 480 }, { x: 1080, y: 480 }, { x: 1120, y: 480 },
];
hits.forEach(({ x, y }) => {
  ctx.fillStyle = 'rgba(140, 26, 26, 0.45)';
  ctx.fillRect(x - 14, y - 14, 28, 28);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = 'rgba(255, 51, 51, 0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', x, y);
});

// Scanline overlay
for (let y = 0; y < H; y += 4) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, y + 2, W, 2);
}

// Vignette
const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 700);
vg.addColorStop(0, 'rgba(0,0,0,0)');
vg.addColorStop(1, 'rgba(0,0,0,0.6)');
ctx.fillStyle = vg;
ctx.fillRect(0, 0, W, H);

// Main title - large clean text
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Title glow
ctx.shadowColor = 'rgba(51, 255, 51, 0.8)';
ctx.shadowBlur = 30;
ctx.font = 'bold 120px monospace';
ctx.fillStyle = '#33ff33';
ctx.fillText('BATTLESHIP', W / 2, 200);

// Second pass for crispness
ctx.shadowBlur = 10;
ctx.fillText('BATTLESHIP', W / 2, 200);
ctx.shadowBlur = 0;

// Decorative lines around title
ctx.strokeStyle = 'rgba(51, 255, 51, 0.3)';
ctx.lineWidth = 1;
ctx.beginPath(); ctx.moveTo(200, 270); ctx.lineTo(1000, 270); ctx.stroke();
ctx.beginPath(); ctx.moveTo(250, 278); ctx.lineTo(950, 278); ctx.stroke();

// Subtitle
ctx.shadowColor = 'rgba(51, 255, 51, 0.4)';
ctx.shadowBlur = 8;
ctx.font = '36px monospace';
ctx.fillStyle = '#1a8c1a';
ctx.fillText('MULTIPLAYER NAVAL COMBAT', W / 2, 330);
ctx.shadowBlur = 0;

// Feature tags
ctx.font = '20px monospace';
const features = ['DEPLOY FLEET', 'FIRE TORPEDOES', 'SONAR PULSE', 'CARPET BOMB', 'REPAIR & MOVE'];
const tagY = 420;
const tagPadding = 16;
const tagGap = 16;

// Calculate total width
const tagWidths = features.map(f => ctx.measureText(f).width + tagPadding * 2);
const totalTagW = tagWidths.reduce((s, w) => s + w, 0) + tagGap * (features.length - 1);
let tagX = (W - totalTagW) / 2;

features.forEach((feat, i) => {
  const fw = tagWidths[i];
  // Tag background
  ctx.fillStyle = 'rgba(51, 255, 51, 0.06)';
  ctx.fillRect(tagX, tagY - 16, fw, 34);
  // Tag border
  ctx.strokeStyle = 'rgba(51, 255, 51, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(tagX, tagY - 16, fw, 34);
  // Tag text
  ctx.fillStyle = 'rgba(51, 255, 51, 0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(feat, tagX + fw / 2, tagY + 1);
  tagX += fw + tagGap;
});

// Bottom text
ctx.font = '18px monospace';
ctx.fillStyle = '#1a8c1a';
ctx.textAlign = 'center';
ctx.fillText('[ PLAY ONLINE WITH FRIENDS OR AGAINST AI ]', W / 2, 510);

// System status line
ctx.font = '14px monospace';
ctx.fillStyle = 'rgba(26, 140, 26, 0.5)';
ctx.fillText('[ SYSTEM ONLINE ]  [ AWAITING ORDERS ]  [ v2.0 ]', W / 2, 570);

// Border frame
ctx.strokeStyle = 'rgba(51, 255, 51, 0.15)';
ctx.lineWidth = 2;
ctx.strokeRect(24, 24, W - 48, H - 48);

// Corner accents
ctx.strokeStyle = 'rgba(51, 255, 51, 0.5)';
ctx.lineWidth = 2;
const cs = 20;
// Top-left
ctx.beginPath(); ctx.moveTo(24, 24 + cs); ctx.lineTo(24, 24); ctx.lineTo(24 + cs, 24); ctx.stroke();
// Top-right
ctx.beginPath(); ctx.moveTo(W - 24 - cs, 24); ctx.lineTo(W - 24, 24); ctx.lineTo(W - 24, 24 + cs); ctx.stroke();
// Bottom-left
ctx.beginPath(); ctx.moveTo(24, H - 24 - cs); ctx.lineTo(24, H - 24); ctx.lineTo(24 + cs, H - 24); ctx.stroke();
// Bottom-right
ctx.beginPath(); ctx.moveTo(W - 24 - cs, H - 24); ctx.lineTo(W - 24, H - 24); ctx.lineTo(W - 24, H - 24 - cs); ctx.stroke();

// Save
const out = fs.createWriteStream(path.join(__dirname, 'public', 'og-image.png'));
const stream = canvas.createPNGStream();
stream.pipe(out);
out.on('finish', () => console.log('og-image.png created (1200x630)'));
