import { nativeImage, type NativeImage } from 'electron';

export type IconColor = 'green' | 'yellow' | 'red' | 'gray';

/** 逻辑尺寸；位图按 2x 绘制以适配 Retina */
const LOGICAL_SIZE = 20;
const SCALE = 2;
const ICON_SIZE = LOGICAL_SIZE * SCALE;

/** 100ms/tick → 约 3.2s 一整轮呼吸 */
export const BREATH_CYCLE_FRAMES = 32;

const CJK_RE = /\p{Script=Han}/u;

const COLORS: Record<IconColor, [number, number, number]> = {
  green: [0, 220, 70],
  yellow: [255, 204, 0],
  red: [255, 45, 45],
  gray: [150, 150, 150],
};

/** 3×5 拉丁字母点阵 */
const GLYPHS_3X5: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['111', '001', '001', '101', '010'],
  K: ['101', '110', '100', '110', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '110', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '101', '111', '111'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
};

const GLYPH_W = 3;
const GLYPH_H = 5;
const GLYPH_GAP = 1;
const INK: [number, number, number] = [255, 255, 255];

/** 最多 2 个英文字母，或 1 个汉字 */
export function normalizeTrayAbbrev(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  for (const ch of s) {
    if (CJK_RE.test(ch)) return ch;
  }
  return s
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 2);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function breathBrightness(frameIndex: number): number {
  const wave = 0.5 + 0.5 * Math.sin((frameIndex / BREATH_CYCLE_FRAMES) * Math.PI * 2);
  return 0.75 + 0.25 * wave;
}

function brightnessFor(color: IconColor, frameIndex: number): number {
  if (color === 'yellow') return breathBrightness(frameIndex);
  if (color === 'red') return frameIndex % 4 < 2 ? 1 : 0.6;
  if (color === 'gray') return 0.85;
  return 1;
}

function circleFill(color: IconColor, brightness: number): string {
  const r = Math.min(255, Math.round(COLORS[color][0] * brightness));
  const g = Math.min(255, Math.round(COLORS[color][1] * brightness));
  const b = Math.min(255, Math.round(COLORS[color][2] * brightness));
  return `rgb(${r},${g},${b})`;
}

function writePixel(
  buf: Buffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE || a <= 0) return;
  const i = (y * ICON_SIZE + x) * 4;
  if (process.platform === 'darwin') {
    buf[i] = b;
    buf[i + 1] = g;
    buf[i + 2] = r;
    buf[i + 3] = a;
  } else {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
}

function iconFromBitmap(color: IconColor, brightness: number): Buffer {
  const r = Math.min(255, Math.round(COLORS[color][0] * brightness));
  const g = Math.min(255, Math.round(COLORS[color][1] * brightness));
  const b = Math.min(255, Math.round(COLORS[color][2] * brightness));
  const buf = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const radius = ICON_SIZE / 2 - SCALE;
  const aaWidth = SCALE * 0.75;

  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      let coverage = 1;
      if (dist > radius - aaWidth) {
        coverage = (radius + aaWidth - dist) / (2 * aaWidth);
        if (coverage <= 0) continue;
      }
      writePixel(buf, x, y, r, g, b, Math.round(255 * coverage));
    }
  }
  return buf;
}

function glyphScaleFor(text: string): number {
  return text.length <= 2 ? 3 : 2;
}

function drawGlyph(
  buf: Buffer,
  originX: number,
  originY: number,
  ch: string,
  glyphScale: number,
): void {
  const pattern = GLYPHS_3X5[ch];
  if (!pattern) return;
  const [ir, ig, ib] = INK;
  for (let row = 0; row < GLYPH_H; row++) {
    const line = pattern[row] ?? '';
    for (let col = 0; col < GLYPH_W; col++) {
      if (line[col] !== '1') continue;
      for (let sy = 0; sy < glyphScale; sy++) {
        for (let sx = 0; sx < glyphScale; sx++) {
          writePixel(
            buf,
            originX + col * glyphScale + sx,
            originY + row * glyphScale + sy,
            ir,
            ig,
            ib,
            255,
          );
        }
      }
    }
  }
}

function drawLatinAbbrevOnBitmap(buf: Buffer, text: string): void {
  const glyphScale = glyphScaleFor(text);
  const charW = GLYPH_W * glyphScale;
  const charH = GLYPH_H * glyphScale;
  const totalW = text.length * charW + Math.max(0, text.length - 1) * GLYPH_GAP;
  const startX = Math.round((ICON_SIZE - totalW) / 2);
  const startY = Math.round((ICON_SIZE - charH) / 2);
  let x = startX;
  for (const ch of text) {
    drawGlyph(buf, x, startY, ch, glyphScale);
    x += charW + GLYPH_GAP;
  }
}

function iconFromSvgHan(
  color: IconColor,
  brightness: number,
  han: string,
): NativeImage {
  const cx = LOGICAL_SIZE / 2;
  const r = LOGICAL_SIZE / 2 - 1;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${LOGICAL_SIZE} ${LOGICAL_SIZE}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="${circleFill(color, brightness)}"/>` +
    `<text x="${cx}" y="${cx + 1}" text-anchor="middle" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="11" fill="#ffffff">${escapeXml(han)}</text>` +
    `</svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  );
  if (process.platform === 'darwin') {
    image.setTemplateImage(false);
  }
  return image;
}

function bitmapTrayImage(
  color: IconColor,
  brightness: number,
  latinAbbrev?: string,
): NativeImage {
  const buf = iconFromBitmap(color, brightness);
  if (latinAbbrev) {
    drawLatinAbbrevOnBitmap(buf, latinAbbrev);
  }
  const image = nativeImage.createFromBuffer(buf, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: SCALE,
  });
  if (process.platform === 'darwin') {
    image.setTemplateImage(false);
  }
  return image;
}

export function getTrayIcon(
  color: IconColor,
  frameIndex: number,
  abbrev?: string,
) {
  const brightness = brightnessFor(color, frameIndex);
  const normalized = abbrev ? normalizeTrayAbbrev(abbrev) : '';

  if (normalized && CJK_RE.test(normalized)) {
    const svgImg = iconFromSvgHan(color, brightness, normalized);
    if (!svgImg.isEmpty()) return svgImg;
  }

  const latin = normalized && !CJK_RE.test(normalized) ? normalized : undefined;
  return bitmapTrayImage(color, brightness, latin);
}

export function statusToColor(status: string): IconColor {
  switch (status) {
    case 'idle':
      return 'green';
    case 'working':
      return 'yellow';
    case 'waiting_user':
      return 'red';
    default:
      return 'gray';
  }
}

export function getHubTrayIcon() {
  return getTrayIcon('gray', 0);
}
