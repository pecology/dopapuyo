import './style.css';
import { CONFIG, configSignature } from './config';
import { sound } from './audio/sound';
import { Field, clampPlacement, type Rotation } from './core/field';
import { Game } from './core/game';
import { randomSeed } from './core/tsumo';
import { Keyboard, Pointer, type ControlHandlers } from './input/controls';
import { Renderer, type Cursor, type TurnAnimation } from './render/renderer';
import {
  clearRecords,
  getRanking,
  loadOptions,
  saveOptions,
  submitRecord,
  type Options,
  type RunRecord,
} from './storage';

// ---------- DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const ui = {
  time: $('time'),
  score: $('score'),
  target: $('target'),
  bar: $('bar'),
  seed: $('seed'),
  maxchain: $('maxchain'),
  moves: $('moves'),
  keyhelp: $('keyhelp'),
  penalty: $('penalty'),
  undo: $<HTMLButtonElement>('undo'),
  resultUndo: $<HTMLButtonElement>('result-undo'),
  menu: $('menu'),
  options: $('options'),
  ranking: $('ranking'),
  result: $('result'),
  targets: $('targets'),
  seedRandom: $<HTMLButtonElement>('seed-random'),
  seedFixed: $<HTMLButtonElement>('seed-fixed'),
  seedInput: $<HTMLInputElement>('seed-input'),
  howto: $('howto'),
  rankTabs: $('rank-tabs'),
  rankBody: $('rank-body'),
  rankNote: $('rank-note'),
};

