import { configSignature } from './config';

export type ControlScheme = 'arrow' | 'direct';
export type SpawnMode = 'reset' | 'keep';
/** タッチ操作: 片手（タップ列＋フリック）／両手（左で列・右で向き） */
export type TouchScheme = 'single' | 'twohand';

export interface Options {
  controlScheme: ControlScheme;
  /** 置いた後の次ペアの列（3列目に戻す／引き継ぐ） */
  spawnCol: SpawnMode;
  /** 置いた後の次ペアの子ぷよの向き（上に戻す／引き継ぐ） */
  spawnRot: SpawnMode;
  touchScheme: TouchScheme;
  /** フリック判定のしきい値（px） */
  flickThreshold: number;
  /** 両手モードで1列動かすのに必要なスワイプ距離（px） */
  columnStep: number;
  /** 効果音の音量 0〜1 */
  sfxVolume: number;
}

export interface RunRecord {
  timeMs: number;
  seed: number;
  maxChain: number;
  moves: number;
  /** 1手戻した回数 */
  undos?: number;
  date: string;
  controlScheme: ControlScheme;
}

const OPTIONS_KEY = 'dopapuyo.options.v1';
// 配ぷよの作り方を変えるたびに版を上げ、前の記録とは分けて保存する（v3: チャレンジモード風の配ぷよ）
const RECORDS_KEY = 'dopapuyo.records.v3';
const RANK_LIMIT = 10;

export const DEFAULT_OPTIONS: Options = {
  controlScheme: 'arrow',
  spawnCol: 'reset',
  spawnRot: 'reset',
  touchScheme: 'single',
  flickThreshold: 24,
  columnStep: 32,
  sfxVolume: 0.7,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモードなど）では記録しない
  }
}

export function loadOptions(): Options {
  const saved = read<Partial<Options> & { spawnMode?: SpawnMode }>(OPTIONS_KEY, {});
  // 列と向きを別々に設定できるようになる前の保存形式（spawnMode が両方を兼ねていた）
  const { spawnMode, ...rest } = saved;
  const legacy = spawnMode ? { spawnCol: spawnMode, spawnRot: spawnMode } : {};
  return { ...DEFAULT_OPTIONS, ...legacy, ...rest };
}

export function saveOptions(o: Options): void {
  write(OPTIONS_KEY, o);
}

interface RecordStore {
  /** key: `${signature}|${target}` → 上位記録 */
  top: Record<string, RunRecord[]>;
  /** key: `${signature}|${target}|${seed}` → そのシードの自己ベスト */
  seedBest: Record<string, RunRecord>;
}

function loadStore(): RecordStore {
  const s = read<Partial<RecordStore>>(RECORDS_KEY, {});
  return { top: s.top ?? {}, seedBest: s.seedBest ?? {} };
}

const topKey = (target: number) => `${configSignature()}|${target}`;
const seedKey = (target: number, seed: number) => `${configSignature()}|${target}|${seed}`;

export function getRanking(target: number): RunRecord[] {
  return loadStore().top[topKey(target)] ?? [];
}

export function getSeedBest(target: number, seed: number): RunRecord | undefined {
  return loadStore().seedBest[seedKey(target, seed)];
}

export interface SubmitResult {
  /** ランキング内の順位（1始まり）。圏外なら null */
  rank: number | null;
  /** 記録前の全体ベスト */
  prevBest?: RunRecord;
  /** 記録前のこのシードのベスト */
  prevSeedBest?: RunRecord;
}

export function submitRecord(target: number, rec: RunRecord): SubmitResult {
  const store = loadStore();
  const tk = topKey(target);
  const sk = seedKey(target, rec.seed);
  const list = store.top[tk] ?? [];
  const prevBest = list[0];
  const prevSeedBest = store.seedBest[sk];

  const next = [...list, rec].sort((a, b) => a.timeMs - b.timeMs).slice(0, RANK_LIMIT);
  const idx = next.indexOf(rec);
  store.top[tk] = next;
  if (!prevSeedBest || rec.timeMs < prevSeedBest.timeMs) store.seedBest[sk] = rec;
  write(RECORDS_KEY, store);
  return { rank: idx >= 0 ? idx + 1 : null, prevBest, prevSeedBest };
}

export function clearRecords(): void {
  write(RECORDS_KEY, { top: {}, seedBest: {} });
}
