/**
 * Cisco IOS コマンドを正規化して比較できるようにするユーティリティ。
 * - 大文字小文字を区別しない
 * - 余分な空白を1つに
 * - 主要な短縮形を完全形に展開（int → interface, conf t → configure terminal など）
 */

import { applyCommand, INITIAL_STATE, type CliState } from './iosCli';

const ABBREVIATIONS: Array<[RegExp, string]> = [
  // モード遷移系
  [/^en$/i, 'enable'],
  [/^ena$/i, 'enable'],
  [/^conf$/i, 'configure terminal'],
  [/^conf t$/i, 'configure terminal'],
  [/^configure$/i, 'configure terminal'],
  [/^configure t$/i, 'configure terminal'],
  [/^configure ter$/i, 'configure terminal'],
  [/^dis$/i, 'disable'],
  [/^ex$/i, 'exit'],
  [/^exi$/i, 'exit'],

  // インターフェース短縮
  [/\bint\b/gi, 'interface'],
  [/\binter\b/gi, 'interface'],
  // interface range の range 短縮（int ra / int ran / int rang → interface range）
  [/^interface r(a(n(g(e)?)?)?)?\b/i, 'interface range'],

  // インターフェース名短縮（gi/gig/g0/0 → GigabitEthernet0/0 など）
  [/\bgi(\d+)\b/gi, 'GigabitEthernet$1'],
  [/\bgig(\d+)\b/gi, 'GigabitEthernet$1'],
  [/\bg(\d+\/\d+)\b/gi, 'GigabitEthernet$1'],
  [/\bfa(\d+)\b/gi, 'FastEthernet$1'],
  [/\bf(\d+\/\d+)\b/gi, 'FastEthernet$1'],
  [/\bte(\d+)\b/gi, 'TenGigabitEthernet$1'],
  [/\bse(\d+)\b/gi, 'Serial$1'],
  [/\bs(\d+\/\d+)\b/gi, 'Serial$1'],
  [/\blo(\d+)\b/gi, 'Loopback$1'],
  [/\bvl(an)?(\d+)\b/gi, 'Vlan$2'],
  // Ethernet 短縮: e0/0, eth0/0 → Ethernet0/0
  [/\beth(\d+\/\d+)\b/gi, 'Ethernet$1'],
  [/\be(\d+\/\d+)\b/gi, 'Ethernet$1'],

  // SwitchPort
  [/\bsw\b/gi, 'switchport'],

  // よくある語の短縮
  [/\bdesc\b/gi, 'description'],
  [/\bsh\b/gi, 'show'],
  [/\bsho\b/gi, 'show'],
  [/\bno sh\b/gi, 'no shutdown'],
  [/\bno shut\b/gi, 'no shutdown'],

  // 保存系: write 系も copy run start 系もすべて同一の「保存」として
  // canonical 形（copy running-config startup-config）に寄せる。
  // これにより write memory と copy running-config startup-config が採点上等価になる。
  [/^wr$/i, 'copy running-config startup-config'],
  [/^wr\s+m$/i, 'copy running-config startup-config'],
  [/^wr\s+mem(ory)?$/i, 'copy running-config startup-config'],
  [/^write$/i, 'copy running-config startup-config'],
  [/^write\s+mem(ory)?$/i, 'copy running-config startup-config'],
  [/^copy\s+run(ning)?(-config)?\s+start(up)?(-config)?$/i, 'copy running-config startup-config'],
  [/^copy\s+r\s+s$/i, 'copy running-config startup-config'],
];

/**
 * `interface range` コマンドを「構成メンバーのインターフェース集合」に正規化する。
 * ダッシュ前後のスペース有無や短縮（e0/1-3 / e0/1 - 3 等）の表記ゆれを吸収し、
 * 同じ範囲を指す入力を同一文字列に揃える。
 * 例: "interface range ethernet0/0 - 1" → "interface range ethernet0/0,ethernet0/1"
 */
