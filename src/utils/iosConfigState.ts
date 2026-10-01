/**
 * 入力されたコマンド列を「最終的な設定状態」に解釈するインタプリタ。
 *
 * ラボ問題の採点は本来「打ったコマンドが模範解答と同じか」ではなく
 * 「設定された内容が要求どおりか」で決まる（本番 CCNA も同じ思想）。
 * そこでコマンド列を実行して設定状態を組み立て、模範解答から同じ手順で
 * 組み立てた状態と比較する。
 *
 * 状態は入れ子オブジェクトではなく「ファクト（key → value）のフラットな Map」で表す。
 *   if:ethernet0/2|access-vlan      → "35"
 *   vlan:35|name                    → "sales"
 *   global|lldp-run                 → "true"
 *   route4|0.0.0.0 0.0.0.0 10.0.12.2 → "present"
 *   acl:corp_acl|aces               → "permit tcp any any eq 67 / deny ip any any log"
 *
 * この表現には次の利点がある。
 * - 後から打ち直したコマンドが自然に上書きされる（Map の set）
 * - 追加的な設定（スタティックルート等）はキーを分けることで並存できる
 * - 差分がそのまま「どの設定が足りないか」の説明になる
 *
 * 解釈できなかったコマンドは `raw|<モード>|<コマンド>` というファクトとして残すため、
 * 未対応コマンドが黙って正解扱いになることはない（従来のコマンド一致と同じ厳しさになる）。
 */

import { applyCommand, INITIAL_STATE, type CliState } from './iosCli';
import { normalizeCommand } from './iosCommand';

/** 設定状態を表すファクト集合 */
export type FactMap = Map<string, string>;

export interface InterpretedCommand {
  /** 入力された元のコマンド文字列 */
  command: string;
  /** このコマンドが書き換えた設定ファクトのキー。空なら移動系（採点対象外） */
  keys: string[];
}

export interface InterpretResult {
  /** 全コマンドを適用し終えた最終状態 */
  facts: FactMap;
  /** コマンドごとの解釈結果（表示・採点の行単位対応づけに使う） */
  commands: InterpretedCommand[];
}

// ---------------------------------------------------------------------------
// ヘルパ
// ---------------------------------------------------------------------------

/** config-if のコンテキストから対象インターフェース名を取り出す（range は展開） */
function interfaceMembers(context: string | undefined): string[] {
  if (!context) return [];
  const c = context.trim();
  if (c.startsWith('range ')) {
    return c
      .slice('range '.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [c];
}

/** 明示的に作成しないと存在しない論理インターフェースか（物理ポートは常に存在する） */
function isCreatableInterface(name: string): boolean {
  return /^(port-channel|vlan|loopback|tunnel)/.test(name);
}

/** "1,12,22" や "10-12" のような VLAN 指定を番号集合にする */
function parseVlanList(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = parseInt(range[2], 10);
      if (to >= from && to - from < 4096) {
        for (let v = from; v <= to; v++) out.add(v);
      }
      continue;
    }
    const n = parseInt(part.trim(), 10);
    if (!Number.isNaN(n)) out.add(n);
  }
  return out;
}

/** VLAN 集合を比較用の正規文字列にする（表記ゆれを吸収） */
function vlanSetValue(set: Set<number>): string {
  return [...set].sort((a, b) => a - b).join(',');
}

/**
 * ACL のポート名を番号へ寄せる表（eq telnet と eq 23 を同一視するため）。
 * Cisco IOS の ACL が受け付けるキーワードに加え、学習者が打ちがちな別名
 * （https / http / ssh / dhcp など）も番号へ寄せて、どちらの表記でも正解にする。
 */