// ---------- 表示用ユーティリティ ----------
export function formatTime(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
const fmt = (n: number) => n.toLocaleString('en-US');
const targetLabel = (t: number) => (t >= 10_000 ? `${t / 10_000}万` : fmt(t));

// ---------- 状態 ----------
type Mode = 'menu' | 'playing' | 'result';

let options: Options = loadOptions();
let mode: Mode = 'menu';
let target = CONFIG.TARGETS[0];
let seedMode: 'random' | 'fixed' = 'random';
let game: Game | null = null;
let cursor: Cursor = { x: 2, rot: 0 };
let anim: TurnAnimation | null = null;
let firedPops = 0;
let startAt = 0;
let busyUntil = 0;
let endAt: number | null = null;
let endHandled = false;
let shownScore = 0;
let revealedScore = 0;
let revealedMaxChain = 0;
/** 1手戻したぶんの合計ペナルティ */
let penaltyMs = 0;
/** タッチ/マウスで「離すとキャンセル」の位置にいる */
let cancelHint = false;
let rankTarget = target;

const renderer = new Renderer(canvas);

// ---------- ゲーム操作 ----------
function canControl(): boolean {
  return mode === 'playing' && !!game && !game.finished && performance.now() >= busyUntil;
}

function startGame(seed: number): void {
  sound.unlock();
  game = new Game(seed, target);
  cursor = { x: 2, rot: 0 };
  anim = null;
  firedPops = 0;
  busyUntil = 0;
  endAt = null;
  endHandled = false;
  shownScore = 0;
  revealedScore = 0;
  revealedMaxChain = 0;
  penaltyMs = 0;
  cancelHint = false;
  ui.penalty.hidden = true;
  ui.score.style.minWidth = `${fmt(target).length}ch`;
  renderer.clearEffects();
  mode = 'playing';
  showOverlay(null);
  ui.seed.textContent = String(seed);
  ui.target.textContent = fmt(target);
  startAt = performance.now();
}

function canUndo(): boolean {
  if (!game || !game.canUndo() || performance.now() < busyUntil) return false;
  if (mode === 'playing') return true;
  // 窒息した直後（結果画面）からも戻せる
  return mode === 'result' && game.finished === 'dead';
}

function undo(): void {
  if (!game || !canUndo()) return;
  const now = performance.now();
  const prev = game.undo();
  if (!prev) return;
  penaltyMs += CONFIG.UNDO_PENALTY_MS;
  cursor = { x: clampPlacement(prev.x, prev.rot), rot: prev.rot };
  anim = null;
  endAt = null;
  endHandled = false;
  revealedScore = game.score;
  shownScore = game.score;
  revealedMaxChain = game.maxChain;
  renderer.clearEffects();
  renderer.banner(`+${CONFIG.UNDO_PENALTY_MS / 1000}秒`, now, 600);
  ui.penalty.hidden = false;
  ui.penalty.textContent = `ペナルティ +${formatTime(penaltyMs)}`;
  ui.penalty.classList.remove('flash');
  void ui.penalty.offsetWidth;
  ui.penalty.classList.add('flash');
  sound.undo();
  if (mode === 'result') {
    mode = 'playing';
    showOverlay(null);
  }
}

function chosenSeed(): number {
  if (seedMode === 'fixed') {
    const v = Math.floor(Number(ui.seedInput.value));
    if (v >= 1 && v <= CONFIG.SEED_COUNT) return v;
  }
  return randomSeed();
}

function placeAt(x: number, rot: Rotation): void {
  if (!game || !canControl()) return;
  const now = performance.now();
  const before: Field = game.field.clone();
  const turn = game.place(x, rot);

  // アニメーション用に各段階の盤面を作る
  const f = before.clone();
  f.place(turn.pair, x, rot);
  const frames = [f.clone()];
  for (const step of turn.chain.steps) {
    f.removeAndFall(step.cleared);
    frames.push(f.clone());
  }
  anim = { turn, before, frames, start: now };
  firedPops = 0;
  busyUntil = now + turn.timeline.total;
  if (turn.cleared || turn.dead) endAt = busyUntil;
  sound.place();

  if (options.spawnMode === 'reset') cursor = { x: 2, rot: 0 };
  else cursor = { x: clampPlacement(x, rot), rot };
}

const handlers: ControlHandlers = {
  canControl,
  move(dx) {
    const min = cursor.rot === 3 ? 1 : 0;
    const max = cursor.rot === 1 ? 4 : 5;
    const nx = cursor.x + dx;
    if (nx < min || nx > max) return false;
    cursor = { ...cursor, x: nx };
    sound.move();
    return true;
  },
  moveToWall(dx) {
    while (handlers.move(dx));
  },
  rotate(dir) {
    const rot = ((cursor.rot + dir + 4) % 4) as Rotation;
    cursor = { x: clampPlacement(cursor.x, rot), rot };
    sound.rotate();
  },
  setRotation(rot) {
    cursor = { x: clampPlacement(cursor.x, rot), rot };
  },
  place() {
    placeAt(cursor.x, cursor.rot);
  },
  placeAt(col) {
    cursor = { ...cursor, x: col };
    placeAt(col, cursor.rot);
  },
  preview(col, rot, outside) {
    cursor = { x: col, rot };
    cancelHint = outside;
  },
  cancelled() {
    cancelHint = false;
    sound.cancel();
  },
  pointerPlace(col, rot) {
    placeAt(col, rot);
  },
  undo,
  retry() {
    if (mode === 'menu' || !game) return;
    startGame(game.seed);
  },
  newSeed() {
    if (mode === 'menu') return;
    startGame(randomSeed());
  },
  menu() {
    // オプション・ランキングはメニューから開くので、閉じてメニューに戻る
    if (!ui.options.hidden || !ui.ranking.hidden) {
      showOverlay('menu');
      return;
    }
    goMenu();
  },
  start() {
    if (mode === 'menu' && ui.options.hidden && ui.ranking.hidden) startGame(chosenSeed());
    else if (mode === 'result') startGame(game ? game.seed : chosenSeed());
  },
};

const keyboard = new Keyboard(handlers);
const pointer = new Pointer(
  canvas,
  (x, y) => renderer.columnAt(x, y),
  (x, y) => renderer.isOutside(x, y),
  handlers,
);

function goMenu(): void {
  mode = 'menu';
  game = null;
  anim = null;
  renderer.clearEffects();
  showOverlay('menu');
}

// ---------- 1フレームごとの処理 ----------
function processAnimation(now: number): void {
  if (!anim || !game) return;
  const e = now - anim.start;
  const steps = anim.turn.chain.steps;
  const tl = anim.turn.timeline;
  while (firedPops < steps.length && e >= tl.steps[firedPops].popStart) {
    const step = steps[firedPops];
    renderer.onPop(step, now);
    sound.pop(step.chain);
    revealedScore += step.score;
    revealedMaxChain = Math.max(revealedMaxChain, step.chain);
    firedPops++;
  }
  if (e >= tl.total) {
    if (anim.turn.chain.allClear) {
      renderer.banner('ALL CLEAR', now);
      sound.allClear();
    }
    revealedScore = game.score;
    anim = null;
  }
}

function processEnd(now: number): void {
  if (!game || endAt === null || endHandled || now < endAt) return;
  endHandled = true;
  const elapsed = endAt - startAt + penaltyMs;
  if (game.finished === 'cleared') {
    sound.clear();
    renderer.banner('CLEAR!', now, 1100);
    const rec: RunRecord = {
      timeMs: Math.round(elapsed),
      seed: game.seed,
      maxChain: game.maxChain,
      moves: game.moves,
      undos: game.undos,
      date: new Date().toISOString(),
      controlScheme: options.controlScheme,
    };
    const res = submitRecord(target, rec);
    const g = game;
    window.setTimeout(() => {
      if (game !== g || !g.finished) return;
      showResult('cleared', elapsed, res.rank, res.prevBest?.timeMs, res.prevSeedBest?.timeMs);
    }, 750);
  } else {
    sound.dead();
    renderer.banner('窒息…', now, 1100);
    const g = game;
    window.setTimeout(() => {
      if (game !== g || !g.finished) return;
      showResult('dead', elapsed, null);
    }, 750);
  }
}

function updateHud(now: number, dt: number): void {
  const elapsed = mode === 'menu' ? 0 : (endAt !== null && now >= endAt ? endAt : now) - startAt + penaltyMs;
  ui.time.textContent = formatTime(game ? elapsed : 0);
  const real = revealedScore;
  shownScore += (real - shownScore) * Math.min(1, dt / 70);
  if (Math.abs(real - shownScore) < 1) shownScore = real;
  ui.score.textContent = fmt(Math.round(shownScore));
  ui.bar.style.width = `${Math.min(100, (shownScore / target) * 100)}%`;
  ui.maxchain.textContent = `${revealedMaxChain}連鎖`;
  ui.moves.textContent = String(game?.moves ?? 0);

  // 1手戻すボタン（ネクスト列の下に置く）
  const inPlay = mode === 'playing' && !!game;
  ui.undo.hidden = !inPlay;
  if (inPlay) {
    ui.undo.disabled = !canUndo();
    const slot = renderer.sideSlot();
    const h = ui.undo.offsetHeight;
    ui.undo.style.left = `${slot.left}px`;
    ui.undo.style.top = `${slot.bottom - h}px`;
    ui.undo.style.width = `${slot.width}px`;
  }
  ui.resultUndo.hidden = !(mode === 'result' && game?.finished === 'dead' && game.canUndo());
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(50, now - last);
  last = now;
  keyboard.update(now);
  processAnimation(now);
  processEnd(now);
  updateHud(now, dt);
  renderer.render(
    {
      field: game ? game.field : emptyField,
      anim,
      current: game && !game.finished ? game.current() : null,
      cursor,
      nexts: game ? game.nexts() : [],
      ghost: !!game && !game.finished,
      cancelHint,
    },
    now,
    dt,
  );
  requestAnimationFrame(frame);
}

// メニュー中に盤面に飾りとして並べる宝石
const emptyField = Field.fromRows([
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '......',
  '3.....',
  '20...1',
  '201.31',
  '120331',
  '112002',
]);

// ---------- オーバーレイ ----------
type OverlayName = 'menu' | 'options' | 'ranking' | 'result';
function showOverlay(name: OverlayName | null): void {
  ui.menu.hidden = name !== 'menu';
  ui.options.hidden = name !== 'options';
  ui.ranking.hidden = name !== 'ranking';
  ui.result.hidden = name !== 'result';
  if (name === 'menu') $('start').focus();
}

function showResult(kind: 'cleared' | 'dead', elapsed: number, rank: number | null, prevBest?: number, prevSeedBest?: number): void {
  if (!game) return;
  mode = 'result';
  const kindEl = $('result-kind');
  kindEl.textContent = kind === 'cleared' ? (rank === 1 ? 'NEW RECORD' : 'CLEAR') : '窒息';
  kindEl.classList.toggle('dead', kind === 'dead');
  $('result-time').textContent = formatTime(elapsed);
  const delta = $('result-delta');
  delta.className = 'result-delta';
  if (kind === 'cleared') {
    const parts: string[] = [];
    if (prevBest !== undefined) {
      const d = elapsed - prevBest;
      parts.push(`ベスト ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
      delta.classList.add(d <= 0 ? 'better' : 'worse');
    } else {
      parts.push('初記録');
      delta.classList.add('better');
    }
    if (prevSeedBest !== undefined) {
      const d = elapsed - prevSeedBest;
      parts.push(`このシード ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
    }
    if (rank) parts.push(`${rank}位`);
    delta.textContent = parts.join('　');
  } else {
    delta.textContent = game.canUndo() ? `1手戻すと +${CONFIG.UNDO_PENALTY_MS / 1000}秒で続行できます` : '記録なし';
    delta.classList.add('worse');
  }
  $('result-target').textContent = fmt(target);
  $('result-score').textContent = fmt(game.score);
  $('result-seed').textContent = String(game.seed);
  $('result-chain').textContent = `${game.maxChain}連鎖`;
  $('result-moves').textContent = String(game.moves);
  $('result-undos').textContent = String(game.undos);
  showOverlay('result');
  $('retry').focus();
}

// ---------- メニューの組み立て ----------
function renderTargets(): void {
  ui.targets.replaceChildren(
    ...CONFIG.TARGETS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.textContent = targetLabel(t);
      b.setAttribute('aria-pressed', String(t === target));
      b.addEventListener('click', () => {
        target = t;
        renderTargets();
      });
      return b;
    }),
  );
}

