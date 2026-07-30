import { describe, it, expect } from 'vitest';
import { gradeLabCommands, gradeLabLines, normalizeCommand } from './iosCommand';

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

describe('gradeLabCommands: コンテキスト（インターフェース）を区別する', () => {
  const expected = [
    'enable',
    'configure terminal',
    'interface ethernet0/1',
    'ip ospf 33 area 0',
    'interface ethernet0/2',
    'ip ospf 33 area 0',
    'end',
  ];

  it('e0/1 でしか打っていない ip ospf は e0/2 側では正解にならない', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface e0/1',
      'ip ospf 33 area 0',
    ];
    const lines = gradeLabLines(entered, expected);
    // interface ethernet0/1 と その ip ospf は ok、interface ethernet0/2 側の ip ospf は ng
    const byCmd = lines.map((l) => `${l.ok ? 'O' : 'X'} ${l.command}`);
    expect(byCmd).toEqual([
      'O enable',
      'O configure terminal',
      'O interface ethernet0/1',
      'O ip ospf 33 area 0',
      'X interface ethernet0/2',
      'X ip ospf 33 area 0',
      'X end',
    ]);
    const r = gradeLabCommands(entered, expected);
    expect(r.matched).toBe(4);
    expect(r.total).toBe(7);
  });

  it('両インターフェースを正しく設定すれば全一致する', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface e0/1',
      'ip ospf 33 area 0',
      'interface e0/2',
      'ip ospf 33 area 0',
      'end',
    ];
    const r = gradeLabCommands(entered, expected);
    expect(r.matched).toBe(r.total);
  });
});

describe('gradeLabCommands: interface range と個別 interface の等価', () => {
  const expected = [
    'enable', 'configure terminal',
    'interface ethernet0/0',
    'switchport mode trunk',
    'switchport trunk allowed vlan 1,12,22',
    'interface ethernet0/1',
    'switchport mode trunk',
    'switchport trunk allowed vlan 1,12,22',
  ];

  it('range e0/0-1 でまとめて設定しても個別設定の期待に一致する', () => {
    const entered = [
      'enable', 'configure terminal',
      'interface range e0/0-1',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12,22',
    ];
    const r = gradeLabCommands(entered, expected);
    expect(r.matched).toBe(r.total);
  });

  it('逆に、期待が range でも個別入力で一致する', () => {
    const exp = [
      'enable', 'configure terminal',
      'interface range ethernet0/0 - 1',
      'channel-group 34 mode active',
    ];
    const entered = [
      'enable', 'configure terminal',
      'interface ethernet0/0', 'channel-group 34 mode active',
      'interface ethernet0/1', 'channel-group 34 mode active',
    ];
    const r = gradeLabCommands(entered, exp);
    expect(r.matched).toBe(r.total);
  });

  it('片方の IF しか設定していなければ range 期待は未達成', () => {
    const exp = [
      'enable', 'configure terminal',
      'interface range ethernet0/0 - 1',
      'channel-group 34 mode active',
    ];
    const entered = [
      'enable', 'configure terminal',
      'interface ethernet0/0', 'channel-group 34 mode active',
    ];
    const lines = gradeLabLines(entered, exp);
    const cg = lines.find((l) => l.command === 'channel-group 34 mode active');
    expect(cg?.ok).toBe(false);
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
