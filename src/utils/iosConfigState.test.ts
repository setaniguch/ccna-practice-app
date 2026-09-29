import { describe, it, expect } from 'vitest';
import {
  gradeLabCommands,
  gradeLabLines,
  interpretCommands,
  missingFacts,
} from './iosConfigState';

/** 判定結果を "O/X/- コマンド" の配列にして読みやすくする */
function marks(entered: string[], expected: string[]): string[] {
  return gradeLabLines(entered, expected).map(
    (l) => `${l.optional ? '-' : l.ok ? 'O' : 'X'} ${l.command}`,
  );
}

describe('設定状態の比較: インターフェースごとに区別する', () => {
  const expected = [
    'enable',
    'configure terminal',
    'interface ethernet0/1',
    'ip ospf 33 area 0',
    'interface ethernet0/2',
    'ip ospf 33 area 0',
    'end',
    'write memory',
  ];

  it('e0/1 でしか設定していない ip ospf は e0/2 側では正解にならない', () => {
    const entered = ['enable', 'configure terminal', 'interface e0/1', 'ip ospf 33 area 0'];
    expect(marks(entered, expected)).toEqual([
      '- enable',
      '- configure terminal',
      '- interface ethernet0/1',
      'O ip ospf 33 area 0',
      '- interface ethernet0/2',
      'X ip ospf 33 area 0',
      '- end',
      'X write memory',
    ]);
    // 採点対象は設定を伴う 3 行のみ（移動系は数えない）
    const r = gradeLabCommands(entered, expected);
    expect(r.total).toBe(3);
    expect(r.matched).toBe(1);
  });

  it('両インターフェースを正しく設定すれば満点', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface e0/1',
      'ip ospf 33 area 0',
      'interface e0/2',
      'ip ospf 33 area 0',
      'end',
      'wr',
    ];
    const r = gradeLabCommands(entered, expected);
    expect(r.missing).toEqual([]);
    expect(r.matched).toBe(r.total);
  });
});