export const PORT_ALIASES: Record<string, string> = {
  // --- TCP ---
  echo: '7',
  discard: '9',
  daytime: '13',
  chargen: '19',
  'ftp-data': '20',
  ftp: '21',
  ssh: '22',
  telnet: '23',
  smtp: '25',
  time: '37',
  whois: '43',
  tacacs: '49',
  domain: '53',
  gopher: '70',
  finger: '79',
  www: '80',
  http: '80',
  hostname: '101',
  pop2: '109',
  pop3: '110',
  sunrpc: '111',
  ident: '113',
  nntp: '119',
  msrpc: '135',
  irc: '194',
  https: '443',
  'pim-auto-rp': '496',
  exec: '512',
  login: '513',
  cmd: '514',
  syslog: '514',
  lpd: '515',
  talk: '517',
  uucp: '540',
  klogin: '543',
  kshell: '544',
  bgp: '179',
  // --- UDP ---
  bootps: '67',
  dhcp: '67',
  bootp: '67',
  bootpc: '68',
  tftp: '69',
  ntp: '123',
  'netbios-ns': '137',
  'netbios-dgm': '138',
  'netbios-ss': '139',
  snmp: '161',
  snmptrap: '162',
  xdmcp: '177',
  dnsix: '195',
  'mobile-ip': '434',
  isakmp: '500',
  rip: '520',
  biff: '512',
  who: '513',
  nameserver: '42',
  'non500-isakmp': '4500',
};

/** Cisco IOS の ACL が実際に受け付けるポートキーワード（点検スクリプト用） */
export const IOS_PORT_KEYWORDS = new Set<string>([
  // TCP
  'bgp', 'chargen', 'cmd', 'daytime', 'discard', 'domain', 'echo', 'exec',
  'finger', 'ftp', 'ftp-data', 'gopher', 'hostname', 'ident', 'irc', 'klogin',
  'kshell', 'login', 'lpd', 'msrpc', 'nntp', 'pim-auto-rp', 'pop2', 'pop3',
  'smtp', 'sunrpc', 'syslog', 'tacacs', 'talk', 'telnet', 'time', 'uucp',
  'whois', 'www',
  // UDP
  'biff', 'bootpc', 'bootps', 'dnsix', 'isakmp', 'mobile-ip', 'nameserver',
  'netbios-dgm', 'netbios-ns', 'netbios-ss', 'non500-isakmp', 'ntp', 'rip',
  'snmp', 'snmptrap', 'tftp', 'who', 'xdmcp',
]);

/**
 * ACE（ACL の 1 行）を比較用に正規化する。
 * `host X` と `X 0.0.0.0`、`eq telnet` と `eq 23` を同一視し、
 * 標準 ACL でワイルドカードマスク省略形も補う。
 */
function normalizeAce(ace: string, isStandard: boolean): string {
  let s = ace.replace(/\bhost\s+(\S+)/g, '$1 0.0.0.0');
  // eq / neq / gt / lt / range の後に続くポート指定を番号へ寄せる。
  // 表に無い語（any, log, established 等）はそのまま残す。
  s = s.replace(
    /\b(eq|neq|gt|lt|range)((?:\s+[a-z0-9][a-z0-9-]*)+)/g,
    (_whole, op: string, args: string) => {
      const mapped = args
        .trim()
        .split(/\s+/)
        .map((tok) => PORT_ALIASES[tok] ?? tok);
      return `${op} ${mapped.join(' ')}`;
    },
  );
  s = s.replace(/\s+/g, ' ').trim();
  if (isStandard) {
    // "permit 10.2.3.3" → "permit 10.2.3.3 0.0.0.0"
    const m = s.match(/^(permit|deny)\s+(\d+\.\d+\.\d+\.\d+)$/);
    if (m) s = `${m[1]} ${m[2]} 0.0.0.0`;
  }
  return s;
}

/** ACL に ACE を 1 行追記する（順序は意味を持つのでそのまま連結して保持） */
function appendAce(facts: FactMap, aclName: string, ace: string, isStandard: boolean): string {
  const key = `acl:${aclName}|aces`;
  const normalized = normalizeAce(ace, isStandard);
  const prev = facts.get(key);
  facts.set(key, prev ? `${prev} / ${normalized}` : normalized);
  return key;
}