function setSeedMode(m: 'random' | 'fixed'): void {
  seedMode = m;
  ui.seedRandom.setAttribute('aria-pressed', String(m === 'random'));
  ui.seedFixed.setAttribute('aria-pressed', String(m === 'fixed'));
  ui.seedInput.disabled = m === 'random';
  if (m === 'fixed') ui.seedInput.focus();
}

function renderHowto(): void {
  const arrow =
    '<b>キーボード</b>　<kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Z</kbd><kbd>X</kbd> 回転　<kbd>↓</kbd>/<kbd>↑</kbd> 設置';
  const direct =
    '<b>キーボード</b>　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 子ぷよの向き　<kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd><kbd>\'</kbd> その列に設置';
  const common =
    '<b>タッチ</b>　列をタップで縦置き、フリックで子ぷよの向き。盤面の外まで引っぱるか2本目の指でタップすると取り消し（マウスは右クリック）<br><kbd>Q</kbd> 1手戻す(+5秒)　<kbd>R</kbd> リトライ　<kbd>N</kbd> 新しいシード　<kbd>Esc</kbd> メニュー';
  const key = options.controlScheme === 'arrow' ? arrow : direct;
  ui.howto.innerHTML = `${key}<br>${common}`;
  ui.keyhelp.innerHTML = `${key.replace('<b>キーボード</b>　', '')}<br><kbd>Q</kbd>/<kbd>BS</kbd> 1手戻す(+5秒)<br><kbd>R</kbd> リトライ　<kbd>N</kbd> 新シード<br><kbd>Esc</kbd> メニュー`;
}

