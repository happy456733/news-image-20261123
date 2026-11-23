// news-image-20261123 — "The World Today": a newspaper front page summing up
// Monday 23 November 2026 world news, drawn entirely in code.
// Pure Node 22 stdlib: a hand-rolled 5x7 bitmap font, pixel drawing helpers and
// a minimal PNG encoder (zlib deflate + CRC32). No network, no assets, fully
// deterministic: two runs write byte-identical files.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: RGB = [251, 247, 236];
const INK: RGB = [22, 22, 22];
const NAVY: RGB = [18, 33, 61];
const GOLD: RGB = [198, 158, 31];
const RED: RGB = [176, 32, 32];
const TEAL: RGB = [14, 110, 110];
const GREY: RGB = [110, 110, 104];
const LIGHT: RGB = [238, 232, 216];
const WHITE: RGB = [255, 255, 255];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
const pxbuf = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  pxbuf[i * 3] = PAPER[0];
  pxbuf[i * 3 + 1] = PAPER[1];
  pxbuf[i * 3 + 2] = PAPER[2];
}

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  pxbuf[o] = c[0];
  pxbuf[o + 1] = c[1];
  pxbuf[o + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPx(xx, yy, c);
}

function hline(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: RGB): void {
  fillRect(x, y, 1, h, c);
}

// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  for (let d = 0; d < t; d++) line(x0 + d, y0, x1 + d, y1, c);
}

function circle(cx: number, cy: number, r: number, c: RGB, fill: boolean): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (fill ? d <= r : d <= r && d > r - 2) setPx(cx + x, cy + y, c);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) setPx(cx + x, cy + y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph is 7 rows of 5 cells; '#' is ink, '.' is clear. All text in the
// poster is uppercase, so only capitals, digits and punctuation are needed.
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.###", "#..##"],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  "*": [".....", ".#.#.", "..#..", "#####", "..#..", ".#.#.", "....."],
};

function charWidth(scale: number): number {
  return 5 * scale + scale; // glyph + one column of tracking
}

function textWidth(s: string, scale: number): number {
  return s.length * charWidth(scale) - scale;
}

function drawChar(x: number, y: number, scale: number, c: RGB, ch: string): void {
  const g = GLYPHS[ch] ?? GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") fillRect(x + col * scale, y + r * scale, scale, scale, c);
    }
  }
}

function drawText(x: number, y: number, scale: number, c: RGB, s: string): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    drawChar(cx, y, scale, c, ch);
    cx += charWidth(scale);
  }
}

function drawTextCentered(cx: number, y: number, scale: number, c: RGB, s: string): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, scale, c, s);
}

// Wrap text to lines that fit maxW pixels at the given scale.
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    pxbuf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- pictograms
// Small code-drawn pictures, one per story, inside a light panel.

function panel(x: number, y: number, w: number, h: number, accent: RGB): void {
  fillRect(x, y, w, h, LIGHT);
  fillRect(x, y, w, 4, accent);
  // thin frame
  hline(x, y + h - 1, w, GREY);
  vline(x, y, h, GREY);
  vline(x + w - 1, y, h, GREY);
}

// Globe with a leaf: the climate summit.
function iconGlobe(x: number, y: number, s: number): void {
  const cx = x + 40 * s;
  const cy = y + 40 * s;
  circle(cx, cy, 34 * s, TEAL, true);
  circle(cx, cy, 34 * s, NAVY, false);
  ellipse(cx, cy, 34 * s, 12 * s, NAVY);
  vline(cx, cy - 34 * s, 68 * s, NAVY);
  // leaf
  for (let i = 0; i < 22 * s; i++) {
    line(cx + 6 * s + i, cy + 18 * s - Math.floor(i * 0.7), cx + 6 * s + i, cy + 18 * s - Math.floor(i * 0.7) + 3, [34, 139, 34]);
  }
  line(cx + 6 * s, cy + 18 * s, cx + 28 * s, cy + 2 * s, [34, 139, 34]);
}

// Warship at sea.
function iconShip(x: number, y: number, s: number): void {
  const cx = x + 40 * s;
  const cy = y + 44 * s;
  fillRect(cx - 34 * s, cy - 6 * s, 68 * s, 12 * s, NAVY); // hull
  line(cx - 34 * s, cy + 6 * s, cx - 26 * s, cy + 16 * s, NAVY);
  line(cx + 34 * s, cy + 6 * s, cx + 26 * s, cy + 16 * s, NAVY);
  fillRect(cx - 26 * s, cy + 6 * s, 52 * s, 10 * s, NAVY);
  vline(cx - 4 * s, cy - 34 * s, 28 * s, NAVY); // mast
  fillRect(cx - 4 * s, cy - 34 * s, 22 * s, 10 * s, RED); // flag
  fillRect(cx - 16 * s, cy - 18 * s, 24 * s, 12 * s, NAVY); // bridge
  for (let i = 0; i < 3; i++) {
    hline(cx - 40 * s, cy + 24 * s + i * 8 * s, 80 * s, TEAL);
  }
}

