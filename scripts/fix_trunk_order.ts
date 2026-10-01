/**
 * `switchport mode trunk` が `switchport trunk encapsulation ...` より前に来ている箇所を入れ替える。
 *
 * 実機の Catalyst では、カプセル化が Auto のインターフェースを先に trunk モードにしようとすると
 *   Command rejected: An interface whose trunk encapsulation is "Auto"
 *   can not be configured to "trunk" mode.
 * となり拒否される。したがって encapsulation → mode の順でなければならない。
 *
 * 使い方（リポジトリルートで実行）:
 *   npx tsc scripts/fix_trunk_order.ts --outDir .tmp-order --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node .tmp-order/scripts/fix_trunk_order.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const JSON_PATH = resolve(process.cwd(), 'src/data/questions.json');

const MODE_TRUNK = /^switchport mode trunk$/i;
const ENCAP = /^switchport trunk encapsulation /i;

/** 入れ替えた件数を返す */
function fixOrder(commands: string[]): number {
  let swapped = 0;
  for (let i = 0; i + 1 < commands.length; i++) {
    if (MODE_TRUNK.test(commands[i].trim()) && ENCAP.test(commands[i + 1].trim())) {
      const tmp = commands[i];
      commands[i] = commands[i + 1];
      commands[i + 1] = tmp;
      swapped++;
    }
  }
  return swapped;
}

const text = readFileSync(JSON_PATH, 'utf8');
const questions = JSON.parse(text) as {
  number: number;
  type: string;
  lab?: { tasks: { device: string; expected_commands: string[] }[] };
}[];

let total = 0;
const report: string[] = [];
for (const q of questions) {
  if (q.type !== 'lab' || !q.lab) continue;
  for (const t of q.lab.tasks) {
    const n = fixOrder(t.expected_commands);
    if (n > 0) {
      total += n;
      report.push(`Q${q.number} [${t.device}] ${n} 箇所`);
    }
  }
}

writeFileSync(JSON_PATH, JSON.stringify(questions, null, 2).replace(/\n/g, '\r\n'), 'utf8');
console.log(report.join('\n'));
console.log(`\n=== 入れ替え: ${total} 箇所 ===`);
