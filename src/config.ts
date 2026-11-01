/**
 * どぱぷよ 設定定数
 * ここを書き換えるだけでゲームのテンポやルールを調整できる。
 * デフォルト値から変えた場合、ランキングは別枠で記録される（configSignature 参照）。
 */
export const CONFIG = {
  // ---- 連鎖・設置の演出時間（ミリ秒）----
  /** 1連鎖の消去演出時間 */
  CHAIN_POP_MS: 150,
  /** 消去後のぷよの落下時間（1段あたり） */
  CHAIN_FALL_MS_PER_ROW: 8,
  /** 連鎖間の待ち時間 */
  CHAIN_GAP_MS: 30,
  /** 設置時の落下時間（ちぎれ落下含む、1段あたり） */
  PLACE_FALL_MS_PER_ROW: 5,
  /** 1手戻すときのタイムペナルティ */
  UNDO_PENALTY_MS: 5000,

  // ---- ルール ----
  /** 色数（3〜5） */
  COLOR_COUNT: 4,
  /** 全消しボーナス（次の連鎖の1連鎖目に加算） */
  ALL_CLEAR_BONUS: 2100,
  /** シード数（1〜SEED_COUNT） */
  SEED_COUNT: 65536,
  /** ツモのループ手数 */
  TSUMO_LOOP: 128,
  /** 最初の2手の色数上限 */
  OPENING_COLOR_LIMIT: 3,
  /** ネクスト表示数 */
  NEXT_COUNT: 2,
  /** 目標点の一覧 */
  TARGETS: [100_000, 300_000, 500_000, 1_000_000, 10_000_000] as number[],

  // ---- 操作 ----
  /** 矢印キー長押しで連続移動が始まるまでの時間 */
  DAS_MS: 110,
  /** 連続移動の間隔（0で壁まで瞬間移動） */
  ARR_MS: 25,
} as const;

/** ランキングの公平性に関わる定数だけを取り出した署名 */
const FAIRNESS_KEYS = [
  'CHAIN_POP_MS',
  'CHAIN_FALL_MS_PER_ROW',
  'CHAIN_GAP_MS',
  'PLACE_FALL_MS_PER_ROW',
  'UNDO_PENALTY_MS',
  'COLOR_COUNT',
  'ALL_CLEAR_BONUS',
  'SEED_COUNT',
  'TSUMO_LOOP',
  'OPENING_COLOR_LIMIT',
] as const;

const DEFAULT_SIGNATURE = '150|8|30|5|5000|4|2100|65536|128|3';

/** デフォルト設定なら 'default'、変更されていればその内容を表す文字列 */
export function configSignature(): string {
  const sig = FAIRNESS_KEYS.map((k) => String(CONFIG[k])).join('|');
  return sig === DEFAULT_SIGNATURE ? 'default' : sig;
}

// ---- フィールド寸法（ルール準拠のため固定）----
export const COLS = 6;
/** 表示される段数 */
export const VISIBLE_ROWS = 12;
/** 保持できる段数（13段目まで）。14段目に入ったぷよは消滅 */
export const STORED_ROWS = 13;
/** 窒息判定の列（0始まりで3列目） */
export const DEATH_COL = 2;
