/**
 * Cisco IOS のプロンプトモード遷移を再現するロジック。
 * 実コマンドの効果（設定の保持や状態変更）は行わず、
 * モード文字列とサブモードのコンテキスト名だけを管理する。
 */

import { normalizeCommand } from './iosCommand';

export type CliMode =
  | 'user' // host>
  | 'priv' // host#
  | 'config' // host(config)#
  | 'config-if' // host(config-if)#
  | 'config-line' // host(config-line)#
  | 'config-router' // host(config-router)#
  | 'config-vlan' // host(config-vlan)#
  | 'config-acl-std' // host(config-std-nacl)#
  | 'config-acl-ext' // host(config-ext-nacl)#
  | 'config-aaa' // host(config-aaa)#
  | 'config-keychain' // host(config-keychain)#
  | 'config-keychain-key'
  | 'config-radius'
  | 'config-tacacs'
  | 'config-ssh-pubkey'
  | 'config-snmp';

export interface CliState {
  mode: CliMode;
  /** サブモードのコンテキストを表示用に保持（例: GigabitEthernet0/0） */
  context?: string;
}

export const INITIAL_STATE: CliState = { mode: 'user' };

/** プロンプト文字列を構築 */
export function buildPrompt(hostname: string, state: CliState): string {
  switch (state.mode) {
    case 'user':
      return `${hostname}>`;
    case 'priv':
      return `${hostname}#`;
    case 'config':
      return `${hostname}(config)#`;
    case 'config-if':
      return `${hostname}(config-if)#`;
    case 'config-line':
      return `${hostname}(config-line)#`;
    case 'config-router':
      return `${hostname}(config-router)#`;
    case 'config-vlan':
      return `${hostname}(config-vlan)#`;
    case 'config-acl-std':
      return `${hostname}(config-std-nacl)#`;
    case 'config-acl-ext':
      return `${hostname}(config-ext-nacl)#`;
    case 'config-aaa':
      return `${hostname}(config-aaa)#`;
    case 'config-keychain':
      return `${hostname}(config-keychain)#`;
    case 'config-keychain-key':
      return `${hostname}(config-keychain-key)#`;
    case 'config-radius':
      return `${hostname}(config-radius-server)#`;
    case 'config-tacacs':
      return `${hostname}(config-server-tacacs)#`;
    case 'config-ssh-pubkey':
      return `${hostname}(config-ssh-pubkey-user)#`;
    case 'config-snmp':
      return `${hostname}(config-snmp)#`;
  }
  return `${hostname}#`;
}

/**
 * グローバル設定モードで打つとサブモードへ入るコマンドを判定する。
 * 実機ではサブモードからも同じコマンドを直接打てる（パーサが親モードで解釈する）ため、
 * config / config-XXX のどちらからでもこの判定を共用する。
 * 該当しなければ null。
 */
function enterSubMode(lower: string): CliState | null {
  // interface X
  let m = lower.match(/^interface\s+(\S.*)$/);
  if (m) return { mode: 'config-if', context: m[1] };
  // line vty / con / aux
  m = lower.match(/^line\s+(\S.*)$/);
  if (m) return { mode: 'config-line', context: m[1] };
  // router ospf/eigrp/rip/bgp
  m = lower.match(/^router\s+(\S.*)$/);
  if (m) return { mode: 'config-router', context: m[1] };
  // vlan N
  m = lower.match(/^vlan\s+(\d+)$/);
  if (m) return { mode: 'config-vlan', context: m[1] };
  // ip access-list standard/extended X
  m = lower.match(/^ip access-list\s+standard\s+(\S+)$/);
  if (m) return { mode: 'config-acl-std', context: m[1] };
  m = lower.match(/^ip access-list\s+extended\s+(\S+)$/);
  if (m) return { mode: 'config-acl-ext', context: m[1] };
  // aaa group
  m = lower.match(/^aaa group\s+(\S.*)$/);
  if (m) return { mode: 'config-aaa', context: m[1] };
  // key chain X
  m = lower.match(/^key chain\s+(\S+)$/);
  if (m) return { mode: 'config-keychain', context: m[1] };
  // radius server X
  m = lower.match(/^radius server\s+(\S+)$/);
  if (m) return { mode: 'config-radius', context: m[1] };
  // tacacs server X
  m = lower.match(/^tacacs server\s+(\S+)$/);
  if (m) return { mode: 'config-tacacs', context: m[1] };
  return null;
}