function applyOptions(): void {
  keyboard.scheme = options.controlScheme;
  pointer.threshold = options.flickThreshold;
  sound.setVolume(options.sfxVolume);
  for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === options.controlScheme));
  }
  for (const b of $('opt-spawn').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnMode));
  }
  const flick = $<HTMLInputElement>('opt-flick');
  flick.value = String(options.flickThreshold);
  $('opt-flick-out').textContent = `${options.flickThreshold}px`;
  const vol = $<HTMLInputElement>('opt-volume');
  vol.value = String(options.sfxVolume);
  $('opt-volume-out').textContent = `${Math.round(options.sfxVolume * 100)}%`;
  renderHowto();
  saveOptions(options);
}

function renderRanking(): void {
  ui.rankTabs.replaceChildren(
    ...CONFIG.TARGETS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.textContent = targetLabel(t);
      b.setAttribute('aria-pressed', String(t === rankTarget));
      b.addEventListener('click', () => {
        rankTarget = t;
        renderRanking();
      });
      return b;
    }),
  );
  ui.rankNote.hidden = configSignature() === 'default';
  const list = getRanking(rankTarget);
  if (list.length === 0) {
    ui.rankBody.innerHTML = '<tr><td class="empty" colspan="7">まだ記録がありません。最初の1本を走ろう。</td></tr>';
    return;
  }
  ui.rankBody.replaceChildren(
    ...list.map((r, i) => {
      const tr = document.createElement('tr');
      if (i === 0) tr.className = 'top';
      const d = new Date(r.date);
      const cells = [
        String(i + 1),
        formatTime(r.timeMs),
        String(r.seed),
        `${r.maxChain}`,
        String(r.moves),
        String(r.undos ?? 0),
        `${d.getMonth() + 1}/${d.getDate()}`,
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.append(td);
      }
      return tr;
    }),
  );
}

