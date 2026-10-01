/**
 * ラボ問題の模範解答（expected_commands）を全問まとめて点検するスクリプト。
 *
 * アプリ自身が `?` ヘルプ用に持っている「モード別コマンド語彙」(iosHelp.MODE_COMMANDS)
 * を正解の判定基準として使い、模範解答の各コマンドが
 * 「そのコマンドを打った時点の CLI モードで実際に入力できるか」を検査する。
 * これにより
 *   - サブモードから抜けずにグローバル設定コマンドを並べている
 *   - インターフェース設定コマンドが config / config-vlan 文脈に置かれている
 *   - 保存コマンドを config モードのまま打っている
 * といったモード不整合をまとめて洗い出せる。
 *
 * 併せて次も確認する:
 *   - enable → configure terminal で始まっているか
 *   - 末尾が保存コマンド（write / copy run start）か
 *   - 同一コマンドの連続重複が無いか
 *
 * 使い方（リポジトリルートで実行）:
 *   npx tsc scripts/check_lab_expected_commands.ts src/utils/iosCli.ts src/utils/iosCommand.ts \
 *     src/utils/iosHelp.ts --outDir .tmp-check --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck --resolveJsonModule
 *   node .tmp-check/scripts/check_lab_expected_commands.js
 *
 * 問題が 1 件でもあれば exit code 1 を返す。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyCommand, INITIAL_STATE, type CliState } from '../src/utils/iosCli';
import { normalizeCommand } from '../src/utils/iosCommand';
// ターミナルの入力検証とまったく同じ判定を使う（二重実装を避ける）
import { isAvailableInMode } from '../src/utils/iosValidate';

const JSON_PATH = resolve(process.cwd(), 'src/data/questions.json');
const SAVE_NORM = 'copy running-config startup-config';

interface Problem {
  kind: string;
  detail: string;
}

function checkTask(commands: string[]): Problem[] {
  const problems: Problem[] = [];
  let state: CliState = INITIAL_STATE;

  commands.forEach((raw, i) => {
    const norm = normalizeCommand(raw);
    if (!norm) {
      problems.push({ kind: 'empty', detail: `[${i}] 空のコマンド` });
      return;
    }
    if (!isAvailableInMode(norm, state.mode)) {
      problems.push({
        kind: 'mode',
        detail: `[${i}] ${state.mode}${state.context ? `(${state.context})` : ''} では打てない: "${raw}"`,
      });
    }
    if (i > 0 && normalizeCommand(commands[i - 1]) === norm && norm !== 'exit') {
      problems.push({ kind: 'dup', detail: `[${i}] 直前と同一コマンドの重複: "${raw}"` });
    }
    state = applyCommand(state, raw).next;
  });

  const norms = commands.map((c) => normalizeCommand(c));
  if (norms[0] !== 'enable') {
    problems.push({ kind: 'start', detail: `enable で始まっていない: "${commands[0]}"` });
  }
  if (!norms.includes('configure terminal')) {
    problems.push({ kind: 'start', detail: 'configure terminal が無い' });
  }
  if (norms[norms.length - 1] !== SAVE_NORM) {
    problems.push({
      kind: 'save',
      detail: `末尾が保存コマンドではない: "${commands[commands.length - 1]}"`,
    });
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
const byKind = new Map<string, number>();
const report: string[] = [];

for (const q of labs) {
  for (const t of q.lab!.tasks) {
    taskCount++;
    const problems = checkTask(t.expected_commands);
    if (problems.length === 0) continue;
    problemCount += problems.length;
    for (const p of problems) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
    report.push(
      `Q${q.number} [${t.device}] ${t.name}\n  ` + problems.map((p) => p.detail).join('\n  '),
    );
  }
}

console.log(report.join('\n'));
console.log(`\n=== ラボ問題 ${labs.length} 問 / タスク ${taskCount} 件を点検 ===`);
console.log(`検出した問題: ${problemCount} 件`);
for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind}: ${n}`);
}
process.exit(problemCount > 0 ? 1 : 0);
