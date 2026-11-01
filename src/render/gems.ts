/**
 * 宝石ぷよの描画。色ごとにカット（面の数）を変えて、色だけでなく形でも見分けられるようにする。
 * 色数を増やしても破綻しないよう、6色目以降は既存の色を回転させて使う。
 */

export interface GemStyle {
  name: string;
  light: string;
  mid: string;
  dark: string;
  /** 中央テーブル面の角数（色覚に頼らない識別用） */
  facets: number;
  /** テーブル面の回転（ラジアン） */
  turn: number;
}

export const GEMS: GemStyle[] = [
  { name: 'ruby', light: '#ff8aa3', mid: '#e0234b', dark: '#5c0719', facets: 8, turn: Math.PI / 8 },
  { name: 'emerald', light: '#8af5c6', mid: '#12b878', dark: '#033f26', facets: 4, turn: 0 },
  { name: 'sapphire', light: '#93c0ff', mid: '#2f66e8', dark: '#0a1d5c', facets: 3, turn: -Math.PI / 2 },
  { name: 'topaz', light: '#ffe9a3', mid: '#f0b41e', dark: '#6b4100', facets: 6, turn: 0 },
  { name: 'amethyst', light: '#e2bdff', mid: '#9a4de6', dark: '#33105e', facets: 5, turn: -Math.PI / 2 },
];

export function gemStyle(color: number): GemStyle {
  return GEMS[color % GEMS.length];
}

const cache = new Map<string, HTMLCanvasElement>();

/** 1マスぶんの宝石画像（size は実ピクセル） */
export function gemSprite(color: number, size: number): HTMLCanvasElement {
  const key = `${color}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const st = gemStyle(color);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  // 本体: 左上から光が当たる球
  const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  body.addColorStop(0, st.light);
  body.addColorStop(0.45, st.mid);
  body.addColorStop(1, st.dark);
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();

  // カット面: 中央のテーブル面と、そこから外周へ伸びる稜線
  const n = st.facets;
  const tr = r * 0.46;
  const table: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = st.turn + (i / n) * Math.PI * 2;
    table.push([cx + Math.cos(a) * tr, cy + Math.sin(a) * tr]);
  }
  // 稜線の間を交互に明暗で塗ってファセット感を出す
  for (let i = 0; i < n; i++) {
    const [x1, y1] = table[i];
    const [x2, y2] = table[(i + 1) % n];
    const a1 = st.turn + (i / n) * Math.PI * 2;
    const a2 = st.turn + ((i + 1) / n) * Math.PI * 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(cx + Math.cos(a1) * r * 0.97, cy + Math.sin(a1) * r * 0.97);
    g.arc(cx, cy, r * 0.97, a1, a2);
    g.lineTo(x2, y2);
    g.closePath();
    const lightSide = Math.cos((a1 + a2) / 2 + Math.PI * 0.75); // 左上ほど明るい
    g.fillStyle = lightSide > 0 ? `rgba(255,255,255,${0.1 * lightSide})` : `rgba(0,0,0,${-0.22 * lightSide})`;
    g.fill();
  }
  // テーブル面
  const tableGrad = g.createLinearGradient(cx - tr, cy - tr, cx + tr, cy + tr);
  tableGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
  tableGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
  g.fillStyle = tableGrad;
  g.beginPath();
  table.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = Math.max(1, size * 0.02);
  g.stroke();
  // 稜線
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < n; i++) {
    const a = st.turn + (i / n) * Math.PI * 2;
    g.beginPath();
    g.moveTo(table[i][0], table[i][1]);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }

  // 縁取り
  g.strokeStyle = st.dark;
  g.lineWidth = Math.max(1, size * 0.035);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();

  // 鏡面ハイライト
  const hl = g.createRadialGradient(cx - r * 0.42, cy - r * 0.5, 0, cx - r * 0.42, cy - r * 0.5, r * 0.38);
  hl.addColorStop(0, 'rgba(255,255,255,0.95)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath();
  g.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.36, r * 0.24, -0.6, 0, Math.PI * 2);
  g.fill();

  cache.set(key, c);
  return c;
}

/** 4方向のきらめき（スパークル） */
export function drawSparkle(g: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = '#ffffff';
  g.beginPath();
  const s = size;
  const w = size * 0.18;
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x + w, y - w, x + s, y);
  g.quadraticCurveTo(x + w, y + w, x, y + s);
  g.quadraticCurveTo(x - w, y + w, x - s, y);
  g.quadraticCurveTo(x - w, y - w, x, y - s);
  g.fill();
  g.restore();
}

export function clearGemCache(): void {
  cache.clear();
}