// Apartment block, cracked.
function iconBuilding(x: number, y: number, s: number): void {
  const bx = x + 22 * s;
  const by = y + 8 * s;
  fillRect(bx, by, 36 * s, 58 * s, NAVY);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      fillRect(bx + 5 * s + c * 11 * s, by + 6 * s + r * 13 * s, 6 * s, 7 * s, GOLD);
  // crack
  thickLine(bx + 18 * s, by, bx + 24 * s, by + 22 * s, 2, RED);
  thickLine(bx + 24 * s, by + 22 * s, bx + 16 * s, by + 40 * s, 2, RED);
  thickLine(bx + 16 * s, by + 40 * s, bx + 22 * s, by + 58 * s, 2, RED);
  // rubble
  fillRect(bx - 6 * s, by + 58 * s, 12 * s, 6 * s, GREY);
  fillRect(bx + 26 * s, by + 58 * s, 14 * s, 6 * s, GREY);
}

// Falling market chart.
function iconChart(x: number, y: number, s: number): void {
  const ox = x + 10 * s;
  const oy = y + 64 * s;
  hline(ox, oy, 62 * s, INK);
  vline(ox, oy - 52 * s, 52 * s, INK);
  fillRect(ox + 6 * s, oy - 20 * s, 8 * s, 20 * s, TEAL);
  fillRect(ox + 20 * s, oy - 30 * s, 8 * s, 30 * s, TEAL);
  fillRect(ox + 34 * s, oy - 14 * s, 8 * s, 14 * s, RED);
  fillRect(ox + 48 * s, oy - 6 * s, 8 * s, 6 * s, RED);
  thickLine(ox + 4 * s, oy - 46 * s, ox + 58 * s, oy - 8 * s, 3, RED);
  line(ox + 52 * s, oy - 12 * s, ox + 58 * s, oy - 8 * s, RED);
  line(ox + 58 * s, oy - 8 * s, ox + 52 * s, oy - 4 * s, RED);
}

// Microphone: the rapper plot.
function iconMic(x: number, y: number, s: number): void {
  const cx = x + 40 * s;
  const cy = y + 30 * s;
  circle(cx, cy, 18 * s, NAVY, true);
  for (let i = -2; i <= 2; i++) hline(cx - 16 * s, cy + i * 7 * s, 32 * s, WHITE);
  fillRect(cx - 12 * s, cy + 14 * s, 24 * s, 6 * s, NAVY);
  vline(cx, cy + 20 * s, 22 * s, NAVY);
  hline(cx - 14 * s, cy + 42 * s, 28 * s, NAVY);
  // warning star
  drawText(x + 56 * s, y + 52 * s, 2, RED, "!");
}

// Graduation cap: the exam scandal.
function iconCap(x: number, y: number, s: number): void {
  const cx = x + 40 * s;
  const cy = y + 34 * s;
  // cap board (diamond)
  line(cx - 34 * s, cy, cx, cy - 16 * s, NAVY);
  line(cx, cy - 16 * s, cx + 34 * s, cy, NAVY);
  line(cx + 34 * s, cy, cx, cy + 16 * s, NAVY);
  line(cx, cy + 16 * s, cx - 34 * s, cy, NAVY);
  for (let i = 0; i < 14 * s; i++) line(cx - 30 * s + i, cy - 2 * s + Math.floor(i * 0.4), cx - 30 * s + i, cy + 6 * s + Math.floor(i * 0.4), NAVY);
  // head
  fillRect(cx - 18 * s, cy + 6 * s, 36 * s, 16 * s, NAVY);
  // tassel
  vline(cx + 30 * s, cy - 2 * s, 26 * s, GOLD);
  fillRect(cx + 26 * s, cy + 22 * s, 8 * s, 10 * s, GOLD);
}

// ---------------------------------------------------------------- story cards
interface Story {
  tag: string;
  headline: string[];
  body: string;
  accent: RGB;
  icon: (x: number, y: number, s: number) => void;
}

function drawStory(x: number, y: number, w: number, h: number, st: Story): void {
  panel(x, y, w, h, st.accent);
  const ix = x + 14;
  const iy = y + 26;
  st.icon(ix, iy, 1);
  const tx = x + 116;
  const tw = w - 132;
  drawText(tx, y + 12, 2, st.accent, st.tag);
  let hy = y + 30;
  for (const ln of st.headline) {
    drawText(tx, hy, 3, INK, ln);
    hy += 26;
  }
  const lines = wrapText(st.body, tw, 2);
  let by = hy + 6;
  for (const ln of lines.slice(0, 3)) {
    drawText(tx, by, 2, [60, 60, 60], ln);
    by += 16;
  }
}