// ---------------------------------------------------------------------------
// コマンド → ファクト
// ---------------------------------------------------------------------------

/** グローバル設定モードで解釈するコマンド。該当しなければ null */
function globalFacts(norm: string, facts: FactMap): string[] | null {
  const set = (key: string, value: string) => {
    facts.set(key, value);
    return [key];
  };

  let m: RegExpMatchArray | null;

  if ((m = norm.match(/^hostname (.+)$/))) return set('global|hostname', m[1]);
  if (norm === 'lldp run') return set('global|lldp-run', 'true');
  if (norm === 'no lldp run') return set('global|lldp-run', 'false');
  if (norm === 'cdp run') return set('global|cdp-run', 'true');
  if (norm === 'no cdp run') return set('global|cdp-run', 'false');
  if (norm === 'ip routing') return set('global|ip-routing', 'true');
  if (norm === 'no ip routing') return set('global|ip-routing', 'false');
  if (norm === 'ipv6 unicast-routing') return set('global|ipv6-unicast-routing', 'true');
  if (norm === 'no ip domain-lookup') return set('global|ip-domain-lookup', 'false');
  if (norm === 'service password-encryption')
    return set('global|service-password-encryption', 'true');

  if ((m = norm.match(/^ip domain-name (.+)$/))) return set('global|domain-name', m[1]);
  if ((m = norm.match(/^ip default-gateway (.+)$/))) return set('global|default-gateway', m[1]);
  if ((m = norm.match(/^ip name-server (.+)$/))) return set(`global|name-server:${m[1]}`, 'present');
  if ((m = norm.match(/^enable (?:secret|password) (?:\d+ )?(.+)$/)))
    return set('global|enable-secret', m[1]);

  // username <name> <属性...>：属性はそのまま比較対象にする
  if ((m = norm.match(/^username (\S+)\s+(.+)$/))) return set(`user:${m[1]}|attrs`, m[2]);

  if ((m = norm.match(/^ip route (.+)$/))) return set(`route4|${m[1]}`, 'present');
  if ((m = norm.match(/^ipv6 route (.+)$/))) return set(`route6|${m[1]}`, 'present');

  if ((m = norm.match(/^ntp master(?: (\d+))?$/))) return set('global|ntp-master', m[1] ?? '8');
  if ((m = norm.match(/^ntp server (.+)$/))) return set(`global|ntp-server:${m[1]}`, 'present');

  // DHCP スヌーピング（グローバル側）
  if (norm === 'ip dhcp snooping') return set('global|dhcp-snooping', 'true');
  if (norm === 'no ip dhcp snooping') return set('global|dhcp-snooping', 'false');
  if ((m = norm.match(/^ip dhcp snooping vlan (.+)$/))) {
    const keys: string[] = [];
    for (const v of parseVlanList(m[1])) {
      const key = `global|dhcp-snooping-vlan:${v}`;
      facts.set(key, 'true');
      keys.push(key);
    }
    return keys;
  }
  if (norm === 'ip dhcp snooping information option')
    return set('global|dhcp-snooping-information-option', 'true');
  if (norm === 'no ip dhcp snooping information option')
    return set('global|dhcp-snooping-information-option', 'false');
  if (norm === 'ip dhcp snooping verify mac-address')
    return set('global|dhcp-snooping-verify-mac-address', 'true');

  // ARP インスペクション（グローバル側）
  if ((m = norm.match(/^ip arp inspection vlan (.+)$/))) {
    const keys: string[] = [];
    for (const v of parseVlanList(m[1])) {
      const key = `global|arp-inspection-vlan:${v}`;
      facts.set(key, 'true');
      keys.push(key);
    }
    return keys;
  }
  if ((m = norm.match(/^ip arp inspection validate (.+)$/))) {
    const keys: string[] = [];
    for (const opt of m[1].split(/\s+/)) {
      const key = `global|arp-inspection-validate:${opt}`;
      facts.set(key, 'true');
      keys.push(key);
    }
    return keys;
  }
  if ((m = norm.match(/^ip arp inspection filter (.+)$/)))
    return set(`global|arp-inspection-filter:${m[1]}`, 'present');

  // DHCP プール / NAT
  if ((m = norm.match(/^ip dhcp excluded-address (.+)$/)))
    return set(`global|dhcp-excluded:${m[1]}`, 'present');
  if ((m = norm.match(/^ip nat pool (\S+) (.+)$/))) return set(`natpool:${m[1]}|def`, m[2]);
  if ((m = norm.match(/^ip nat inside source (.+)$/)))
    return set(`global|nat-inside-source:${m[1]}`, 'present');

  // 番号付き ACL
  if ((m = norm.match(/^access-list (\d+) (.+)$/))) {
    const num = parseInt(m[1], 10);
    const isStandard = (num >= 1 && num <= 99) || (num >= 1300 && num <= 1999);
    return [appendAce(facts, m[1], m[2], isStandard)];
  }

  if ((m = norm.match(/^spanning-tree mode (.+)$/))) return set('global|stp-mode', m[1]);
  if ((m = norm.match(/^spanning-tree vlan (.+)$/)))
    return set(`global|stp-vlan:${m[1]}`, 'present');
  if (norm === 'spanning-tree portfast default')
    return set('global|stp-portfast-default', 'true');

  if ((m = norm.match(/^banner motd (.+)$/))) return set('global|banner-motd', m[1]);
  if ((m = norm.match(/^snmp-server (.+)$/))) return set(`global|snmp:${m[1]}`, 'present');

  return null;
}

