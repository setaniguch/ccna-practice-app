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
import { interpretCommands, type FactMap } from '../src/utils/iosConfigState';

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
    const problems = checkFacts(facts);
    if (problems.length === 0) continue;
    problemCount += problems.length;
    report.push(`Q${q.number} [${t.device}] ${t.name}\n  ` + problems.join('\n  '));
  }
}

console.log(report.join('\n'));
console.log(`\n=== ラボ問題 ${labs.length} 問 / タスク ${taskCount} 件を点検 ===`);
console.log(`設定内容の矛盾: ${problemCount} 件`);
process.exit(problemCount > 0 ? 1 : 0);
