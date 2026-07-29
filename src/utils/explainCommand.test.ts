import { describe, it, expect } from 'vitest';
import { explainCommand } from './explainCommand';

describe('explainCommand', () => {
  it('値の意味を含めて説明する（許可VLAN）', () => {
    const s = explainCommand('switchport trunk allowed vlan 56,77,99');
    expect(s).toContain('56, 77, 99');
    expect(s.length).toBeGreaterThan(0);
  });

  it('EtherChannel の mode を説明する', () => {
    const s = explainCommand('channel-group 34 mode active');
    expect(s).toContain('34');
    expect(s).toContain('LACP');
  });

  it('静的ルートのAD付きを説明する', () => {
    const s = explainCommand('ip route 10.0.41.0 255.255.255.0 10.0.12.2 200');
    expect(s).toContain('200');
  });

  it('柔軟な username 構文を説明する', () => {
    expect(explainCommand('username support password max2learn privilege 15')).toContain('support');
    expect(explainCommand('username devnet privilege 15 algorithm-type sha256 secret x')).toContain('devnet');
  });

  it('未知コマンドは空文字列を返す', () => {
    expect(explainCommand('foobar baz qux')).toBe('');
  });
});