/** インターフェース設定モードで解釈するコマンド。該当しなければ null */
function interfaceFacts(norm: string, members: string[], facts: FactMap): string[] | null {
  /** 全メンバーに同じ属性を設定する */
  const setAll = (attr: string, value: string) => {
    const keys: string[] = [];
    for (const ifName of members) {
      const key = `if:${ifName}|${attr}`;
      facts.set(key, value);
      keys.push(key);
    }
    return keys;
  };

  let m: RegExpMatchArray | null;

  if (norm === 'shutdown') return setAll('shutdown', 'true');
  if (norm === 'no shutdown') return setAll('shutdown', 'false');
  if ((m = norm.match(/^description (.+)$/))) return setAll('description', m[1]);
  if ((m = norm.match(/^duplex (.+)$/))) return setAll('duplex', m[1]);
  if ((m = norm.match(/^speed (.+)$/))) return setAll('speed', m[1]);
  if ((m = norm.match(/^mtu (.+)$/))) return setAll('mtu', m[1]);

  if (norm === 'ip address dhcp') return setAll('ip-address', 'dhcp');
  if ((m = norm.match(/^ip address (\S+) (\S+)$/))) return setAll('ip-address', `${m[1]} ${m[2]}`);
  if ((m = norm.match(/^ipv6 address (.+)$/))) {
    const keys: string[] = [];
    for (const ifName of members) {
      const key = `if:${ifName}|ipv6-address:${m[1]}`;
      facts.set(key, 'present');
      keys.push(key);
    }
    return keys;
  }

  if (norm === 'switchport') return setAll('switchport', 'true');
  if (norm === 'no switchport') return setAll('switchport', 'false');
  if ((m = norm.match(/^switchport mode (.+)$/))) return setAll('switchport-mode', m[1]);
  if ((m = norm.match(/^switchport access vlan (\d+)$/))) return setAll('access-vlan', m[1]);
  if ((m = norm.match(/^switchport voice vlan (\S+)$/))) return setAll('voice-vlan', m[1]);
  if ((m = norm.match(/^switchport trunk native vlan (\d+)$/)))
    return setAll('trunk-native-vlan', m[1]);
  if ((m = norm.match(/^switchport trunk encapsulation (.+)$/)))
    return setAll('trunk-encapsulation', m[1]);

  // allowed vlan は add / remove / none / all を集合演算で反映する
  if ((m = norm.match(/^switchport trunk allowed vlan (?:(add|remove) )?(.+)$/))) {
    const op = m[1];
    const spec = m[2];
    const keys: string[] = [];
    for (const ifName of members) {
      const key = `if:${ifName}|trunk-allowed-vlan`;
      if (spec === 'all') {
        facts.set(key, 'all');
      } else if (spec === 'none') {
        facts.set(key, '');
      } else {
        const incoming = parseVlanList(spec);
        const prev = facts.get(key);
        if (op === 'add' || op === 'remove') {
          const cur = prev && prev !== 'all' ? parseVlanList(prev) : new Set<number>();
          if (op === 'add') for (const v of incoming) cur.add(v);
          else for (const v of incoming) cur.delete(v);
          facts.set(key, vlanSetValue(cur));
        } else {
          facts.set(key, vlanSetValue(incoming));
        }
      }
      keys.push(key);
    }
    return keys;
  }

  if (norm === 'switchport port-security') return setAll('port-security', 'true');
  if ((m = norm.match(/^switchport port-security maximum (\d+)$/)))
    return setAll('port-security-maximum', m[1]);
  if ((m = norm.match(/^switchport port-security violation (.+)$/)))
    return setAll('port-security-violation', m[1]);
  if (norm === 'switchport port-security mac-address sticky')
    return setAll('port-security-mac-address-sticky', 'true');
  if ((m = norm.match(/^switchport port-security mac-address (\S+)$/)))
    return setAll('port-security-mac-address', m[1]);

  // EtherChannel：メンバーポートに設定すると Po インターフェースも生成される
  if ((m = norm.match(/^channel-group (\d+) mode (.+)$/))) {
    const keys = setAll('channel-group', `${m[1]} mode ${m[2]}`);
    const poKey = `if:port-channel${m[1]}|exists`;
    facts.set(poKey, 'true');
    keys.push(poKey);
    return keys;
  }
  if ((m = norm.match(/^channel-protocol (.+)$/))) return setAll('channel-protocol', m[1]);

  if ((m = norm.match(/^ip ospf (\d+) area (\S+)$/)))
    return setAll('ip-ospf', `${m[1]} area ${m[2]}`);
  if ((m = norm.match(/^ip ospf (priority|cost|hello-interval|dead-interval) (\S+)$/)))
    return setAll(`ip-ospf-${m[1]}`, m[2]);

  if (norm === 'ip nat inside') return setAll('nat', 'inside');
  if (norm === 'ip nat outside') return setAll('nat', 'outside');
  if ((m = norm.match(/^ip access-group (\S+) (in|out)$/)))
    return setAll(`access-group-${m[2]}`, m[1]);
  if ((m = norm.match(/^ip helper-address (\S+)$/))) return setAll('helper-address', m[1]);

  if (norm === 'cdp enable') return setAll('cdp-enable', 'true');
  if (norm === 'no cdp enable') return setAll('cdp-enable', 'false');
  if (norm === 'lldp transmit') return setAll('lldp-transmit', 'true');
  if (norm === 'no lldp transmit') return setAll('lldp-transmit', 'false');
  if (norm === 'lldp receive') return setAll('lldp-receive', 'true');
  if (norm === 'no lldp receive') return setAll('lldp-receive', 'false');

  if (norm === 'ip dhcp snooping trust') return setAll('dhcp-snooping-trust', 'true');
  if ((m = norm.match(/^ip dhcp snooping limit rate (\d+)$/)))
    return setAll('dhcp-snooping-limit-rate', m[1]);
  if (norm === 'ip dhcp relay information trusted')
    return setAll('dhcp-relay-information-trusted', 'true');
  if (norm === 'ip arp inspection trust') return setAll('arp-inspection-trust', 'true');
  if (norm === 'ip verify source') return setAll('ip-verify-source', 'true');
  if (norm === 'spanning-tree portfast') return setAll('stp-portfast', 'true');
  if (norm === 'spanning-tree bpduguard enable') return setAll('stp-bpduguard', 'true');

  return null;
}

