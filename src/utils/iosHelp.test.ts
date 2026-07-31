import { describe, it, expect } from 'vitest';
import {
  classifyHelpQuery,
  commandsForMode,
  generateHelpCandidates,
} from './iosHelp';

function help(input: string, mode: Parameters<typeof commandsForMode>[0]) {
  return generateHelpCandidates(classifyHelpQuery(input), commandsForMode(mode));
}

describe('iosHelp: モード別の ? 候補', () => {
  it('user モードでは設定系コマンドは出ない', () => {
    const c = help('', 'user');
    expect(c).toContain('enable');
    expect(c).not.toContain('interface');
    expect(c).not.toContain('vlan');
    expect(c).not.toContain('switchport');
  });

  it('config-if モードでは switchport 等が出て、enable/vlan は出ない', () => {
    const c = help('', 'config-if');
    expect(c).toContain('switchport');
    expect(c).toContain('channel-group');
    expect(c).not.toContain('enable');
    expect(c).not.toContain('router');
  });

  it('config-if で switchport trunk ? は allowed/native/encapsulation に絞られる', () => {
    const c = help('switchport trunk ', 'config-if');
    expect(c).toEqual(['allowed', 'encapsulation', 'native']);
  });

  it('config モードで ip ? は access-list/address 等に絞られる', () => {
    const c = help('ip ', 'config');
    expect(c).toContain('route');
    expect(c).toContain('access-list');
    expect(c).not.toContain('address'); // ip address は config-if 用
  });

  it('config-if で ip ? は address 等（config専用のrouteは出ない）', () => {
    const c = help('ip ', 'config-if');
    expect(c).toContain('address');
    expect(c).toContain('ospf');
    expect(c).toContain('nat');
  });

  it('config で DHCP プール系サブコマンド(default-router 等)が出る', () => {
    const top = help('', 'config');
    expect(top).toContain('default-router');
    expect(top).toContain('dns-server');
    expect(top).toContain('network');
    // default- で始まる語の補完（default-router / default-information）
    const c = help('default-', 'config');
    expect(c).toContain('default-router');
  });

  it('config で ip arp inspection / ip dhcp snooping が辿れる', () => {
    expect(help('ip arp ', 'config')).toContain('inspection');
    expect(help('ip dhcp ', 'config')).toContain('snooping');
  });
});
