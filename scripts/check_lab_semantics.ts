/**
 * ラボ模範解答の「設定内容としての矛盾」を検出するスクリプト。
 *
 * check_lab_expected_commands.ts はモード整合性（そのモードで打てるコマンドか）
 * しか見ないため、「モードとしては有効だが設定として矛盾している」ものを取りこぼす。
 * 例: switchport mode trunk のポートに switchport access vlan を設定している。
 *
 * ここでは iosConfigState のインタプリタで最終的な設定状態を組み立て、
 * その状態に対して矛盾ルールを当てる。
 *
 * 使い方（リポジトリルートで実行）:
 *   npx tsc scripts/check_lab_semantics.ts src/utils/iosCli.ts src/utils/iosCommand.ts \
 *     src/utils/iosConfigState.ts --outDir .tmp-sem --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node .tmp-sem/scripts/check_lab_semantics.js
 *
 * 問題が 1 件でもあれば exit code 1 を返す。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  interpretCommands,
  IOS_PORT_KEYWORDS,
  PORT_ALIASES,
  type FactMap,
} from '../src/utils/iosConfigState';

const JSON_PATH = resolve(process.cwd(), 'src/data/questions.json');

/** ファクトから「インターフェース名 → 属性マップ」を取り出す */
function interfaceAttrs(facts: FactMap): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [key, value] of facts) {
    const m = key.match(/^if:([^|]+)\|(.+)$/);
    if (!m) continue;
    const [, ifName, attr] = m;
    if (!out.has(ifName)) out.set(ifName, new Map());
    out.get(ifName)!.set(attr, value);
  }
  return out;
}

/**
 * コマンドの並び順そのものを検査する。
 * 実機ではカプセル化が Auto のポートを先に trunk モードにできないため、
 * `switchport trunk encapsulation` → `switchport mode trunk` の順でなければならない。
 */
function checkOrder(commands: string[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i + 1 < commands.length; i++) {
    const a = commands[i].trim();
    const b = commands[i + 1].trim();
    if (/^switchport mode trunk$/i.test(a) && /^switchport trunk encapsulation /i.test(b)) {
      problems.push(
        `[${i}] "${a}" が "${b}" より前にある（実機はカプセル化を先に設定しないと trunk モードに移れない）`,
      );
    }
  }
  return problems;
}

/** BOOTP / DHCP / TFTP など、UDP でしか使わないポート（tcp と組み合わせると誤り） */
const UDP_ONLY_PORTS = new Set([
  '67', '68', '69', '123', '137', '138', '161', '162', '500', '520', '4500',
]);

/**
 * ACL の ACE を検査する。
 * - IOS が受け付けないポートキーワード（https / bootp など）を使っていないか
 * - UDP 専用ポートを tcp で指定していないか
 */
function checkAces(commands: string[]): string[] {
  const problems: string[] = [];
  for (const raw of commands) {
    const ace = raw.trim();
    if (!/^(permit|deny)\b/i.test(ace) && !/^access-list \d+ (permit|deny)\b/i.test(ace)) continue;

    // ポートキーワードの妥当性
    const kw = ace.match(/\b(?:eq|neq|gt|lt|range)\s+([a-z][a-z0-9-]*)/gi);
    if (kw) {
      for (const hit of kw) {
        const name = hit.split(/\s+/)[1].toLowerCase();
        if (!IOS_PORT_KEYWORDS.has(name)) {
          const num = PORT_ALIASES[name];
          problems.push(
            `"${ace}": IOS の ACL は "${name}" というポートキーワードを受け付けない` +
              (num ? `（ポート番号 ${num} で書く）` : ''),
          );
        }
      }
    }

    // プロトコルとポートの食い違い
    const proto = ace.match(/\b(permit|deny)\s+(tcp|udp)\b/i);
    if (proto) {
      const portTokens = ace.match(/\b(?:eq|neq|range)\s+([a-z0-9][a-z0-9-]*)/gi) ?? [];
      for (const hit of portTokens) {
        const tok = hit.split(/\s+/)[1].toLowerCase();
        const num = PORT_ALIASES[tok] ?? tok;
        if (proto[2].toLowerCase() === 'tcp' && UDP_ONLY_PORTS.has(num)) {
          problems.push(`"${ace}": ポート ${num} は UDP で使うものなので tcp 指定は誤り`);
        }
      }
    }
  }
  return problems;
}

/** トランク専用の属性（access モードのポートにあると矛盾） */
const TRUNK_ONLY = ['trunk-allowed-vlan', 'trunk-native-vlan', 'trunk-encapsulation'];
/** アクセス専用の属性（trunk モードのポートにあると矛盾） */
const ACCESS_ONLY = ['access-vlan'];