/** 動作コマンド（設定状態を持たないもの）。該当しなければ null */
function actionFacts(norm: string, facts: FactMap): string[] | null {
  if (norm === 'copy running-config startup-config') {
    facts.set('action|save', 'present');
    return ['action|save'];
  }
  if (/^crypto key generate rsa\b/.test(norm)) {
    // 鍵長の指定有無は結果に影響しないため同一視する
    facts.set('action|crypto-key-generate-rsa', 'present');
    return ['action|crypto-key-generate-rsa'];
  }
  const clock = norm.match(/^clock set (.+)$/);
  if (clock) {
    facts.set('action|clock-set', clock[1]);
    return ['action|clock-set'];
  }
  return null;
}

// ---------------------------------------------------------------------------
// インタプリタ本体
// ---------------------------------------------------------------------------

/** コマンド列を実行して最終的な設定状態を組み立てる */
export function interpretCommands(commands: string[]): InterpretResult {
  const facts: FactMap = new Map();
  const interpreted: InterpretedCommand[] = [];
  let cli: CliState = INITIAL_STATE;
  /** `ip dhcp pool X` 直後のサブコマンドを紐づけるための現在プール名 */
  let dhcpPool: string | null = null;

  for (const raw of commands) {
    const norm = normalizeCommand(raw);
    if (!norm) continue;

    const before = cli;
    const after = applyCommand(cli, raw).next;
    const keys = factsForCommand(norm, before, after, facts, {
      get dhcpPool() {
        return dhcpPool;
      },
      set dhcpPool(v: string | null) {
        dhcpPool = v;
      },
    });

    interpreted.push({ command: raw, keys });
    cli = after;
  }

  return { facts, commands: interpreted };
}