// ---------- イベント ----------
ui.seedRandom.addEventListener('click', () => setSeedMode('random'));
ui.seedFixed.addEventListener('click', () => setSeedMode('fixed'));
$('start').addEventListener('click', () => startGame(chosenSeed()));
$('open-options').addEventListener('click', () => showOverlay('options'));
$('close-options').addEventListener('click', () => showOverlay('menu'));
$('open-ranking').addEventListener('click', () => {
  rankTarget = target;
  renderRanking();
  showOverlay('ranking');
});
$('close-ranking').addEventListener('click', () => showOverlay('menu'));
$('retry').addEventListener('click', () => handlers.retry());
$('new-seed').addEventListener('click', () => handlers.newSeed());
$('to-menu').addEventListener('click', goMenu);
ui.undo.addEventListener('click', undo);
ui.resultUndo.addEventListener('click', undo);

for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
  b.addEventListener('click', () => {
    options = { ...options, controlScheme: b.dataset.value as Options['controlScheme'] };
    applyOptions();
  });
}
for (const b of $('opt-spawn').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
  b.addEventListener('click', () => {
    options = { ...options, spawnMode: b.dataset.value as Options['spawnMode'] };
    applyOptions();
  });
}
$<HTMLInputElement>('opt-flick').addEventListener('input', (e) => {
  options = { ...options, flickThreshold: Number((e.target as HTMLInputElement).value) };
  applyOptions();
});
$<HTMLInputElement>('opt-volume').addEventListener('input', (e) => {
  options = { ...options, sfxVolume: Number((e.target as HTMLInputElement).value) };
  applyOptions();
  sound.unlock();
  sound.pop(3);
});
const clearBtn = $<HTMLButtonElement>('clear-records');
clearBtn.addEventListener('click', () => {
  if (clearBtn.dataset.armed === 'true') {
    clearRecords();
    clearBtn.dataset.armed = 'false';
    clearBtn.textContent = '削除しました';
    return;
  }
  clearBtn.dataset.armed = 'true';
  clearBtn.textContent = 'もう一度押すと削除';
  window.setTimeout(() => {
    clearBtn.dataset.armed = 'false';
    clearBtn.textContent = '記録をすべて削除';
  }, 3000);
});

new ResizeObserver(() => renderer.resize()).observe($('stage'));

// ---------- 起動 ----------
renderTargets();
applyOptions();
showOverlay('menu');
requestAnimationFrame(frame);
