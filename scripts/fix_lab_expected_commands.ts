/**
 * ラボ問題の模範解答（expected_commands）を実機で通る正規形に整える一括修正スクリプト。
 *
 * 1. `router ospf 1` 直後の余計な `interface ...` 行（取り込みノイズ）を取り除く
 * 2. サブモードから抜けずにグローバル設定コマンド／別サブモード移行コマンドが
 *    並んでいる箇所に `exit` を挿入する
 *    例: vlan 35 / name SALES / interface ethernet0/2 → 間に exit
 *        interface ethernet0/2 / lldp run              → 間に exit
 *    exit 後にそのインターフェースの設定が続く場合は `interface ...` で文脈を復帰させる
 * 3. 末尾が `end` + 保存コマンド（write / copy run start）で終わるようにする
 *    （問題文のガイドラインが「設定を NVRAM に保存」を要求しているため）
 *
 * 使い方（リポジトリルートで実行）:
 *   npx tsc scripts/fix_lab_expected_commands.ts src/utils/iosCli.ts src/utils/iosCommand.ts \
 *     --outDir .tmp-fixlab --module commonjs --target es2020 --moduleResolution node --skipLibCheck
 *   node .tmp-fixlab/scripts/fix_lab_expected_commands.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyCommand, INITIAL_STATE, type CliState } from '../src/utils/iosCli';
import { normalizeCommand } from '../src/utils/iosCommand';

const JSON_PATH = resolve(process.cwd(), 'src/data/questions.json');

/** サブモードへ入る（＝グローバル設定モードから打つ）コマンド */
const MODE_ENTER_PATTERNS: RegExp[] = [
  /^interface /,
  /^line /,
  /^router /,
  /^vlan \d+$/,
  /^ip access-list /,
  /^key chain /,
  /^radius server /,
  /^tacacs server /,
  /^aaa group /,
];

/** グローバル設定モード専用で、インターフェース等のサブモードには存在しないコマンド */
const GLOBAL_ONLY_PATTERNS: RegExp[] = [
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
  // ip dhcp / ip arp inspection はインターフェース版（ip dhcp snooping trust,
  // ip dhcp relay information trusted, ip arp inspection trust 等）が存在するため、
  // グローバル設定専用のものだけを列挙する
  /^(no )?ip dhcp (pool|excluded-address)\b/,
  /^(no )?ip dhcp snooping$/,
  /^(no )?ip dhcp snooping (vlan|information|verify|database)\b/,
  /^(no )?ip arp inspection (vlan|validate|filter)\b/,
  /^ip nat inside source /,
  /^ip nat pool /,
  /^access-list /,
  /^username /,
  /^enable (secret|password) /,
  /^service /,
  /^ntp (master|server)\b/,
  /^snmp-server /,
  /^banner /,
  /^aaa /,
  /^spanning-tree (mode|vlan|portfast default)/,
  /^crypto key generate /,
];

const SAVE_NORM = 'copy running-config startup-config';

/** モード移動・保存など、設定そのものではないコマンド */
const NAV_COMMANDS = new Set([
  'enable',
  'disable',
  'configure terminal',
  'exit',
  'end',
  SAVE_NORM,
]);

function needsGlobalMode(norm: string): boolean {
  return (
    MODE_ENTER_PATTERNS.some((re) => re.test(norm)) ||
    GLOBAL_ONLY_PATTERNS.some((re) => re.test(norm))
  );
}

/** config-XXX サブモードか（config 自体は含まない） */
function isSubMode(mode: string): boolean {
  return mode.startsWith('config-');
}

/**
 * `exit` を挿入すべきか判定する。
 * config-if から別の `interface` へ続けて移る形は実機・running-config でも一般的で
 * `exit` を書かないのが普通なので、そこだけは例外として挿入しない。
 */
function needsExitBefore(norm: string, mode: string): boolean {
  if (!isSubMode(mode)) return false;
  if (!needsGlobalMode(norm)) return false;
  if (mode === 'config-if' && /^interface /.test(norm)) return false;
  return true;
}

/**
 * `router ospf 1` の直後に来る `interface ethernet0/1` のような行を取り除く。
 * ルータ設定モードに入った直後にインターフェースを選ぶ意味はなく、続く `router-id` /
 * `network` がインターフェース文脈になってしまうため、取り込み時のノイズと判断する。
 */
