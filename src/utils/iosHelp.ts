/**
 * ラボ練習ターミナルの Cisco IOS 風 `?` コンテキスト依存ヘルプ、および
 * Tab 補完で共有する純粋ロジック層。
 *
 * 本モジュールは副作用を持たない純粋関数と定数のみを公開する。
 * UI（React 状態・フォーカス・スクロール）は統合層（LabPanel.tsx）が担う。
 */

import type { CliMode } from './iosCli';
import type { LabTask } from '../types';

/**
 * ヘルプ／Tab 補完で共有する共通コマンド語彙。
 *
 * 各問題の expected_commands は「その問題の正解」だけを含むため、
 * 問題に依存しない主要な Cisco IOS / CCNA コマンドをここで補う。
 * 文脈依存ヘルプは「フレーズの先頭単語列に一致した次の単語」を提示するため、
 * 複数単語コマンドはフレーズのまま列挙する（例: 'ip access-list extended'）。
 */
export const COMMON_COMMANDS: string[] = [
  // --- EXEC / 基本 ---
  'enable', 'disable', 'exit', 'end',
  'configure terminal',
  'write', 'write memory',
  'copy running-config startup-config',
  'reload', 'ping', 'traceroute',
  'no shutdown', 'shutdown',

  // --- show 系 ---
  'show running-config', 'show startup-config',
  'show ip interface brief', 'show interfaces', 'show interfaces status',
  'show ip route', 'show version',
  'show vlan brief', 'show mac address-table',
  'show ip protocols', 'show ip ospf neighbor', 'show ip ospf interface',
  'show cdp neighbors', 'show lldp neighbors',
  'show access-lists', 'show ip access-lists',
  'show etherchannel summary', 'show spanning-tree',
  'show port-security', 'show standby',

  // --- グローバル設定 ---
  'hostname',
  'banner motd',
  'no ip domain-lookup', 'ip domain-name',
  'service password-encryption',
  'enable secret', 'enable password',
  'username',
  'ip default-gateway',
  'ip name-server',
  'ip dhcp pool', 'ip dhcp excluded-address',
  'ipv6 unicast-routing',
  'spanning-tree mode', 'spanning-tree vlan', 'spanning-tree portfast default',
  'cdp run', 'no cdp run', 'lldp run', 'no lldp run',

  // --- ルーティング ---
  'ip route', 'ipv6 route',
  'router ospf', 'router eigrp', 'router rip', 'router bgp',
  'network', 'passive-interface', 'default-information originate',
  'router-id', 'redistribute',

  // --- ACL ---
  'access-list',
  'ip access-list standard', 'ip access-list extended',
  'permit', 'deny', 'remark',
  'access-class', 'ip access-group',

  // --- NAT ---
  'ip nat inside', 'ip nat outside',
  'ip nat inside source', 'ip nat pool',

  // --- インターフェース ---
  'interface', 'interface range', 'interface vlan', 'interface loopback',
  'ip address', 'ipv6 address',
  'description',
  'duplex', 'speed',
  'switchport', 'switchport mode access', 'switchport mode trunk',
  'switchport access vlan', 'switchport voice vlan',
  'switchport trunk allowed vlan', 'switchport trunk native vlan',
  'switchport trunk encapsulation dot1q',
  'switchport port-security',
  'trunk', 'allowed', 'native',
  'channel-group', 'mode', 'active', 'passive', 'on',
  'port-channel', 'ethernet', 'gigabitethernet', 'fastethernet',
  'no cdp enable', 'lldp transmit', 'lldp receive',

  // --- VLAN ---
  'vlan', 'name',

  // --- line / 管理アクセス ---
  'line console', 'line vty', 'line aux',
  'login', 'login local', 'password', 'transport input',
  'logging synchronous', 'exec-timeout',

  // --- NTP / SNMP / その他 ---
  'ntp server', 'ntp master',
  'snmp-server community', 'snmp-server host', 'snmp-server location',
  'clock set',
  'do',
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

/**
 * デバイスのタスク expected_commands と COMMON_COMMANDS を
 * 「コマンドフレーズ（複数単語）」のまま列挙する。
 * ヘルプの文脈依存候補生成（直前までに打った単語列に一致するフレーズの
 * 次の単語を提示する）に用いる。
 */
export function buildCommandPhrases(tasks: LabTask[], device: string): string[] {
  return [
    ...tasks.filter((t) => t.device === device).flatMap((t) => t.expected_commands),
    ...COMMON_COMMANDS,
  ];
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
 * 分類結果とコマンドフレーズ一覧から、画面表示用の候補配列を生成する（文脈依存）。
 *
 * `preservedInput`（? を除いた入力途中の文字列）を単語に分解し、
 * 「直前までに確定した単語列（contextWords）」に前方一致するフレーズだけを対象に、
 * その「次の単語」を候補として提示する。実機 Cisco IOS の `?` と同じ挙動:
 * - `?`            → 各フレーズの先頭単語（＝トップレベルコマンド一覧）
 * - `configure ?`  → 先頭が configure のフレーズの 2 番目の単語（terminal など）
 * - `sh?`          → 先頭が sh… で始まるフレーズの先頭単語（show, shutdown）
 * - `configure t?` → configure に続く単語のうち t… で始まるもの（terminal）
 *
 * full の場合は末尾に確定単語列のみ（次単語の絞り込みなし）、
 * word の場合は最後の部分語（prefix）に大文字小文字を区別せず前方一致する次単語のみ。
 *
 * いずれの候補も値トークン（数字を含む or ',' を含む or 空）を除外し、
 * 重複を除去したうえで大文字小文字を区別しない辞書順に整列して返す。
 * 値トークン除外処理が例外を投げた場合は、未フィルタの候補一覧を返す（要件 2.6）。
 */
export function generateHelpCandidates(
  query: HelpQuery,
  phrases: string[],
): string[] {
  if (query.kind === 'none') return [];

  // preservedInput を単語列に分解
  const tokens = query.preservedInput.trim().split(/\s+/).filter((t) => t.length > 0);

  // 文脈語（既に確定した単語列）と、絞り込み用の部分語を決定
  let contextWords: string[];
  let partial: string;
  if (query.kind === 'full') {
    // 末尾が空白（or 空）→ 全単語が確定済み。次単語は絞り込まない
    contextWords = tokens;
    partial = '';
  } else {
    // 末尾が非空白 → 最後の単語が入力途中の部分語
    contextWords = tokens.slice(0, -1);
    partial = query.prefix.toLowerCase();
  }

  // 各フレーズを単語分解し、contextWords に前方一致するものの「次の単語」を集める
  const ctxLen = contextWords.length;
  const lowerCtx = contextWords.map((w) => w.toLowerCase());
  const candidates: string[] = [];
  for (const phrase of phrases) {
    const pw = phrase.split(/\s+/);
    if (pw.length <= ctxLen) continue; // 次の単語が存在しない
    let matches = true;
    for (let i = 0; i < ctxLen; i++) {
      if (pw[i].toLowerCase() !== lowerCtx[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const nextWord = pw[ctxLen];
    if (partial && !nextWord.toLowerCase().startsWith(partial)) continue;
    candidates.push(nextWord);
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
