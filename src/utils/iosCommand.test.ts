import { describe, it, expect } from 'vitest';
import { gradeLabCommands, normalizeCommand } from './iosCommand';

describe('normalizeCommand: 保存系の等価化', () => {
  const canonical = 'copy running-config startup-config';
  const variants = [
    'wr',
    'wr m',
    'wr mem',
    'wr memory',
    'write',
    'write mem',
    'write memory',
    'copy run start',
    'copy running start',
    'copy running-config startup-config',
    'copy r s',
    'COPY RUN START',
  ];

  it.each(variants)('「%s」は canonical な保存コマンドへ正規化される', (v) => {
    expect(normalizeCommand(v)).toBe(canonical);
  });
});

describe('gradeLabCommands: 保存コマンドの相互一致', () => {
  it('write memory 入力が copy running-config startup-config の正解に一致する', () => {
    const r = gradeLabCommands(
      ['configure terminal', 'write memory'],
      ['configure terminal', 'copy running-config startup-config'],
    );
    expect(r.matched).toBe(2);
    expect(r.total).toBe(2);
    expect(r.missing).toEqual([]);
  });

  it('wr 入力が write memory の正解に一致する', () => {
    const r = gradeLabCommands(['wr'], ['write memory']);
    expect(r.matched).toBe(1);
    expect(r.missing).toEqual([]);
  });
});
