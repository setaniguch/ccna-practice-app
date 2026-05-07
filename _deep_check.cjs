const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

// Comprehensive topic extraction and matching
const topicKeywords = {
  'OSPF': ['ospf', 'open shortest path', 'エリア0', 'area 0', 'lsa', 'dr/bdr', 'hello-interval', 'dead-interval', 'ネイバー関係'],
  'EIGRP': ['eigrp', 'dual', 'feasible', 'successor', 'reported distance'],
  'BGP': ['bgp', 'autonomous system', 'as-path', 'ebgp', 'ibgp'],
  'RIP': ['rip ', 'routing information protocol'],
  'STP': ['spanning-tree', 'スパニングツリー', 'bpdu', 'root bridge', 'ルートブリッジ', 'portfast'],
  'HSRP': ['hsrp', 'hot standby'],
  'VRRP': ['vrrp', 'virtual router redundancy'],
  'CDP': ['cdp', 'cisco discovery'],
  'LLDP': ['lldp', 'link layer discovery'],
  'LACP': ['lacp', 'etherchannel', 'port-channel', 'channel-group'],
  'DHCP': ['dhcp', 'ip helper', 'address pool'],
  'DNS': ['dns', 'domain name', 'ドメイン名', 'nslookup'],
  'NTP': ['ntp', 'network time', '時刻同期'],
  'NAT': ['ip nat', 'nat ', 'overload', 'pat '],
  'ACL': ['access-list', 'access list', 'アクセスリスト', 'acl', 'permit', 'deny'],
  'SSH': ['ssh', 'crypto key', 'rsa鍵'],
  'Telnet': ['telnet', 'vty'],
  'SNMP': ['snmp', 'simple network management'],
  'Syslog': ['syslog', 'logging'],
  'IPv6': ['ipv6', 'fe80', '2001:', 'fd00'],
  'VLAN': ['vlan', 'switchport access', 'switchport mode'],
  'Trunk': ['trunk', 'dot1q', '802.1q', 'encapsulation'],
  'Wireless': ['wireless', 'wlan', 'ssid', 'wlc', 'capwap', 'アクセスポイント', 'ap '],
  'WPA': ['wpa2', 'wpa3', 'wep', '802.11'],
  'PortSecurity': ['port-security', 'ポートセキュリティ', 'violation', 'sticky mac'],
  'DAI': ['arp inspection', 'dai', 'arp spoofing'],
  'DHCPSnooping': ['dhcp snooping', 'dhcpスヌーピング'],
  'AAA': ['aaa', 'radius', 'tacacs'],
  'Ansible': ['ansible', 'playbook', 'yaml'],
  'Puppet': ['puppet', 'manifest', 'マニフェスト'],
  'Chef': ['chef', 'recipe', 'cookbook'],
  'NETCONF': ['netconf', 'yang'],
  'RESTCONF': ['restconf'],
  'QoS': ['qos', 'quality of service', 'dscp', 'cos'],
  'Cloud': ['iaas', 'paas', 'saas', 'クラウド'],
  'SDN': ['sdn', 'software-defined', 'controller'],
  'IPsec': ['ipsec', 'vpn', 'gre tunnel'],
};

const issues = [];

q.forEach(x => {
  const n = x.number;
  const qt = (x.question_text || '').toLowerCase();
  const ex = (x.explanation || '').toLowerCase();
  const choiceText = (x.choices || []).map(c => c.text).join(' ').toLowerCase();
  const fullQ = qt + ' ' + choiceText;
  
  // Skip lab questions
  if (qt.includes('シミュレーション') || qt.includes('ラボ問題')) return;
  
  // Find primary topic of question
  let qTopics = [];
  let eTopics = [];
  
  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    if (keywords.some(k => fullQ.includes(k))) qTopics.push(topic);
    if (keywords.some(k => ex.includes(k))) eTopics.push(topic);
  });
  
  // Flag if question has a clear topic but explanation is about something completely different
  if (qTopics.length >= 1 && eTopics.length >= 1) {
    const overlap = qTopics.filter(t => eTopics.includes(t));
    if (overlap.length === 0 && qTopics.length <= 3) {
      // No overlap between question topics and explanation topics
      issues.push({
        n,
        qTopics: qTopics.join(','),
        eTopics: eTopics.join(','),
        q: qt.substring(0, 60),
        ex: ex.substring(0, 60)
      });
    }
  }
});

console.log(`\n=== Topic Mismatch Analysis ===`);
console.log(`Detected: ${issues.length} potential mismatches\n`);
issues.sort((a, b) => a.n - b.n);
issues.forEach(i => {
  console.log(`Q${i.n} | QTopic=[${i.qTopics}] ETopic=[${i.eTopics}]`);
  console.log(`  Q: ${i.q}`);
  console.log(`  EX: ${i.ex}`);
  console.log();
});
