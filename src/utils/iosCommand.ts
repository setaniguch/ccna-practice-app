/**
 * Cisco IOS コマンドを正規化して比較できるようにするユーティリティ。
 * - 大文字小文字を区別しない
 * - 余分な空白を1つに
 * - 主要な短縮形を完全形に展開（int → interface, conf t → configure terminal など）
 */

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
  // 小文字化（大半の比較は大文字小文字無視で良い）
  return s.toLowerCase();
}

/**
 * 入力コマンド列と期待コマンド列を比較する。
 * - 順序は問わない（集合として比較）
 * - 完全一致した正解コマンド数 / 期待コマンド総数 を返す
 */
export function gradeLabCommands(
  entered: string[],
  expected: string[],
): { matched: number; total: number; missing: string[]; extra: string[] } {
  const enteredNorm = new Set(entered.map(normalizeCommand).filter(Boolean));
  const expectedNorm = expected.map(normalizeCommand).filter(Boolean);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const e of expectedNorm) {
    if (enteredNorm.has(e)) matched.push(e);
    else missing.push(e);
  }
  const expectedSet = new Set(expectedNorm);
  const extra: string[] = [];
  for (const c of enteredNorm) {
    if (!expectedSet.has(c)) extra.push(c);
  }
  return { matched: matched.length, total: expectedNorm.length, missing, extra };
}