// ---------------------------------------------------------------- poster
function drawPoster(): void {
  // Masthead
  fillRect(0, 0, W, 148, NAVY);
  fillRect(0, 148, W, 5, GOLD);
  drawTextCentered(512, 18, 6, WHITE, "THE WORLD TODAY");
  drawTextCentered(512, 66, 3, GOLD, "MONDAY, 23 NOVEMBER 2026");
  drawTextCentered(512, 104, 2, [200, 208, 220], "THE DAY IN ONE PAGE  *  SIX STORIES FROM AROUND THE WORLD");

  // Lead story: COP31
  const lx = 24;
  const ly = 172;
  const lw = 976;
  const lh = 168;
  panel(lx, ly, lw, lh, TEAL);
  iconGlobe(lx + 18, ly + 34, 2);
  drawText(lx + 210, ly + 14, 2, TEAL, "CLIMATE  *  ANTALYA, TURKEY");
  drawText(lx + 210, ly + 34, 4, INK, "COP31 ENDS WITH NO DEAL");
  const leadBody = wrapText(
    "UN CLIMATE TALKS CLOSE AFTER THE LONGEST NEGOTIATIONS IN HISTORY. THE EU AND ABOUT 130 COUNTRIES REJECT A FINAL TEXT THAT NEVER MENTIONS FOSSIL FUELS.",
    lw - 240,
    2,
  );
  let by = ly + 84;
  for (const ln of leadBody) {
    drawText(lx + 210, by, 2, [60, 60, 60], ln);
    by += 17;
  }
  drawText(lx + 210, ly + 140, 2, RED, "FIRST COP TO CLOSE WITHOUT A DEAL SINCE 2009.");

  // Four-card grid
  const grid: Story[] = [
    {
      tag: "WAR AT SEA  *  BENGHAZI, LIBYA",
      headline: ["UKRAINE SAYS ITS", "SEA DRONES SANK A", "RUSSIAN WARSHIP"],
      body: "Zelenskyy says drones sank the corvette Merkury in port. Russia has not commented.",
      accent: NAVY,
      icon: iconShip,
    },
    {
      tag: "UKRAINE  *  DYMER, NEAR KYIV",
      headline: ["RUSSIAN STRIKE", "KILLS 11 IN FLAT", "BLOCK"],
      body: "A drone strike partly collapses a block. Teams search the rubble.",
      accent: RED,
      icon: iconBuilding,
    },
    {
      tag: "MARKETS  *  ASIA",
      headline: ["TECH SELL-OFF", "SINKS ASIAN", "STOCKS"],
      body: "Seoul falls 3.3% and Tokyo 5.1% as doubts over AI spending hit chip shares.",
      accent: TEAL,
      icon: iconChart,
    },
    {
      tag: "EUROPE  *  DENMARK AND POLAND",
      headline: ["POLAND: RUSSIA", "TRIED TWICE TO", "KILL RAPPER"],
      body: "Kyivstoner survived a Warsaw attempt in August. Denmark expels a Russian attache.",
      accent: NAVY,
      icon: iconMic,
    },
  ];
  const gx = 24;
  const gy = 356;
  const cw = 482;
  const ch = 196;
  const gap = 12;
  for (let i = 0; i < 4; i++) {
    drawStory(gx + (i % 2) * (cw + gap), gy + Math.floor(i / 2) * (ch + gap), cw, ch, grid[i]);
  }

  // Wide story: South Korea
  const wy = 772;
  panel(24, wy, 976, 96, GOLD);
  iconCap(36, wy + 12, 1);
  drawText(140, wy + 12, 2, [140, 100, 0], "EDUCATION  *  SEOUL, SOUTH KOREA");
  drawText(140, wy + 32, 3, INK, "MINISTER QUITS OVER AI EXAM-CHEATING SCANDAL");
  const skBody = wrapText(
    "THE EDUCATION MINISTER RESIGNS AFTER AI-ASSISTED CHEATING UPENDS THE NATIONAL EXAM.",
    976 - 140 - 16,
    2,
  );
  let sky = wy + 62;
  for (const ln of skBody) {
    drawText(140, sky, 2, [60, 60, 60], ln);
    sky += 17;
  }

  // Also today strip
  const sy = 884;
  fillRect(24, sy, 976, 92, NAVY);
  drawText(40, sy + 12, 2, GOLD, "ALSO TODAY");
  const also = wrapText(
    "DELTA OUTAGE DELAYS 1,600 FLIGHTS AS US THANKSGIVING TRAVEL BEGINS  *  UN CHIEF URGES AI RULES AT BARBADOS SUMMIT  *  BEPICOLOMBO HITS A SOFTWARE SNAG ON ITS WAY TO MERCURY  *  12,000 EVACUATED AT A MANCHESTER CONCERT",
    944,
    2,
  );
  let ay = sy + 34;
  for (const ln of also.slice(0, 3)) {
    drawText(40, ay, 2, WHITE, ln);
    ay += 17;
  }

  // Footer
  drawTextCentered(512, 992, 2, GREY, "THE WORLD TODAY  *  MONDAY, 23 NOVEMBER 2026");
}

// ---------------------------------------------------------------- main
function main(): void {
  drawPoster();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), png);
  console.log(`wrote entry.png (${png.length} bytes, ${W}x${H})`);
}

main();