/**
 * 入力された 1 行コマンドを実行（モード遷移のみ）。
 * 戻り値: 次の状態と、画面表示用の出力（複数行可）
 */
export function applyCommand(
  state: CliState,
  rawInput: string,
): { next: CliState; output: string[] } {
  const cmd = rawInput.trim().replace(/\s+/g, ' ');
  if (!cmd) return { next: state, output: [] };

  // 短縮形を展開してからマッチさせる（int e0/1 も interface ethernet0/1 と認識）
  const lower = normalizeCommand(cmd);

  // 任意モードからの抜け出し
  if (lower === 'end' || lower === '^z') {
    if (state.mode === 'user') return { next: state, output: [] };
    return { next: { mode: 'priv' }, output: [] };
  }
  if (lower === 'exit') {
    return { next: exitOne(state), output: [] };
  }
  if (lower === 'disable') {
    if (state.mode === 'priv') return { next: { mode: 'user' }, output: [] };
    return { next: state, output: [] };
  }

  // ユーザー → 特権
  if (state.mode === 'user') {
    if (lower === 'enable' || lower === 'enable secret' || lower === 'en') {
      return { next: { mode: 'priv' }, output: [] };
    }
    return { next: state, output: [] };
  }

  // 特権 → グローバル設定
  if (state.mode === 'priv') {
    // configure / conf / config いずれも + 任意で 'terminal' / 't' / 'ter' を許容
    if (/^(configure|config|conf)(\s+(terminal|term|ter|t))?$/.test(lower)) {
      return {
        next: { mode: 'config' },
        output: ['Enter configuration commands, one per line.  End with CNTL/Z.'],
      };
    }
    return { next: state, output: [] };
  }

  // グローバル → サブモード
  if (state.mode === 'config') {
    const next = enterSubMode(lower);
    if (next) return { next, output: [] };
    // snmp-server view など → snmp
    return { next: state, output: [] };
  }

  // config-keychain → key N
  if (state.mode === 'config-keychain') {
    const m = lower.match(/^key\s+(\d+)$/);
    if (m) return { next: { mode: 'config-keychain-key', context: m[1] }, output: [] };
  }

  // サブモードにいても、親（グローバル設定）のサブモード移行コマンドは直接打てる。
  // 実機の IOS パーサは認識できないコマンドを親モードで解釈するため（例: config-if から
  // interface / vlan / ip access-list をそのまま入力できる）、同じ判定を再利用する。
  if (state.mode.startsWith('config')) {
    const next = enterSubMode(lower);
    if (next) return { next, output: [] };
  }

  // それ以外のコマンドは状態変化なし（採点用に記録するだけ）
  return { next: state, output: [] };
}

function exitOne(state: CliState): CliState {
  switch (state.mode) {
    case 'config-if':
    case 'config-line':
    case 'config-router':
    case 'config-vlan':
    case 'config-acl-std':
    case 'config-acl-ext':
    case 'config-aaa':
    case 'config-keychain':
    case 'config-radius':
    case 'config-tacacs':
    case 'config-ssh-pubkey':
    case 'config-snmp':
      return { mode: 'config' };
    case 'config-keychain-key':
      return { mode: 'config-keychain' };
    case 'config':
      return { mode: 'priv' };
    case 'priv':
    case 'user':
      return { mode: 'user' };
  }
  return state;
}