/** dhcp プールの現在位置を保持するための小さな可変コンテナ */
interface InterpreterScope {
  dhcpPool: string | null;
}

function factsForCommand(
  norm: string,
  before: CliState,
  after: CliState,
  facts: FactMap,
  scope: InterpreterScope,
): string[] {
  // --- 移動系（設定状態を持たない） ---
  if (norm === 'enable' || norm === 'disable' || norm === 'configure terminal') {
    return [];
  }
  if (norm === 'exit' || norm === 'end') {
    // グローバル設定を抜けたら dhcp プールの文脈も失われる
    if (after.mode !== 'config') scope.dhcpPool = null;
    return [];
  }

  // --- サブモードへの遷移：オブジェクトの生成を意味するものはファクトを立てる ---
  if (after.mode !== before.mode || after.context !== before.context) {
    if (after.mode === 'config-if') {
      scope.dhcpPool = null;
      const keys: string[] = [];
      for (const ifName of interfaceMembers(after.context)) {
        if (isCreatableInterface(ifName)) {
          const key = `if:${ifName}|exists`;
          facts.set(key, 'true');
          keys.push(key);
        }
      }
      return keys;
    }
    if (after.mode === 'config-vlan') {
      scope.dhcpPool = null;
      const key = `vlan:${after.context}|exists`;
      facts.set(key, 'true');
      return [key];
    }
    if (after.mode === 'config-line') {
      scope.dhcpPool = null;
      const key = `line:${after.context}|exists`;
      facts.set(key, 'true');
      return [key];
    }
    if (after.mode === 'config-router') {
      scope.dhcpPool = null;
      const key = `router:${after.context}|exists`;
      facts.set(key, 'true');
      return [key];
    }
    if (after.mode === 'config-acl-std' || after.mode === 'config-acl-ext') {
      scope.dhcpPool = null;
      const key = `acl:${after.context}|exists`;
      facts.set(key, 'true');
      return [key];
    }
    // その他のサブモード（aaa / key chain 等）は遷移のみ
    scope.dhcpPool = null;
    return [];
  }

  // --- 動作コマンド（モードを問わない） ---
  const action = actionFacts(norm, facts);
  if (action) return action;

  // --- モード別の設定コマンド ---
  if (before.mode === 'config-if') {
    const keys = interfaceFacts(norm, interfaceMembers(before.context), facts);
    if (keys) return keys;
  }

  if (before.mode === 'config-vlan') {
    const name = norm.match(/^name (.+)$/);
    if (name) {
      const key = `vlan:${before.context}|name`;
      facts.set(key, name[1]);
      return [key];
    }
    if (norm === 'shutdown' || norm === 'no shutdown') {
      const key = `vlan:${before.context}|shutdown`;
      facts.set(key, norm === 'shutdown' ? 'true' : 'false');
      return [key];
    }
  }

  if (before.mode === 'config-line') {
    const prefix = `line:${before.context}|`;
    let m: RegExpMatchArray | null;
    if (norm === 'login local') {
      facts.set(`${prefix}login`, 'local');
      return [`${prefix}login`];
    }
    if (norm === 'login') {
      facts.set(`${prefix}login`, 'password');
      return [`${prefix}login`];
    }
    if ((m = norm.match(/^password (?:\d+ )?(.+)$/))) {
      facts.set(`${prefix}password`, m[1]);
      return [`${prefix}password`];
    }
    if ((m = norm.match(/^transport input (.+)$/))) {
      // transport input は後から打つと置き換わる
      facts.set(`${prefix}transport-input`, m[1]);
      return [`${prefix}transport-input`];
    }
    if ((m = norm.match(/^access-class (\S+) (in|out)$/))) {
      facts.set(`${prefix}access-class-${m[2]}`, m[1]);
      return [`${prefix}access-class-${m[2]}`];
    }
    if ((m = norm.match(/^exec-timeout (.+)$/))) {
      facts.set(`${prefix}exec-timeout`, m[1]);
      return [`${prefix}exec-timeout`];
    }
    if (norm === 'logging synchronous') {
      facts.set(`${prefix}logging-synchronous`, 'true');
      return [`${prefix}logging-synchronous`];
    }
  }

  if (before.mode === 'config-router') {
    const prefix = `router:${before.context}|`;
    let m: RegExpMatchArray | null;
    if ((m = norm.match(/^router-id (.+)$/))) {
      facts.set(`${prefix}router-id`, m[1]);
      return [`${prefix}router-id`];
    }
    if ((m = norm.match(/^network (.+)$/))) {
      facts.set(`${prefix}network:${m[1]}`, 'present');
      return [`${prefix}network:${m[1]}`];
    }
    if ((m = norm.match(/^passive-interface (.+)$/))) {
      facts.set(`${prefix}passive-interface:${m[1]}`, 'present');
      return [`${prefix}passive-interface:${m[1]}`];
    }
    if (norm === 'default-information originate') {
      facts.set(`${prefix}default-information-originate`, 'true');
      return [`${prefix}default-information-originate`];
    }
    if ((m = norm.match(/^redistribute (.+)$/))) {
      facts.set(`${prefix}redistribute:${m[1]}`, 'present');
      return [`${prefix}redistribute:${m[1]}`];
    }
  }

  if (before.mode === 'config-acl-std' || before.mode === 'config-acl-ext') {
    if (/^(permit|deny|remark) /.test(norm)) {
      return [
        appendAce(facts, before.context ?? '', norm, before.mode === 'config-acl-std'),
      ];
    }
  }

  if (before.mode === 'config') {
    // ip dhcp pool のサブコマンドはプール名に紐づける
    const pool = norm.match(/^ip dhcp pool (\S+)$/);
    if (pool) {
      scope.dhcpPool = pool[1];
      const key = `dhcp-pool:${pool[1]}|exists`;
      facts.set(key, 'true');
      return [key];
    }
    if (scope.dhcpPool) {
      const sub = norm.match(
        /^(network|default-router|dns-server|domain-name|lease|option) (.+)$/,
      );
      if (sub) {
        const key = `dhcp-pool:${scope.dhcpPool}|${sub[1]}`;
        facts.set(key, sub[2]);
        return [key];
      }
    }

    const keys = globalFacts(norm, facts);
    if (keys) return keys;
  } else if (before.mode.startsWith('config')) {
    // サブモードにいても、そのモードで解釈できないグローバル設定コマンドは
    // 親モードのものとして処理される（実機 IOS のパーサと同じ挙動）。
    // 例: config-if のまま lldp run / ip route を打てる。
    const keys = globalFacts(norm, facts);
    if (keys) return keys;
  }

  // --- 解釈できなかったコマンド ---
  // 従来のコマンド一致と同じ厳しさになるよう、モード文脈付きのファクトとして残す。
  if (before.mode === 'config-if') {
    const keys: string[] = [];
    for (const ifName of interfaceMembers(before.context)) {
      const key = `raw|if:${ifName}|${norm}`;
      facts.set(key, 'present');
      keys.push(key);
    }
    if (keys.length > 0) return keys;
  }
  const ctx = before.mode + (before.context ? `:${before.context}` : '');
  const key = `raw|${ctx}|${norm}`;
  facts.set(key, 'present');
  return [key];
}

