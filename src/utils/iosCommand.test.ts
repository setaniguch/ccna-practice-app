import { describe, it, expect } from 'vitest';
import { normalizeCommand } from './iosCommand';

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

describe('normalizeCommand: interface range の表記ゆれ吸収', () => {
  const expected = normalizeCommand('interface range ethernet0/0 - 1');

  it.each([
    'interface range ethernet0/0 - 1',
    'interface range ethernet0/0-1',
    'interface range e0/0 - 1',
    'interface range e0/0-1',
    'int range e0/0-1',
    'int ra e0/0 - 1',
    'INTERFACE RANGE Ethernet0/0 - 1',
  ])('「%s」は同じ範囲として一致する', (v) => {
    expect(normalizeCommand(v)).toBe(expected);
  });

  it('別範囲(0/1-3)は一致しない', () => {
    expect(normalizeCommand('interface range e0/1 - 3')).not.toBe(expected);
  });

  it('モジュール番号を欠く e1-3 は 0/1-3 と一致しない（別インターフェース）', () => {
    expect(normalizeCommand('interface range e1-3')).not.toBe(
      normalizeCommand('interface range ethernet0/1 - 3'),
    );
  });

  it('0/1-3 の各種短縮は一致する', () => {
    const base = normalizeCommand('interface range ethernet0/1 - 3');
    expect(normalizeCommand('int ra e0/1-3')).toBe(base);
    expect(normalizeCommand('interface range e0/1 - 3')).toBe(base);
  });
});

describe('normalizeCommand: ip domain name / ip domain-name の等価化', () => {
  it('どちらの表記でも同じに正規化される', () => {
    expect(normalizeCommand('ip domain name cisco.com')).toBe(
      normalizeCommand('ip domain-name cisco.com'),
    );
  });
});