function checkFacts(facts: FactMap): string[] {
  const problems: string[] = [];
  const ifs = interfaceAttrs(facts);

  for (const [ifName, attrs] of ifs) {
    const mode = attrs.get('switchport-mode');
    const isRouted = attrs.get('switchport') === 'false';

    // ルーテッドポート（no switchport）にスイッチポート設定が残っている
    if (isRouted) {
      const leftovers = [...attrs.keys()].filter(
        (a) => a.startsWith('switchport-') || a.startsWith('trunk-') || a === 'access-vlan' || a === 'voice-vlan',
      );
      if (leftovers.length > 0) {
        problems.push(
          `${ifName}: no switchport なのにスイッチポート設定が残っている (${leftovers.join(', ')})`,
        );
      }
    }

    // トランクポートに access vlan
    if (mode === 'trunk') {
      for (const a of ACCESS_ONLY) {
        if (attrs.has(a)) {
          problems.push(
            `${ifName}: switchport mode trunk なのに ${a}=${attrs.get(a)} が設定されている` +
              `（トランクでは無効。VLAN を絞るなら switchport trunk allowed vlan）`,
          );
        }
      }
    }

    // アクセスポートにトランク設定
    if (mode === 'access') {
      for (const a of TRUNK_ONLY) {
        if (attrs.has(a)) {
          problems.push(
            `${ifName}: switchport mode access なのに ${a}=${attrs.get(a)} が設定されている`,
          );
        }
      }
    }

    // encapsulation を設定しているのに trunk にしていない
    // （switchport mode trunk が無いとトランクにならず encapsulation だけでは効かない）
    if (attrs.has('trunk-encapsulation') && mode !== 'trunk') {
      problems.push(
        `${ifName}: switchport trunk encapsulation を設定しているが switchport mode trunk が無い` +
          (mode ? `（現在 mode=${mode}）` : ''),
      );
    }

    // channel-group で新規作成された Port-Channel にトランク／アクセス設定が無い。
    // 物理ポートがトランク事前設定済みでも Po は新規作成なので設定を引き継がない。
    if (/^port-channel/.test(ifName) && attrs.get('exists') === 'true') {
      const configured =
        attrs.has('switchport-mode') ||
        attrs.has('trunk-encapsulation') ||
        attrs.has('access-vlan') ||
        attrs.has('trunk-allowed-vlan') ||
        attrs.has('trunk-native-vlan') ||
        attrs.has('ip-address');
      // なお switchport mode の有無は見ない。問題文が「ポートはトランクとして
      // 事前設定済み」としている場合、Po は最初のメンバーポートから設定を継承するため
      // 公式解答でも mode を明示しないことがある（Q808 の模範解答がその例）。
      if (!configured) {
        problems.push(
          `${ifName}: channel-group で新規作成されているが、Port-Channel 側にトランク／アクセス設定が無い`,
        );
      }
    }

    // スイッチポートに IP アドレス
    if (mode && !isRouted && attrs.has('ip-address')) {
      problems.push(
        `${ifName}: switchport mode ${mode} なのに ip address が設定されている（no switchport が必要）`,
      );
    }

    // EtherChannel メンバーと port-channel の設定が食い違う
    const cg = attrs.get('channel-group');
    if (cg) {
      const poId = cg.split(' ')[0];
      const po = ifs.get(`port-channel${poId}`);
      if (po) {
        for (const attr of ['switchport-mode', 'trunk-allowed-vlan', 'trunk-native-vlan', 'access-vlan']) {
          const a = attrs.get(attr);
          const b = po.get(attr);
          if (a !== undefined && b !== undefined && a !== b) {
            problems.push(
              `${ifName} と port-channel${poId} で ${attr} が食い違う（${a} vs ${b}）`,
            );
          }
        }
      }
    }
  }

  // VLAN に名前を付けているが VLAN 自体を作っていない
  for (const [key] of facts) {
    const m = key.match(/^vlan:(\d+)\|name$/);
    if (m && facts.get(`vlan:${m[1]}|exists`) !== 'true') {
      problems.push(`vlan ${m[1]}: name を設定しているが VLAN を作成していない`);
    }
  }

  // ACL を適用しているが定義していない
  for (const [key, value] of facts) {
    const m = key.match(/^if:([^|]+)\|access-group-(in|out)$/);
    if (!m) continue;
    const aclName = value;
    const defined =
      facts.get(`acl:${aclName}|exists`) === 'true' || facts.has(`acl:${aclName}|aces`);
    if (!defined) {
      problems.push(`${m[1]}: ACL "${aclName}" を ${m[2]} に適用しているが定義していない`);
    }
  }

  return problems;
}

// ---- 実行 ----
const questions = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as {
  number: number;
  type: string;
  lab?: { tasks: { name: string; device: string; expected_commands: string[] }[] };
}[];

const labs = questions.filter((q) => q.type === 'lab' && q.lab);
let taskCount = 0;
let problemCount = 0;
const report: string[] = [];

for (const q of labs) {
  for (const t of q.lab!.tasks) {
    taskCount++;
    const { facts } = interpretCommands(t.expected_commands);
    const problems = [
      ...checkFacts(facts),
      ...checkAces(t.expected_commands),
      ...checkOrder(t.expected_commands),
    ];
    if (problems.length === 0) continue;
    problemCount += problems.length;
    report.push(`Q${q.number} [${t.device}] ${t.name}\n  ` + problems.join('\n  '));
  }
}

console.log(report.join('\n'));
console.log(`\n=== ラボ問題 ${labs.length} 問 / タスク ${taskCount} 件を点検 ===`);
console.log(`設定内容の矛盾: ${problemCount} 件`);
process.exit(problemCount > 0 ? 1 : 0);
