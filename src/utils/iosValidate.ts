/**
 * 入力コマンドが「そのモードで実際に入力できるか」を判定する。
 *
 * 実機の IOS は認識できない入力をその場で拒否する:
 *   Sw1(config-if)#switchport trunk allowed 303
 *                                          ^
 *   % Invalid input detected at '^' marker.
 * 本モジュールはこれを再現するための判定とキャレット位置を提供する。
 *
 * 判定基準は `?` ヘルプが使うモード別コマンド語彙（iosHelp.MODE_COMMANDS）。
 * ヘルプで出てくるコマンドは通り、出てこないものは弾かれる、という一貫した挙動になる。
 */

import type { CliMode } from './iosCli';
import { normalizeCommand } from './iosCommand';
import { commandsForMode } from './iosHelp';

/** 判定結果 */
export interface ValidationResult {
  valid: boolean;
  /**
   * 不正な場合、入力文字列中でキャレット（^）を指す位置（0 始まり）。
   * 実機同様「最初に解釈できなくなったトークン」の先頭を指す。
   */
  caretIndex: number;
}

/** 実機の構文エラーメッセージ */
export const INVALID_INPUT_MESSAGE = "% Invalid input detected at '^' marker.";

/**
 * そのモードで有効なコマンドかを判定する。
 *
 * 語彙には `?` のトップレベル一覧用に 1 語だけの項目（'ip' など）と、
 * ドリルダウン用の複数語フレーズ（'ip route' など）が混在している。
 * 1 語項目だけで判定すると 'ip address'（インターフェース専用）が config でも
 * 通ってしまうため、同じ先頭語を持つ複数語フレーズがある場合はそちらとの
 * 前方一致を要求する。
 *
 * 語彙側はインターフェース種別までしか持たない（'interface ethernet'）ので、
 * フレーズ最終語だけは前方一致で 'ethernet0/1' のような実引数を許容する。
 */
export function isAvailableInMode(norm: string, mode: CliMode): boolean {
  const tokens = norm.split(' ');
  const head = tokens[0];

  // config-if から続けて別の interface を選ぶ形は実機でも一般的
  if (mode === 'config-if' && head === 'interface') return true;

  const phrases = commandsForMode(mode)
    .map((p) => p.split(/\s+/))
    .filter((pw) => pw[0].toLowerCase() === head);

  if (phrases.length === 0) return false;

  const multi = phrases.filter((pw) => pw.length > 1);
  for (const pw of multi) {
    if (pw.length > tokens.length) continue;
    const matched = pw.every((w, i) => {
      const lw = w.toLowerCase();
      return i === pw.length - 1 ? tokens[i].startsWith(lw) : tokens[i] === lw;
    });
    if (matched) return true;
  }
  // 1 語で完結するコマンド（exit / end / permit など）
  if (tokens.length === 1) return true;
  // 複数語フレーズが登録されていない先頭語（'name SALES' の name 等）は判定不能なので許容
  if (multi.length === 0) return true;
  return false;
}

/**
 * トークン列が、そのモードのコマンド語彙ツリー上で「有効な途中経路」かを判定する。
 * 完全なコマンドである必要はない（'switchport trunk allowed' のような途中でも true）。
 * キャレット位置の算出にのみ使う。
 */
function isValidPrefixPath(norm: string, mode: CliMode): boolean {
  const tokens = norm.split(' ');
  for (const phrase of commandsForMode(mode)) {
    const pw = phrase.split(/\s+/);
    if (pw.length < tokens.length) continue;
    const matched = tokens.every((t, i) => {
      const lw = pw[i].toLowerCase();
      // 最終トークンはインターフェース名など実引数を許容するため前方一致
      return i === tokens.length - 1 ? t.startsWith(lw) || lw.startsWith(t) : t === lw;
    });
    if (matched) return true;
  }
  return false;
}

/**
 * 生の入力文字列を検証する。
 * 不正な場合は、実機同様「どのトークンから解釈できなくなったか」を探して
 * キャレット位置を返す。
 */
export function validateCommand(rawInput: string, mode: CliMode): ValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) return { valid: true, caretIndex: 0 };

  const norm = normalizeCommand(trimmed);
  if (!norm) return { valid: true, caretIndex: 0 };

  if (isAvailableInMode(norm, mode)) return { valid: true, caretIndex: 0 };

  // 「どこまでは語彙ツリー上の正しい経路だったか」を探す。
  // 実機のキャレットは最初に解釈できなくなったトークンを指すため、
  // 完全なコマンドである必要はなく、途中経路として有効であればよい。
  // 例: "switchport trunk allowed 303" は "switchport trunk allowed" までは
  //     "switchport trunk allowed vlan" の途中経路なので、キャレットは 303 を指す。
  const rawTokens = trimmed.split(/\s+/);
  let validPrefixTokens = 0;
  for (let n = rawTokens.length - 1; n >= 1; n--) {
    const partial = normalizeCommand(rawTokens.slice(0, n).join(' '));
    if (partial && isValidPrefixPath(partial, mode)) {
      validPrefixTokens = n;
      break;
    }
  }

  // 有効な接頭辞の直後のトークン開始位置を、元の文字列上で求める
  let caretIndex = 0;
  if (validPrefixTokens > 0) {
    // 元の入力（trim 済み）で validPrefixTokens 個のトークンを飛ばした位置
    const re = new RegExp(`^(?:\\s*\\S+){${validPrefixTokens}}\\s*`);
    const m = re.exec(trimmed);
    caretIndex = m ? m[0].length : 0;
  }
  // 先頭語そのものが不正なら先頭を指す
  return { valid: false, caretIndex };
}

/** キャレット行（プロンプト幅ぶん字下げした `^`）を生成する */
export function buildCaretLine(promptLength: number, caretIndex: number): string {
  return ' '.repeat(Math.max(0, promptLength + caretIndex)) + '^';
}