// ---------------------------------------------------------------------------
// 採点
// ---------------------------------------------------------------------------

export interface LabGradeLine {
  /** 模範解答のコマンド */
  command: string;
  /** 設定状態が一致しているか */
  ok: boolean;
  /** 設定状態を持たない移動系コマンド（採点対象外） */
  optional: boolean;
}

/**
 * 模範解答を 1 行ずつ、最終的な設定状態の一致で判定する。
 * 行ごとの ○/× 表示と採点の双方が使う単一の真実源。
 *
 * 判定は「その行が設定するファクトが、入力側の最終状態でも同じ値になっているか」。
 * したがって順序・`exit` の有無・打ち直し・`interface range` と個別指定の違いは
 * 結果が同じであれば正解になる。
 */
export function gradeLabLines(entered: string[], expected: string[]): LabGradeLine[] {
  const enteredState = interpretCommands(entered).facts;
  const expectedResult = interpretCommands(expected);

  return expectedResult.commands.map(({ command, keys }) => {
    if (keys.length === 0) return { command, ok: true, optional: true };
    const ok = keys.every((k) => enteredState.get(k) === expectedResult.facts.get(k));
    return { command, ok, optional: false };
  });
}

/**
 * 入力と模範解答を設定状態で比較する。
 * - 採点対象は「設定状態を持つ行」のみ（enable / configure terminal / exit / end などは除く）
 * - 一致した行数 / 採点対象の行数を返す
 */
export function gradeLabCommands(
  entered: string[],
  expected: string[],
): { matched: number; total: number; missing: string[] } {
  const graded = gradeLabLines(entered, expected).filter((l) => !l.optional);
  return {
    matched: graded.filter((l) => l.ok).length,
    total: graded.length,
    missing: graded.filter((l) => !l.ok).map((l) => l.command),
  };
}

/**
 * 不足している設定を「ファクト単位」で説明する。
 * 行単位の ○/× より粒度が細かく、何が足りないかの説明に使える。
 */
export function missingFacts(
  entered: string[],
  expected: string[],
): { key: string; expected: string; actual: string | undefined }[] {
  const enteredState = interpretCommands(entered).facts;
  const expectedState = interpretCommands(expected).facts;
  const out: { key: string; expected: string; actual: string | undefined }[] = [];
  for (const [key, value] of expectedState) {
    const actual = enteredState.get(key);
    if (actual !== value) out.push({ key, expected: value, actual });
  }
  return out;
}