function dropStrayInterfaceAfterRouter(commands: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < commands.length; i++) {
    const norm = normalizeCommand(commands[i]);
    const prevNorm = i > 0 ? normalizeCommand(commands[i - 1]) : '';
    if (/^interface /.test(norm) && /^router /.test(prevNorm)) continue;
    out.push(commands[i]);
  }
  return out;
}

/** 1 タスクのコマンド列を正規形に整える。変更が無ければ null を返す。 */
function fixCommands(original: string[]): string[] | null {
  const commands = dropStrayInterfaceAfterRouter(original);
  const out: string[] = [];
  let state: CliState = INITIAL_STATE;
  /** exit で抜けたインターフェース文脈。後続にインターフェース設定が続く場合に復帰させる */
  let pendingRestore: string | null = null;

  for (const raw of commands) {
    const norm = normalizeCommand(raw);
    if (!norm) {
      out.push(raw);
      continue;
    }

    if (needsExitBefore(norm, state.mode)) {
      // config-if から抜ける場合は、後でインターフェース設定が続く可能性があるので文脈を覚える
      pendingRestore = state.mode === 'config-if' ? state.context ?? null : null;
      out.push('exit');
      state = applyCommand(state, 'exit').next;
      // config-keychain-key のような 2 段サブモードは念のためもう 1 段戻す
      if (isSubMode(state.mode)) {
        out.push('exit');
        state = applyCommand(state, 'exit').next;
      }
    } else if (pendingRestore !== null) {
      const isEnter = MODE_ENTER_PATTERNS.some((re) => re.test(norm));
      if (isEnter || NAV_COMMANDS.has(norm)) {
        // 自分でモードを移る／設定以外のコマンド → 復帰は不要
        pendingRestore = null;
      } else if (!needsGlobalMode(norm)) {
        // exit で抜けた後にインターフェース設定コマンドが続く → 元の文脈へ戻す。
        // 戻さないと「config で打ったコマンド」扱いになり、模範解答自体が実機と食い違う。
        out.push(`interface ${pendingRestore}`);
        state = applyCommand(state, `interface ${pendingRestore}`).next;
        pendingRestore = null;
      }
      // グローバル設定コマンドが続く間は pendingRestore を保持したまま
    }

    out.push(raw);
    state = applyCommand(state, raw).next;
  }

  // グローバル設定モードを抜けてしまう余計な `exit` を除去する。
  // 模範解答の `exit` は常に「サブモードを抜ける」意図で書かれており、
  // config から priv へ落ちると以降の設定コマンドが成立しなくなる。
  const trimmed: string[] = [];
  let st: CliState = INITIAL_STATE;
  for (const cmd of out) {
    if (normalizeCommand(cmd) === 'exit' && st.mode === 'config') continue;
    trimmed.push(cmd);
    st = applyCommand(st, cmd).next;
  }
  out.length = 0;
  out.push(...trimmed);

  // 末尾の `end` と保存コマンドを保証する
  const norms = out.map((c) => normalizeCommand(c));
  if (!norms.includes(SAVE_NORM)) {
    if (norms[norms.length - 1] !== 'end') out.push('end');
    out.push('write memory');
  }

  const changed =
    out.length !== original.length || out.some((c, i) => c !== original[i]);
  return changed ? out : null;
}

// ---- 実行 ----
const text = readFileSync(JSON_PATH, 'utf8');
const questions = JSON.parse(text) as {
  number: number;
  type: string;
  lab?: { tasks: { name: string; device: string; expected_commands: string[] }[] };
}[];

let changedTasks = 0;
const report: string[] = [];

for (const q of questions) {
  if (q.type !== 'lab' || !q.lab) continue;
  for (const t of q.lab.tasks) {
    const fixed = fixCommands(t.expected_commands);
    if (!fixed) continue;
    report.push(
      `Q${q.number} [${t.device}] ${t.name}\n` +
        `  before: ${t.expected_commands.join(' / ')}\n` +
        `  after : ${fixed.join(' / ')}`,
    );
    t.expected_commands = fixed;
    changedTasks++;
  }
}

// 元ファイルの書式（2 スペースインデント / CRLF / 末尾改行なし）を維持して書き戻す
const serialized = JSON.stringify(questions, null, 2).replace(/\n/g, '\r\n');
writeFileSync(JSON_PATH, serialized, 'utf8');

console.log(report.join('\n'));
console.log(`\n=== 修正したタスク数: ${changedTasks} ===`);
