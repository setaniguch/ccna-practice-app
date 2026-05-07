/**
 * CCNA 200-301 の公式ドメインに基づいて questions.json の各問題に category フィールドを付与する。
 * 
 * ドメイン:
 *   1. ネットワーク基礎 (Network Fundamentals)
 *   2. ネットワークアクセス (Network Access) — VLAN, STP, EtherChannel, スイッチ
 *   3. IP接続 (IP Connectivity) — ルーティング, OSPF, スタティックルート
 *   4. IPサービス (IP Services) — NAT, DHCP, DNS, NTP, SNMP, syslog, QoS
 *   5. セキュリティ基礎 (Security Fundamentals) — ACL, AAA, VPN, ポートセキュリティ, WPA
 *   6. 自動化 (Automation & Programmability) — SDN, API, JSON, Ansible, DNA Center
 */
const fs = require('fs');

const questions = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

const rules = [
  {
    category: '自動化',
    keywords: [
      'SDN', 'API', 'REST', 'JSON', 'YAML', 'XML',
      'Ansible', 'Puppet', 'Chef', 'DNA Center', 'DNAC',
      'コントローラ', 'controller', 'northbound', 'southbound',
      'ノースバウンド', 'サウスバウンド',
      'オーケストレーション', 'orchestrat',
      'playbook', 'manifest', 'module',
      'NETCONF', 'RESTCONF', 'OpenFlow',
      '自動化', 'automation', 'programmab',
      'クラウド', 'cloud', 'IaaS', 'SaaS', 'PaaS',
      '仮想マシン', 'virtual machine', 'VM', 'hypervisor', 'ハイパーバイザー',
      '仮想化', 'virtualiz',
      'コントロールプレーン', 'データプレーン', 'control plane', 'data plane',
      'management plane', '管理プレーン',
      'intent API', 'CRUD',
      'JWT', 'token',
      'HTTP method', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
    ],
    antiKeywords: ['DHCP', 'ACL', 'OSPF', 'STP', 'VLAN', 'NAT'],
  },
  {
    category: 'セキュリティ基礎',
    keywords: [
      'ACL', 'access.list', 'access-list', 'アクセスリスト', 'アクセス制御',
      'AAA', 'RADIUS', 'TACACS', 'authentication', 'authorization', 'accounting',
      '認証', '認可', 'アカウンティング',
      'VPN', 'IPsec', 'トンネル', 'tunnel',
      'WPA', 'WPA2', 'WPA3', 'WEP', 'TKIP', 'AES', 'CCMP', 'SAE',
      'ポートセキュリティ', 'port.security', 'port-security',
      'err-disabled',
      'firewall', 'ファイアウォール',
      'セキュリティ', 'security',
      'MACアドレスフィルタ', 'MAC address filter',
      'DHCP snooping', 'Dynamic ARP', 'DAI', 'ARP inspection',
      'IP Source Guard',
      'storm control', 'ストーム',
      'マルウェア', 'malware', 'フィッシング', 'phishing',
      'DoS', 'DDoS', '攻撃', 'attack', '脅威', 'threat',
      'パスワード', 'password', 'enable secret',
      'SSH', 'Telnet', 'transport input',
      '暗号', 'encrypt', '証明書', 'certificate',
      'ISE', '802.1X', '802.1x', 'dot1x',
      '多要素', 'MFA', '生体認証', 'biometric',
      'VLANホッピング', 'VLAN hopping',
      'ブルートフォース', 'brute force',
    ],
  },
  {
    category: 'IPサービス',
    keywords: [
      'NAT', 'PAT', 'overload', 'ip nat',
      'DHCP', 'dhcp', 'ip helper', 'helper-address',
      'DNS', 'ドメイン名', 'domain name', 'ip domain',
      'NTP', 'clock set', 'clock timezone',
      'SNMP', 'snmp-server', 'MIB', 'トラップ',
      'syslog', 'ロギング', 'logging',
      'QoS', 'quality of service', 'marking', 'policing', 'shaping',
      'queuing', 'キューイング', 'CBWFQ', 'LLQ', 'WRED',
      'classification', 'DSCP', 'CoS', 'トラフィッククラス',
      'FTP', 'TFTP', 'HTTP', 'HTTPS', 'SMTP', 'POP3',
      'TCP', 'UDP', 'ポート番号',
    ],
    antiKeywords: ['OSPF', 'VLAN', 'STP', 'EtherChannel'],
  },
  {
    category: 'IP接続',
    keywords: [
      'OSPF', 'エリア', 'area ', 'ルーティング', 'routing',
      'スタティックルート', 'static route', 'ip route',
      'デフォルトルート', 'default route',
      'ルーティングテーブル', 'routing table',
      'アドミニストレーティブディスタンス', 'administrative distance', 'AD値',
      'メトリック', 'metric',
      'ネクストホップ', 'next.hop', 'next-hop',
      'ルーティングプロトコル', 'routing protocol',
      'EIGRP', 'BGP', 'RIP',
      'ルートサマリゼーション', 'route summar',
      'コンバージェンス', 'convergence',
      'パッシブインターフェース', 'passive.interface',
      'ルーター間', 'router-id', 'ルーターID',
      'ゲートウェイ', 'gateway', 'デフォルトゲートウェイ',
      'FHRP', 'HSRP', 'VRRP', 'GLBP',
      'フローティングスタティック', 'floating static',
      'IPv6ルーティング', 'ipv6 route',
      'ルートブリッジ',
    ],
    antiKeywords: ['VLAN', 'STP'],
  },
  {
    category: 'ネットワークアクセス',
    keywords: [
      'VLAN', 'vlan', 'トランク', 'trunk', '802.1q', '802.1Q',
      'STP', 'スパニングツリー', 'spanning.tree', 'RSTP', 'PVST', 'BPDU',
      'ルートブリッジ', 'root bridge', 'ブリッジプライオリティ',
      'EtherChannel', 'ether.channel', 'LACP', 'PAgP', 'port.channel', 'ポートチャネル',
      'DTP', 'VTP',
      'スイッチ', 'switch', 'Switch',
      'アクセスポート', 'access port', 'switchport mode',
      'ネイティブVLAN', 'native vlan',
      'PoE', 'Power over Ethernet',
      'CDP', 'LLDP',
      'MACアドレステーブル', 'MAC address table', 'CAMテーブル',
      'フレーム', 'frame',
      'err-disable',
    ],
    antiKeywords: ['OSPF', 'NAT', 'DHCP', 'ACL'],
  },
  {
    category: 'ワイヤレス',
    keywords: [
      'ワイヤレス', 'wireless', 'Wi-Fi', 'WiFi', 'WLAN',
      'WLC', 'アクセスポイント', 'access point', ' AP ',
      '802.11', 'SSID', 'BSS', 'ESS',
      'チャネル', 'channel',
      '2.4.GHz', '5.GHz', '周波数',
      'ローミング', 'roaming',
      'CAPWAP', 'LWAPP',
      'RF', '電波', 'アンテナ', 'antenna',
      'Lightweight', 'autonomous',
    ],
  },
  {
    category: 'ネットワーク基礎',
    keywords: [
      'OSI', 'レイヤ', 'layer',
      'サブネット', 'subnet', 'CIDR', 'VLSM', 'プレフィックス',
      'IPv4', 'IPv6', 'IPアドレス', 'IP address',
      'ブロードキャスト', 'broadcast', 'マルチキャスト', 'multicast', 'ユニキャスト', 'unicast',
      'ケーブル', 'cable', 'UTP', 'STP', 'ファイバ', 'fiber', '光ファイバ',
      'トポロジ', 'topology', 'メッシュ', 'mesh', 'スター', 'star',
      'WAN', 'LAN', 'MAN',
      'イーサネット', 'Ethernet',
      'MTU', 'TTL',
      'TCP/IP', 'ARP',
      'SOHO',
      'コラプスト', 'collapsed', 'コア層', 'ディストリビューション', 'アクセス層',
      'GLC', 'SFP', 'GBIC', 'トランシーバ',
      '専用線', 'leased line', 'ポイントツーポイント',
      'コネクタ', 'connector', ' LC ', ' SC ', ' ST ',
      'サーバ', 'server',
      'エンドポイント', 'endpoint',
    ],
  },
];

function classify(q) {
  const text = [
    q.question_text || '',
    (q.choices || []).map(c => c.text).join(' '),
    (q.dd_items || []).map(i => i.text).join(' '),
    (q.dd_targets || []).map(t => t.text).join(' '),
  ].join(' ');

  let bestCategory = 'ネットワーク基礎';
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const kw of rule.keywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(text)) score++;
    }
    // Anti-keywords reduce score if this is not the primary topic
    if (rule.antiKeywords) {
      for (const akw of rule.antiKeywords) {
        const re = new RegExp(akw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (re.test(text)) score -= 0.3;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

// Classify and count
const counts = {};
for (const q of questions) {
  q.category = classify(q);
  counts[q.category] = (counts[q.category] || 0) + 1;
}

console.log('=== Category distribution ===');
for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
console.log(`  Total: ${questions.length}`);

fs.writeFileSync('src/data/questions.json', JSON.stringify(questions, null, 2), 'utf8');
console.log('Done: category field added to all questions.');