function canonicalizeInterfaceRange(input: string): string {
  const m = input.match(/^interface range (.+)$/i);
  if (!m) return input;
  // ダッシュ前後の空白を除去して統一
  const spec = m[1].trim().toLowerCase().replace(/\s*-\s*/g, '-');
  // 単一レンジ: <type><module>/<startPort>-<end>（end はポート番号 or フル表記）
  const rm = spec.match(/^([a-z][a-z-]*?)(\d+)\/(\d+)-(.+)$/);
  if (rm) {
    const [, type, module, startStr, endPart] = rm;
    const start = parseInt(startStr, 10);
    const endMatch = endPart.match(/(\d+)\s*$/);
    if (endMatch) {
      const end = parseInt(endMatch[1], 10);
      if (end >= start && end - start < 64) {
        const members: string[] = [];
        for (let p = start; p <= end; p++) members.push(`${type}${module}/${p}`);
        return `interface range ${members.join(',')}`;
      }
    }
  }
  // 解析できない場合はダッシュ間隔だけ統一して返す
  return `interface range ${spec}`;
}

export function normalizeCommand(cmd: string): string {
  let s = cmd.trim();
  if (!s) return '';
  // タブや連続スペースを1つに
  s = s.replace(/\s+/g, ' ');
  // 短縮を展開
  for (const [re, rep] of ABBREVIATIONS) {
    s = s.replace(re, rep);
  }
  // 末尾セミコロンや余計な記号は除去
  s = s.replace(/[;]+$/, '').trim();
  // interface range はメンバー集合へ正規化（表記ゆれ吸収）
  if (/^interface range /i.test(s)) {
    s = canonicalizeInterfaceRange(s);
  }
  // 小文字化（大半の比較は大文字小文字無視で良い）
  return s.toLowerCase();
}

/**
 * コマンド列を先頭から実行してモード遷移を追跡し、各コマンドを
 * 「実行時のコンテキスト（モード＋インターフェース等）＋正規化コマンド」の
 * キーとして返す。これにより、同じコマンド文字列でも異なるインターフェースで
 * 打たれたものを区別できる。
 */
/**
 * 「グローバル設定(config)専用」で、インターフェース等のサブモードには属さないコマンド。
 * 模範解答内で（exit省略により）サブモード文脈に現れても、常に config レベルで判定する。
 * ここに挙げるのはインターフェース版が存在しない、曖昧さのないコマンドのみ。
 */
const GLOBAL_CONFIG_PATTERNS: RegExp[] = [
  /^(no )?lldp run$/,
  /^(no )?cdp run$/,
  /^ipv6 unicast-routing$/,
  /^(no )?ip routing$/,
  /^hostname /,
  /^ip route /,
  /^ipv6 route /,
  /^ip default-gateway /,
  /^ip domain[- ]name /,
  /^no ip domain-lookup$/,
  /^ip name-server /,
  /^ip dhcp /,
  /^ip access-list /,
  /^access-list /,
  /^username /,
  /^enable (secret|password) /,
  /^service /,
  /^ntp /,
  /^snmp-server /,
  /^banner /,
  /^aaa /,
  /^spanning-tree (mode|vlan|portfast default)/,
];

function isGlobalConfigCommand(norm: string): boolean {
  return GLOBAL_CONFIG_PATTERNS.some((re) => re.test(norm));
}

/** コンテキスト文字列（applyCommand が設定済み・正規化済み）からメンバーIFを取り出す。
 *  例: "range ethernet0/0,ethernet0/1" → ["ethernet0/0","ethernet0/1"]、"ethernet0/0" → ["ethernet0/0"] */
