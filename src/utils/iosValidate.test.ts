import { describe, expect, it } from 'vitest';
import questions from '../data/questions.json';
import type { Question } from '../types';
import { applyCommand, INITIAL_STATE, type CliState } from './iosCli';
import { buildCaretLine, validateCommand } from './iosValidate';

describe('validateCommand: 実機同様に不正な入力を弾く', () => {
  it('vlan キーワードを忘れた switchport trunk allowed は弾かれる', () => {
    const r = validateCommand('switchport trunk allowed 303', 'config-if');
    expect(r.valid).toBe(false);
  });

  it('正しい switchport trunk allowed vlan は通る', () => {
    expect(validateCommand('switchport trunk allowed vlan 303', 'config-if').valid).toBe(true);
  });

  it('キャレットが不正トークンの先頭を指す', () => {
    const input = 'switchport trunk allowed 303';
    const r = validateCommand(input, 'config-if');
    // "switchport trunk allowed " までが有効な接頭辞なので、その直後を指す
    expect(input.slice(r.caretIndex)).toBe('303');
  });

  it('モードが違うコマンドは弾かれる', () => {
    // ip address はインターフェース専用
    expect(validateCommand('ip address 10.0.0.1 255.255.255.0', 'config').valid).toBe(false);
    expect(validateCommand('ip address 10.0.0.1 255.255.255.0', 'config-if').valid).toBe(true);
    // switchport は config では打てない
    expect(validateCommand('switchport mode trunk', 'config').valid).toBe(false);
  });

  it('短縮形でも通る', () => {
    expect(validateCommand('conf t', 'priv').valid).toBe(true);
    expect(validateCommand('int e0/1', 'config').valid).toBe(true);
    expect(validateCommand('wr', 'priv').valid).toBe(true);
  });

  it('exit / end はどのモードでも通る', () => {
    for (const mode of ['config', 'config-if', 'config-vlan', 'config-line', 'config-router'] as const) {
      expect(validateCommand('exit', mode).valid, mode).toBe(true);
      expect(validateCommand('end', mode).valid, mode).toBe(true);
    }
  });

  it('存在しないコマンドは弾かれる', () => {
    expect(validateCommand('swichport mode trunk', 'config-if').valid).toBe(false);
    expect(validateCommand('foobar', 'config').valid).toBe(false);
  });

  it('キャレット行はプロンプト幅ぶん字下げされる', () => {
    expect(buildCaretLine(10, 3)).toBe(' '.repeat(13) + '^');
  });
});

describe('validateCommand: 全ラボ模範解答が通る（誤検知が無い）', () => {
  it('36問 / 86タスクの全コマンドが有効と判定される', () => {
    const labs = (questions as Question[]).filter((q) => q.type === 'lab' && q.lab);
    const rejected: string[] = [];
    for (const q of labs) {
      for (const t of q.lab!.tasks) {
        let cli: CliState = INITIAL_STATE;
        for (const cmd of t.expected_commands) {
          if (!validateCommand(cmd, cli.mode).valid) {
            rejected.push(`Q${q.number} [${t.device}] ${cli.mode}: ${cmd}`);
          }
          cli = applyCommand(cli, cmd).next;
        }
      }
    }
    expect(rejected).toEqual([]);
  });
});
