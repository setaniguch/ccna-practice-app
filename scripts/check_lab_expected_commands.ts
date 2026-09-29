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
import { applyCommand, INITIAL_STATE, type CliMode, type CliState } from '../src/utils/iosCli';
import { normalizeCommand } from '../src/utils/iosCommand';
import { commandsForMode } from '../src/utils/iosHelp';

const JSON_PATH = resolve(process.cwd(), 'src/data/questions.json');
const SAVE_NORM = 'copy running-config startup-config';

/**
 * 正規化済みコマンドが、そのモードで入力可能かを判定する。
 *
 * モード語彙には `?` のトップレベル一覧用に 1 語だけの項目（'ip' など）と、
 * ドリルダウン用の複数語フレーズ（'ip route' など）が混在している。
 * 1 語項目だけで判定すると 'ip address'（インターフェース専用）が config でも
 * 通ってしまうため、同じ先頭語を持つ複数語フレーズがある場合はそちらとの
 * 前方一致を要求する。
 */
function isAvailableInMode(norm: string, mode: CliMode): boolean {
  const tokens = norm.split(' ');
  const head = tokens[0];

  // config-if から続けて別の interface を選ぶ形は実機・running-config でも一般的な書き方。
  // モード語彙（実機の `?` 相当）には出てこないが、模範解答としては正しいので許容する。
  if (mode === 'config-if' && head === 'interface') return true;

  const phrases = commandsForMode(mode)
    .map((p) => p.split(/\s+/))
    .filter((pw) => pw[0].toLowerCase() === head);

  if (phrases.length === 0) return false;

  const multi = phrases.filter((pw) => pw.length > 1);
  // 複数語フレーズのいずれかがコマンドの先頭に一致すれば OK。
  // 語彙側はインターフェース種別までしか持たない（'interface ethernet'）ため、
  // フレーズ最終語だけは前方一致で 'ethernet0/1' のような実引数を許容する。
  for (const pw of multi) {
    if (pw.length > tokens.length) continue;
    const matched = pw.every((w, i) => {
      const lw = w.toLowerCase();
      return i === pw.length - 1 ? tokens[i].startsWith(lw) : tokens[i] === lw;
    });
    if (matched) return true;
  }
  // 1 語だけのコマンド（exit / end / permit など）
  if (tokens.length === 1) return true;
  // 複数語フレーズが登録されていない先頭語（'name SALES' の name 等）は判定不能なので許容
  if (multi.length === 0) return true;
  return false;
}

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
