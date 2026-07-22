/**
 * ラボ練習ターミナルの Cisco IOS 風 `?` コンテキスト依存ヘルプ、および
 * Tab 補完で共有する純粋ロジック層。
 *
 * 本モジュールは副作用を持たない純粋関数と定数のみを公開する。
 * UI（React 状態・フォーカス・スクロール）は統合層（LabPanel.tsx）が担う。
 */

import type { CliMode } from './iosCli';
import type { LabTask } from '../types';

/** ヘルプ／Tab 補完で共有する共通コマンド語彙 */
export const COMMON_COMMANDS: string[] = [
  'enable', 'disable', 'exit', 'end',
  'configure terminal',
  'write', 'write memory',
  'copy running-config startup-config',
  'show running-config', 'show startup-config',
  'show ip interface brief', 'show interfaces', 'show vlan brief',
  'show ip route', 'show version',
  'no shutdown', 'shutdown',
  'interface', 'interface range',
  'switchport', 'trunk', 'allowed', 'vlan', 'native',
  'channel-group', 'mode', 'active', 'passive', 'on',
  'port-channel', 'ethernet', 'gigabitethernet', 'fastethernet',
];

/** 候補が 1 件も存在しないときに表示する非空メッセージ */
export const NO_CANDIDATES_MESSAGE = '% No matching commands';

/** ヘルプクエリの分類結果 */
export type HelpQuery =
  | { kind: 'none' } // ? を含まない、ヘルプではない
  | { kind: 'full'; preservedInput: string } // Full_Help_Query
  | { kind: 'word'; prefix: string; preservedInput: string }; // Word_Help_Query

/**
 * トークンが値トークン（数字を含む or ',' を含む or 空）かどうか。
 * 既存 Tab 補完のインラインロジックと完全に同一。
 */
export function isValueToken(tok: string): boolean {
  return /[0-9,]/.test(tok) || tok.length === 0;
}

/**
 * デバイスのタスク expected_commands と COMMON_COMMANDS から
 * 小文字化・値トークン除外済みの語彙集合を構築する。
 * （既存 Tab 補完のインラインロジックを移設したもの。挙動不変）
 *
 * @param cliMode 将来のモード別絞り込み拡張のための引数。
 *   現時点では既存挙動（デバイス単位）を維持するため候補集合には影響しない。
 */
export function buildVocabulary(
  tasks: LabTask[],
  device: string,
  cliMode: CliMode,
): Set<string> {
  // cliMode は将来のモード別絞り込み用に受け取るが、現時点では未使用。
  // 既存 Tab 補完と同一のデバイス単位挙動を維持する。
  void cliMode;

  const allCommands = [
    ...tasks.filter((t) => t.device === device).flatMap((t) => t.expected_commands),
    ...COMMON_COMMANDS,
  ];

  const vocabulary = new Set<string>();
  for (const cmd of allCommands) {
    for (const tok of cmd.split(/\s+/)) {
      if (!isValueToken(tok)) vocabulary.add(tok.toLowerCase());
    }
  }
  return vocabulary;
}

/** 部分語として抽出する末尾非空白文字列の最大長 */
const MAX_PREFIX_LENGTH = 256;

/**
 * 生成されるヘルプクエリを分類する。
 * - 統合層は key==='?' を検知した時点で input（? を含まない現在値）を渡す。
 * - classifyHelpQuery は「input の末尾に ? が付いた」状態として解釈する。
 *
 * 判定仕様:
 * - 空文字列、または末尾が 1 文字以上の空白（`/\s$/`）→ `{ kind: 'full', preservedInput: input }`
 * - 末尾が非空白 → 末尾の連続非空白文字列（最大 256 文字）を `prefix` として抽出し
 *   `{ kind: 'word', prefix, preservedInput: input }`
 * - `preservedInput` は渡された `input` をそのまま（`?` を含まず、順序・内容不変）返す。
 *
 * 本関数は `kind: 'none'` を返さない（`none` は `?` 以外の通常経路を型で表すためのもの）。
 */
export function classifyHelpQuery(inputBeforeQuestion: string): HelpQuery {
  // 空文字列 or 末尾が空白 → Full Help
  if (inputBeforeQuestion.length === 0 || /\s$/.test(inputBeforeQuestion)) {
    return { kind: 'full', preservedInput: inputBeforeQuestion };
  }

  // 末尾が非空白 → 末尾の連続非空白文字列を抽出
  const match = inputBeforeQuestion.match(/(\S+)$/);
  const run = match ? match[1] : '';
  // 最大 256 文字にキャップ（超過分は末尾 256 文字を採用）
  const prefix =
    run.length > MAX_PREFIX_LENGTH ? run.slice(run.length - MAX_PREFIX_LENGTH) : run;

  return { kind: 'word', prefix, preservedInput: inputBeforeQuestion };
}

/**
 * 候補一覧から値トークン（数字を含む or ',' を含む or 空）を除外する独立ヘルパ。
 * `generateHelpCandidates` からのみ呼ばれ、失敗時のフォールバックを分離するために切り出している。
 */
function filterValueTokens(candidates: string[]): string[] {
  return candidates.filter((c) => !isValueToken(c));
}

/**
 * 分類結果と語彙から、画面表示用の候補配列を生成する。
 * - `none`: 空配列を返す。
 * - `full`: 語彙全件を対象とする。
 * - `word`: `prefix` に大文字小文字を区別せず前方一致する語を対象とする
 *   （語彙上の元の表記を保持する）。
 *
 * いずれの候補も値トークン（数字を含む or ',' を含む or 空）を除外し、
 * 重複を除去したうえで大文字小文字を区別しない辞書順に整列して返す。
 * 値トークン除外処理が例外を投げた場合は、未フィルタの候補一覧を返す（要件 2.6）。
 */
export function generateHelpCandidates(
  query: HelpQuery,
  vocabulary: Set<string>,
): string[] {
  if (query.kind === 'none') return [];

  // 対象候補の抽出（full: 全件、word: 前方一致）
  const all = [...vocabulary];
  let candidates: string[];
  if (query.kind === 'full') {
    candidates = all;
  } else {
    const lowerPrefix = query.prefix.toLowerCase();
    candidates = all.filter((c) => c.toLowerCase().startsWith(lowerPrefix));
  }

  // 値トークン除外（独立ヘルパを try/catch で保護。失敗時は未フィルタを返す）
  let filtered: string[];
  try {
    filtered = filterValueTokens(candidates);
  } catch {
    filtered = candidates;
  }

  // 重複除去
  const deduped = [...new Set(filtered)];

  // 大文字小文字を区別しない辞書順ソート（等価時は元表記で安定化）
  deduped.sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return deduped;
}