function contextMembers(context?: string): string[] {
  if (!context) return [];
  const c = context.trim();
  if (c.startsWith('range ')) {
    return c.slice('range '.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [c];
}

/**
 * 1コマンドを「要件キーの集合」に写像する。
 * - インターフェース選択(interface X / interface range …) → 選択キー sel|<member>（メンバー毎）
 * - 移動系(enable/conf t/exit/end/line/router/vlan/acl 選択)・保存 → グローバルキー *|<norm>
 * - インターフェース文脈内の設定コマンド → if|<member>|<norm>（メンバー毎に展開）
 *   これにより interface range と個別 interface が等価に扱われる。
 * - その他サブモード内の設定コマンド → <mode>[:<context>]|<norm>
 */
function keysForCommand(norm: string, before: CliState, after: CliState): string[] {
  const changed = after.mode !== before.mode || after.context !== before.context;
  const isSave = norm === 'copy running-config startup-config';

  // インターフェース（レンジ含む）の選択
  if (norm.startsWith('interface ') && after.mode === 'config-if') {
    return contextMembers(after.context).map((m) => 'sel|' + m);
  }
  // 移動系・保存はコンテキスト非依存
  if (changed || isSave) {
    return ['*|' + norm];
  }
  // グローバル設定専用コマンドは、現在の文脈に関わらず config レベルで判定
  // （模範解答で exit 省略によりサブモード文脈に現れても正しく一致させる）
  if (isGlobalConfigCommand(norm)) {
    return ['config|' + norm];
  }
  // インターフェース文脈内の設定コマンドはメンバー毎に展開
  if (before.mode === 'config-if') {
    return contextMembers(before.context).map((m) => 'if|' + m + '|' + norm);
  }
  // その他サブモード内の設定コマンド
  const ctx = before.mode + (before.context ? ':' + before.context : '');
  return [ctx + '|' + norm];
}

/** コマンド列を実行しながら各コマンドの要件キー集合を得る。 */
function simulate(
  commands: string[],
  cb: (command: string, keys: string[]) => void,
): void {
  let state: CliState = INITIAL_STATE;
  for (const raw of commands) {
    const cmd = raw.trim().replace(/\s+/g, ' ');
    if (!cmd) continue;
    const norm = normalizeCommand(cmd);
    if (!norm) continue;
    const before = state;
    const after = applyCommand(state, cmd).next;
    cb(raw, keysForCommand(norm, before, after));
    state = after;
  }
}

/**
 * 期待コマンドを1行ずつ、コンテキストを考慮して正誤判定する。
 * 表示（模範解答の○/×）にも採点にも使う単一の真実源。
 * 期待コマンドは、その要件キーが「すべて」入力側に含まれていれば正解。
 */
export function gradeLabLines(
  entered: string[],
  expected: string[],
): { command: string; ok: boolean }[] {
  const enteredKeys = new Set<string>();
  simulate(entered, (_c, keys) => keys.forEach((k) => enteredKeys.add(k)));

  const lines: { command: string; ok: boolean }[] = [];
  simulate(expected, (command, keys) => {
    const ok = keys.length > 0 && keys.every((k) => enteredKeys.has(k));
    lines.push({ command, ok });
  });
  return lines;
}

/**
 * 入力コマンド列と期待コマンド列をコンテキスト付きで比較する。
 * - 順序は問わないが、コマンドが打たれたモード／インターフェースは区別する
 * - interface range と個別 interface は等価に扱う
 * - 完全一致した正解コマンド数 / 期待コマンド総数 を返す
 */
export function gradeLabCommands(
  entered: string[],
  expected: string[],
): { matched: number; total: number; missing: string[]; extra: string[] } {
  const lines = gradeLabLines(entered, expected);
  const matched = lines.filter((l) => l.ok);
  const missing = lines.filter((l) => !l.ok).map((l) => l.command);

  const expectedKeys = new Set<string>();
  simulate(expected, (_c, keys) => keys.forEach((k) => expectedKeys.add(k)));
  const extra: string[] = [];
  simulate(entered, (command, keys) => {
    if (!keys.every((k) => expectedKeys.has(k))) extra.push(command);
  });

  return { matched: matched.length, total: lines.length, missing, extra };
}
