const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

// CCNA 200-301 Official Exam Domains
// 1. Network Fundamentals (20%)
// 2. Network Access (20%)
// 3. IP Connectivity (25%)
// 4. IP Services (10%)
// 5. Security Fundamentals (15%)
// 6. Automation and Programmability (10%)

function classify(question) {
  const qt = (question.question_text || '').toLowerCase();
  const ex = (question.explanation || '').toLowerCase();
  const choiceText = (question.choices || []).map(c => (c.text || '')).join(' ').toLowerCase();
  const all = qt + ' ' + choiceText + ' ' + ex;

  // --- Automation and Programmability ---
  if (/\b(ansible|puppet|chef|salt)\b/.test(all)) return 'Automation and Programmability';
  if (/\b(netconf|restconf|yang)\b/.test(all)) return 'Automation and Programmability';
  if (/\b(sdn|software.defined|コントローラベース|コントローラ.ベース)\b/.test(all) && !/ワイヤレス|wlc|wireless/i.test(qt)) return 'Automation and Programmability';
  if (/\b(rest\s*api|api\s*call|json.format|xml.format|yaml)\b/.test(all) && /自動化|プログラマビリティ|configuration management|構成管理/.test(all)) return 'Automation and Programmability';
  if (/dna\s*center|cisco\s*dna|dnac/.test(all)) return 'Automation and Programmability';
  if (/\b(iac|infrastructure.as.code)\b/.test(all)) return 'Automation and Programmability';
  if (/プログラマビリティ|programmability/.test(all)) return 'Automation and Programmability';
  if (/コントロールプレーン.*集中|集中.*コントロールプレーン/.test(all) && /sdn|software.defined/.test(all)) return 'Automation and Programmability';
  if (/\bhttp\s*(get|put|post|patch|delete)\b/.test(all) && /api|rest/.test(all)) return 'Automation and Programmability';
  if (/configuration\s*management|構成管理ツール/.test(all)) return 'Automation and Programmability';

  // --- Security Fundamentals ---
  if (/\b(aaa|radius|tacacs)\b/.test(all) && !/wlc.*radius/.test(qt)) return 'Security Fundamentals';
  if (/\b(acl|access.list|アクセスリスト|access-list)\b/.test(all) && !/ip\s*helper|dhcp/.test(qt)) return 'Security Fundamentals';
  if (/port.security|ポートセキュリティ|sticky\s*mac|violation\s*mode|err.disabled/.test(all)) return 'Security Fundamentals';
  if (/dhcp\s*snooping|dhcpスヌーピング|ダイナミック\s*arp\s*inspection|\bdai\b|arp\s*spoofing|arp\s*poisoning/.test(all)) return 'Security Fundamentals';
  if (/\b802\.1x\b|サプリカント|オーセンティケーター/.test(all)) return 'Security Fundamentals';
  if (/\b(vpn|ipsec|gre\s*tunnel|dmvpn)\b/.test(all)) return 'Security Fundamentals';
  if (/ファイアウォール|firewall/.test(all)) return 'Security Fundamentals';
  if (/\b(ssh|telnet)\b/.test(all) && /セキュリ|暗号化|脆弱|中間者|mitm|安全|パスワード|認証|vty|リモート.*管理|管理.*アクセス/.test(all)) return 'Security Fundamentals';
  if (/脅威|マルウェア|フィッシング|ddos|dos攻撃|攻撃|セキュリティ.*プログラム|物理.*アクセス制御/.test(all)) return 'Security Fundamentals';
  if (/enable\s*secret|enable\s*password|service\s*password|パスワード.*暗号化|暗号化.*パスワード/.test(all) && !/ospf|eigrp|rip/.test(qt)) return 'Security Fundamentals';
  if (/セキュリティドメイン|セキュリティ.*ゾーン|信頼.*ゾーン/.test(all)) return 'Security Fundamentals';
  if (/\bwpa[123]?\b.*セキュリティ|wireless.*security|無線.*セキュリティ/.test(all) && /暗号化|認証|tkip|aes|ccmp|sae/.test(all) && !/ssid|チャネル|周波数/.test(qt)) return 'Security Fundamentals';

  // --- IP Services ---
  if (/\bdhcp\b/.test(qt) && !/snooping|スヌーピング/.test(qt)) return 'IP Services';
  if (/ip\s*helper|helper.address/.test(all) && !/acl|access-list/.test(qt)) return 'IP Services';
  if (/\bdns\b|ドメイン名.*解決|名前解決|nslookup/.test(all) && !/ssh|rsa|crypto\s*key/.test(qt)) return 'IP Services';
  if (/\bnat\b|\bpat\b|ip\s*nat|アドレス変換|overload/.test(all) && !/acl/.test(qt)) return 'IP Services';
  if (/\bntp\b|network\s*time|時刻同期/.test(all)) return 'IP Services';
  if (/\bsnmp\b/.test(all)) return 'IP Services';
  if (/\bsyslog\b|logging\s*trap|重大度.*レベル|severity.*level/.test(all) && !/port.security|violation/.test(qt)) return 'IP Services';
  if (/\bqos\b|quality\s*of\s*service|dscp|cos値|マーキング.*トラフィック/.test(all)) return 'IP Services';
  if (/ip\s*sla|udp.*ジッター|ジッター.*測定/.test(all)) return 'IP Services';
  if (/\b(ftp|tftp|sftp|scp)\b/.test(all) && /転送|ファイル|コピー/.test(all)) return 'IP Services';
  if (/\brfc\s*1918\b|プライベート.*アドレス.*空間|パブリック.*アドレス.*節約/.test(all)) return 'IP Services';

  // --- IP Connectivity ---
  if (/\bospf\b/.test(all)) return 'IP Connectivity';
  if (/\beirgrp\b|\beigr\b/.test(all)) return 'IP Connectivity';
  if (/\brip\b/.test(all) && /ルーティング|routing|ルート/.test(all)) return 'IP Connectivity';
  if (/\bbgp\b/.test(all)) return 'IP Connectivity';
  if (/\bhsrp\b|\bvrrp\b|\bglbp\b|ファーストホップ冗長|fhrp/.test(all)) return 'IP Connectivity';
  if (/スタティック.*ルート|static.*route|デフォルト.*ルート|default.*route|フローティング.*スタティック|ip\s*route/.test(all)) return 'IP Connectivity';
  if (/ルーティング.*テーブル|routing\s*table|ロンゲスト.*マッチ|longest.*match|アドミニストレーティブ.*ディスタンス/.test(all)) return 'IP Connectivity';
  if (/ルータ.*オン.*スティック|router.on.a.stick|vlan.*間.*ルーティング|inter.vlan|サブインターフェース|sub.?interface/.test(all)) return 'IP Connectivity';
  if (/ルーティング.*プロトコル|routing\s*protocol/.test(all)) return 'IP Connectivity';
  if (/ネクストホップ|next.?hop/.test(all) && /ルート|route|転送|forward/.test(all)) return 'IP Connectivity';
  if (/\bipv6.*ルート|ipv6\s*route|ipv6.*routing/.test(all)) return 'IP Connectivity';
  if (/ゲートウェイ.*ラストリゾート|gateway.*last.*resort|ラストリゾート.*ゲートウェイ/.test(all)) return 'IP Connectivity';

  // --- Network Access ---
  if (/\bvlan\b/.test(all) && !/inter.vlan|vlan間|ルーティング/.test(qt)) return 'Network Access';
  if (/\btrunk\b|トランク|dot1q|802\.1q|ネイティブ.*vlan|native\s*vlan/.test(all)) return 'Network Access';
  if (/\bstp\b|spanning.tree|スパニングツリー|portfast|bpdu|ルートブリッジ|root\s*bridge/.test(all)) return 'Network Access';
  if (/etherchannel|ether.channel|port.channel|lacp|pagp|channel.group|リンクアグリゲーション/.test(all)) return 'Network Access';
  if (/\bcdp\b|cisco\s*discovery/.test(all)) return 'Network Access';
  if (/\blldp\b|link\s*layer\s*discovery/.test(all)) return 'Network Access';
  if (/\bvtp\b|vlan\s*trunking\s*protocol/.test(all)) return 'Network Access';
  if (/\bdtp\b|dynamic\s*trunking/.test(all)) return 'Network Access';
  if (/wireless|ワイヤレス|無線|wlan|wlc|アクセスポイント|\bap\b.*モード|capwap|lwapp|ssid/.test(all)) return 'Network Access';
  if (/\bpoe\b|power\s*over\s*ethernet/.test(all)) return 'Network Access';
  if (/flexconnect|lightweight\s*ap|autonomous\s*ap/.test(all)) return 'Network Access';
  if (/\bwpa[123]?\b/.test(all)) return 'Network Access';
  if (/mac.*アドレス.*学習|mac.*learning|cam.*テーブル|macアドレステーブル/.test(all) && !/port.security/.test(all)) return 'Network Access';
  if (/フラッディング|flooding|unknown\s*unicast/.test(all)) return 'Network Access';
  if (/スイッチ.*設定|switch.*config/.test(all) && /ポート|interface|インターフェース/.test(all)) return 'Network Access';

  // --- Network Fundamentals ---
  if (/\bosi\b|tcp.*ip.*モデル|レイヤ[ー]?\s*[1-7]|layer\s*[1-7]|物理層|データリンク層|ネットワーク層|トランスポート層|アプリケーション層/.test(all)) return 'Network Fundamentals';
  if (/サブネット|subnet|cidr|プレフィックス.*長|\/\d{1,2}|ネットワークマスク|ワイルドカード/.test(all)) return 'Network Fundamentals';
  if (/ipv6.*アドレス|ipv6\s*address|ユニークローカル|リンクローカル|グローバルユニキャスト|fe80|fd00|2001:/.test(all) && !/route|ルーティング|ルート/.test(qt)) return 'Network Fundamentals';
  if (/ipv4.*アドレス|ipアドレス.*設定|サブネットマスク/.test(all) && !/nat|dhcp|ospf|eigrp|acl/.test(qt)) return 'Network Fundamentals';
  if (/\btcp\b.*\budp\b|\budp\b.*\btcp\b|tcp.*udp.*違い|コネクション.*型/.test(all)) return 'Network Fundamentals';
  if (/トポロジ|topology|スター型|メッシュ型|バス型/.test(all)) return 'Network Fundamentals';
  if (/クラウド|iaas|paas|saas|cloud/.test(all)) return 'Network Fundamentals';
  if (/ケーブル|cable|光ファイバー|fiber|utp|stp.*ケーブル|rj.45|sfp|1000base|100base|10gbase/.test(all) && !/spanning|スパニング/.test(all)) return 'Network Fundamentals';
  if (/\blan\b|\bwan\b|\bmpls\b|sd.wan/.test(all) && /ネットワーク.*タイプ|ネットワーク.*種類|接続.*タイプ/.test(all)) return 'Network Fundamentals';
  if (/エンドポイント|endpoint/.test(all)) return 'Network Fundamentals';
  if (/半二重|全二重|half.duplex|full.duplex|デュプレックス/.test(all)) return 'Network Fundamentals';
  if (/帯域幅|bandwidth|スループット|throughput|レイテンシ|latency/.test(all) && !/qos|dscp/.test(all)) return 'Network Fundamentals';
  if (/コリジョン|collision|ブロードキャスト.*ドメイン|コリジョン.*ドメイン/.test(all) && !/stp|spanning/.test(all)) return 'Network Fundamentals';
  if (/\barp\b|アドレス解決|ndp|neighbor\s*discovery/.test(all) && !/dai|snooping|spoofing|inspection/.test(all)) return 'Network Fundamentals';
  if (/\bicmp\b|ping|traceroute/.test(all) && !/acl|access.list/.test(qt)) return 'Network Fundamentals';
  if (/\bmtu\b|フラグメント/.test(all)) return 'Network Fundamentals';
  if (/http.*put|http.*get|http.*post|rest\s*api/.test(all) && !/ansible|puppet|chef|sdn|dna/.test(all)) return 'Network Fundamentals';

  // Fallback: use existing category mapping
  const oldCat = question.category || '';
  const mapping = {
    'ネットワーク基礎': 'Network Fundamentals',
    'ネットワークアクセス': 'Network Access',
    'IP接続': 'IP Connectivity',
    'IPサービス': 'IP Services',
    'セキュリティ基礎': 'Security Fundamentals',
    '自動化': 'Automation and Programmability',
    'ワイヤレス': 'Network Access',
  };
  return mapping[oldCat] || 'Network Fundamentals';
}

// Classify all questions
const stats = {};
let changed = 0;
q.forEach(question => {
  const newCat = classify(question);
  if (question.category !== newCat) changed++;
  question.category = newCat;
  stats[newCat] = (stats[newCat] || 0) + 1;
});

fs.writeFileSync('src/data/questions.json', JSON.stringify(q, null, 2), 'utf8');

console.log(`\n=== カテゴリ再分類完了 ===`);
console.log(`全${q.length}問, ${changed}問変更\n`);
Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  const pct = ((count / q.length) * 100).toFixed(1);
  console.log(`  ${cat.padEnd(35)} ${String(count).padStart(4)}問 (${pct}%)`);
});