describe('設定状態の比較: 手順が違っても結果が同じなら正解', () => {
  const expected = [
    'enable',
    'configure terminal',
    'interface ethernet0/0',
    'switchport mode trunk',
    'switchport trunk allowed vlan 1,12,22',
    'interface ethernet0/1',
    'switchport mode trunk',
    'switchport trunk allowed vlan 1,12,22',
    'end',
    'write memory',
  ];

  it('interface range でまとめて設定しても一致する', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface range e0/0-1',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12,22',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('設定する順序が逆でも一致する', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface e0/1',
      'switchport trunk allowed vlan 1,12,22',
      'switchport mode trunk',
      'interface e0/0',
      'switchport trunk allowed vlan 22,12,1',
      'switchport mode trunk',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('打ち間違えて打ち直しても、最終状態が同じなら正解', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface range e0/0-1',
      'switchport mode access',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12',
      'switchport trunk allowed vlan add 22',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('exit を挟んでも挟まなくても結果は同じ', () => {
    const withExit = [
      'enable',
      'configure terminal',
      'interface e0/0',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12,22',
      'exit',
      'interface e0/1',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12,22',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(withExit, expected).missing).toEqual([]);
  });

  it('片方の IF しか設定していなければ未達成', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface e0/0',
      'switchport mode trunk',
      'switchport trunk allowed vlan 1,12,22',
      'end',
      'write memory',
    ];
    const r = gradeLabCommands(entered, expected);
    expect(r.matched).toBeLessThan(r.total);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

describe('設定状態の比較: EtherChannel', () => {
  const expected = [
    'enable',
    'configure terminal',
    'interface range ethernet0/0 - 1',
    'channel-group 34 mode active',
    'end',
    'write memory',
  ];

  it('個別に channel-group を設定しても一致する', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface ethernet0/0',
      'channel-group 34 mode active',
      'interface ethernet0/1',
      'channel-group 34 mode active',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('片方の IF だけでは未達成', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface ethernet0/0',
      'channel-group 34 mode active',
      'end',
      'write memory',
    ];
    const cg = gradeLabLines(entered, expected).find(
      (l) => l.command === 'channel-group 34 mode active',
    );
    expect(cg?.ok).toBe(false);
  });

  it('mode active と passive は別の設定として区別される', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface range ethernet0/0 - 1',
      'channel-group 34 mode passive',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toContain(
      'channel-group 34 mode active',
    );
  });
});

describe('設定状態の比較: グローバル設定はどのモードで打っても同じ結果', () => {
  it('模範解答が interface 文脈直後に lldp run を置いていても、config で打てば一致', () => {
    const expected = [
      'enable',
      'configure terminal',
      'interface range ethernet0/1 - 3',
      'switchport mode access',
      'switchport access vlan 77',
      'exit',
      'lldp run',
      'end',
      'write memory',
    ];
    const entered = [
      'enable',
      'configure terminal',
      'lldp run',
      'interface range e0/1-3',
      'switchport mode access',
      'switchport access vlan 77',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });
});

describe('設定状態の比較: VLAN', () => {
  const expected = [
    'enable',
    'configure terminal',
    'vlan 35',
    'name SALES',
    'exit',
    'vlan 39',
    'name MARKETING',
    'end',
    'write memory',
  ];

  it('VLAN の作成順が逆でも一致する', () => {
    const entered = [
      'enable',
      'configure terminal',
      'vlan 39',
      'name MARKETING',
      'vlan 35',
      'name SALES',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('名前が違えば不正解', () => {
    const entered = [
      'enable',
      'configure terminal',
      'vlan 35',
      'name SALES',
      'vlan 39',
      'name SALES2',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toContain('name MARKETING');
  });

  it('VLAN 作成を忘れれば不正解', () => {
    const entered = [
      'enable',
      'configure terminal',
      'vlan 35',
      'name SALES',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toContain('vlan 39');
  });
});

describe('設定状態の比較: 保存コマンド', () => {
  const expected = [
    'enable',
    'configure terminal',
    'interface ethernet0/1',
    'no shutdown',
    'end',
    'copy running-config startup-config',
  ];

  it('wr でも write memory でも保存として認められる', () => {
    for (const save of ['wr', 'write', 'write memory', 'copy run start']) {
      const entered = [
        'enable',
        'configure terminal',
        'interface ethernet0/1',
        'no shutdown',
        'end',
        save,
      ];
      expect(gradeLabCommands(entered, expected).missing, save).toEqual([]);
    }
  });

  it('保存を忘れると保存行だけが不正解になる', () => {
    const entered = [
      'enable',
      'configure terminal',
      'interface ethernet0/1',
      'no shutdown',
      'end',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([
      'copy running-config startup-config',
    ]);
  });
});

describe('設定状態の比較: ACL は順序も含めて比較する', () => {
  const expected = [
    'enable',
    'configure terminal',
    'ip access-list extended CORP_ACL',
    'permit tcp any any eq https',
    'deny ip any any log',
    'end',
    'write memory',
  ];

  it('同じ順序なら一致する', () => {
    expect(gradeLabCommands(expected, expected).missing).toEqual([]);
  });

  it('順序が違えば不正解', () => {
    const entered = [
      'enable',
      'configure terminal',
      'ip access-list extended CORP_ACL',
      'deny ip any any log',
      'permit tcp any any eq https',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing.length).toBeGreaterThan(0);
  });

  it('eq https と eq 443 は同一視される', () => {
    const entered = [
      'enable',
      'configure terminal',
      'ip access-list extended CORP_ACL',
      'permit tcp any any eq 443',
      'deny ip any any log',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, expected).missing).toEqual([]);
  });

  it('標準 ACL の host 表記とワイルドカード省略形は同一視される', () => {
    const exp = [
      'enable',
      'configure terminal',
      'ip access-list standard XLATE',
      'permit 10.2.3.3',
      'end',
      'write memory',
    ];
    const entered = [
      'enable',
      'configure terminal',
      'ip access-list standard XLATE',
      'permit host 10.2.3.3',
      'end',
      'write memory',
    ];
    expect(gradeLabCommands(entered, exp).missing).toEqual([]);
  });
});

describe('interpretCommands: 設定状態の組み立て', () => {
  it('後から打ったコマンドが前の設定を上書きする', () => {
    const { facts } = interpretCommands([
      'enable',
      'configure terminal',
      'interface ethernet0/1',
      'switchport access vlan 10',
      'switchport access vlan 35',
    ]);
    expect(facts.get('if:ethernet0/1|access-vlan')).toBe('35');
  });

  it('channel-group を打つと port-channel インターフェースも生成される', () => {
    const { facts } = interpretCommands([
      'enable',
      'configure terminal',
      'interface ethernet0/0',
      'channel-group 12 mode active',
    ]);
    expect(facts.get('if:port-channel12|exists')).toBe('true');
  });

  it('config モードに入っていないコマンドは設定として反映されない', () => {
    const { facts } = interpretCommands(['enable', 'interface ethernet0/1']);
    expect([...facts.keys()].some((k) => k.startsWith('if:ethernet0/1|'))).toBe(false);
  });

  it('解釈できないコマンドは raw ファクトとして残る（黙って正解にならない）', () => {
    const { facts } = interpretCommands([
      'enable',
      'configure terminal',
      'interface ethernet0/1',
      'some-unknown-command foo',
    ]);
    expect(facts.get('raw|if:ethernet0/1|some-unknown-command foo')).toBe('present');
  });
});

describe('missingFacts: 不足している設定を説明できる', () => {
  it('足りない設定が key と期待値で列挙される', () => {
    const expected = [
      'enable',
      'configure terminal',
      'interface ethernet0/2',
      'switchport mode access',
      'switchport access vlan 35',
      'end',
      'write memory',
    ];
    const entered = [
      'enable',
      'configure terminal',
      'interface ethernet0/2',
      'switchport mode access',
      'end',
      'write memory',
    ];
    const missing = missingFacts(entered, expected);
    expect(missing).toEqual([
      { key: 'if:ethernet0/2|access-vlan', expected: '35', actual: undefined },
    ]);
  });
});
