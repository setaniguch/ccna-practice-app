/**
 * Cisco IOS の設定スニペットを含む選択肢テキストを整形して表示するためのヘルパ。
 *
 * Examtopics 由来の HTML から抽出した際に、CLI 設定が:
 *   - 1 行に潰されている (例: Q274/Q446/Q565)
 *   - リテラル `\n` で表現されている (例: Q624/Q635)
 *   - 既に改行入りだが等幅整形されていない (例: Q156/Q875)
 *   - mojibake のダッシュ (`ג€"` 等) が混入している (例: Q280)
 * 等のケースを統一的に整形する。
 */

/** ホスト名プロンプト検出: `SW1#`, `SW1>`, `SW1(config)#`, `R3(config-if)#`, `Switch1(config) #` (#前に空白) 等 */
const HOSTNAME_RE = /([A-Za-z][\w-]*(?:\s*\([\w-]+\))?)\s*([#>])\s*/g;

const SECTION_KEYWORDS = [
  'interface ',
  'router ',
  'line ',
  'vlan ',
  'access-list ',
  'access- list ',
  'ip access-list ',
  'ip dhcp pool ',
  'crypto ',
  'username ',
  'spanning-tree ',
  'no spanning-tree ',
  'switchport ',
  'no switchport ',
  'channel-group ',
  'channel-protocol ',
  'lacp ',
  'port-channel ',
  'ip address ',
  'no ip address',
  'ipv6 address ',
  'ip route ',
  'ipv6 route ',
  'ip nat ',
  'ip ospf ',
  'ip helper-address ',
  'standby ',
  'enable secret ',
  'enable password ',
  'password ',
  'login ',
  'no login',
  'transport input ',
  'access-class ',
  'ip access-group ',
  'access-group ',
  'name ',
  'description ',
  'shutdown',
  'no shutdown',
  'exit',
  'end',
  'encapsulation ',
  'duplex ',
  'speed ',
  'mtu ',
  'priority ',
  'permit ',
  'deny ',
  'remark ',
  'router-id ',
  'network ',
  'redistribute ',
  'passive-interface ',
  'configure terminal',
  'config t',
  'int ',
  'no int',
];

/**
 * 問題文（question_text）が「コマンド／command」を主題にしている場合、
 * 全選択肢を CLI コマンドとして表示するためのヒント。
 */
export function questionTextSuggestsCli(text: string | undefined | null): boolean {
  if (!text) return false;
  return /(コマンド|command|設定|configuration|configure|configures|configured)/i.test(text);
}

/**
 * 短い候補が CLI コマンドのスタイルに見えるか（プレフィックス語彙に基づく軽量判定）。
 * 全選択肢のうち1つでもマッチすれば、ヒント有り問題でまとめて CLI 表示する。
 */
export function looksLikeIosConfigLoose(text: string): boolean {
  if (!text) return false;
  if (/[ぁ-んァ-ン一-龥]/.test(text)) return false;
  if (/^\s*(configure\s+the|enter|use|run|execute|implement|apply|add)\b/i.test(text)) return false;
  const t = text.trim().toLowerCase();
  return /^(show\s|conf|interface\s|int\s|switchport\s|no\s+\S|router\s|line\s|ip\s|ipv6\s|access-list\s|access-group\s|enable\s|password\s|username\s|hostname\s|service\s|crypto\s|standby\s|spanning-tree\s|channel-group\s|snmp-server\s|snmp\s|login\s|logging\s|aaa\s|ntp\s|banner\s|errdisable\s|mac\s|do\s|copy\s|reload|write\s|wr\b|confreg\s|boot\s|debug\s|undebug|terminal\s|clear\s|ping\s|traceroute|telnet\s|ssh\s|tftp\s|ftp\s|http\s|nslookup\s|router-id|network\s+\d|name\s+\S|description\s|encapsulation\s|duplex\s|speed\s|mtu\s|priority\s|permit\s|deny\s|remark\s|redistribute\s|passive-interface)/.test(t);
}

/** 文字列を「設定らしさ」のスコアで評価し、CLI とみなすか判定 */
export function looksLikeIosConfig(text: string): boolean {
  if (!text) return false;

  // リテラル \n (バックスラッシュ + n) も改行とみなして判定対象に含める
  const normalized = text.replace(/\\n/g, '\n');

  // 文章プレフィックスで始まるなら除外（例: "Configure the switchport ..."）
  if (/^\s*(configure\s+the|enter|use|run|execute|implement|apply|add)\b/i.test(text)) {
    return false;
  }

  const lower = normalized.toLowerCase();

  // 強いシグナル: ホスト名プロンプト
  if (/[A-Za-z][\w-]*(?:\s*\([\w-]+\))?\s*[#>]/.test(normalized)) return true;

  // 強いシグナル: 改行を含み IOS キーワードを含む（既に整形済みの貼付け）
  if (normalized.includes('\n')) {
    if (/\b(interface|switchport|router|access-list|ip\s+(route|access-list|address|nat)|vlan\s+\d|channel-group|spanning-tree|line\s+(con|vty|aux)|enable\s+(secret|password)|configure\s+terminal|config\s+t)\b/i.test(normalized)) {
      return true;
    }
  }

  // 強いシグナル: ! セパレータ
  if (/\s!\s/.test(normalized)) return true;

  const ic = (lower.match(/\b(interface|int)\s/g) || []).length;
  const sc = (lower.match(/\bswitchport\s/g) || []).length;
  const aclC = (lower.match(/\baccess-list\s/g) || []).length;
  const lineC = (lower.match(/\bline\s+(con|vty|aux)/g) || []).length;
  const ipRoute = (lower.match(/\bipv?6?\s+route\s/g) || []).length;
  const enableSecret = /\benable\s+(secret|password)\b/.test(lower);
  const channelGroup = /\bchannel-group\s+\d/.test(lower);
  const hasIpAddr = /\bipv?6?\s+address\b/.test(lower);
  const trimmed = lower.trim();

  // 単発 CLI コマンド（先頭一致）も CLI 表示する
  if (
    /^(show|configure\s+terminal|config\s+t|interface\s+\S|int\s+\S|switchport\s+\S|no\s+switchport|router\s+\S|line\s+(con|vty|aux)|ip\s+route\s|ipv6\s+route\s|ip\s+access-list\s|ipv6\s+access-list\s|access-list\s+\d|access-group\s|router-id\s|network\s+\d|enable\s+(secret|password)\s|spanning-tree\s|channel-group\s|no\s+(switchport|shutdown|ip|spanning-tree|access-list)\s|ip\s+nat\s|ip\s+helper-address\s|ip\s+address\s+\d|ipv6\s+address\s|username\s+\S|password\s+\S|hostname\s+\S|service\s+\S|crypto\s+\S|standby\s+\S|snmp-server\s+\S|snmp\s+\S|login\s+\S|logging\s+\S|aaa\s+\S|ntp\s+\S|banner\s+\S|errdisable\s+\S|mac\s+address-table\s|ip\s+ssh\s|ip\s+domain|do\s+show\s|do\s+wr\s|copy\s+\S|reload\s|write\s+memory|wr\s|confreg\s|boot\s+\S|debug\s+\S|undebug\s|terminal\s+\S|clear\s+\S|ping\s+\S|traceroute\s|telnet\s+\S|ssh\s+\S|tftp\s+\S|ftp\s+\S|http\s+\S|nslookup\s+\S)/.test(trimmed)
  ) {
    return true;
  }

  if (ic >= 2) return true;
  if (sc >= 2 && text.length > 60) return true;
  if (aclC >= 2) return true;
  if (ipRoute >= 2) return true;
  if (lineC >= 1 && (enableSecret || /\bpassword\b/.test(lower))) return true;
  if (channelGroup && (ic >= 1 || sc >= 1)) return true;
  if (ic >= 1 && (sc >= 1 || hasIpAddr || /\bencapsulation\b/.test(lower))) return true;
  if (sc >= 1 && hasIpAddr) return true;
  if (/\brouter\s+(ospf|bgp|eigrp|rip)\b/.test(lower) && /\bnetwork\b/.test(lower)) return true;

  return false;
}

/** Mojibake になった em/en-dash や引用符を ASCII 等価物に正規化 */
function fixMojibake(s: string): string {
  return s
    .replace(/ג€"/g, '–')
    .replace(/ג€"/g, '—')
    .replace(/ג€œ/g, '"')
    .replace(/ג€/g, '"')
    .replace(/â€"/g, '–')
    .replace(/â€"/g, '—')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ');
}

/** 1行に潰された IOS 設定テキストに改行を挿入して整形する。 */
export function formatIosConfigText(text: string): string {
  if (!text) return text;
  let out = ' ' + fixMojibake(text) + ' ';

  // ホスト名プロンプトの前に改行（プロンプトはそのまま、間の空白は保持）
  out = out.replace(HOSTNAME_RE, '\n$1$2 ');

  // ! を独立行に
  out = out.replace(/\s+!\s+/g, '\n!\n');

  // セクションキーワードの前に改行
  for (const kw of SECTION_KEYWORDS) {
    const re = new RegExp('(?<!\\n)([ \\t]+)' + escapeRegExp(kw), 'gi');
    out = out.replace(re, '\n  ' + kw);
  }

  out = out
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '')
    .join('\n');
  return out.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
