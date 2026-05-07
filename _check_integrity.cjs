const fs = require('fs');
const q = JSON.parse(fs.readFileSync('src/data/questions.json', 'utf8'));

const issues = [];

// Key protocols/technologies to check
const protocols = ['ospf','eigrp','rip','bgp','hsrp','vrrp','glbp','stp','rstp','pvst',
  'dhcp','dns','ntp','snmp','ssh','telnet','radius','tacacs','aaa',
  'vlan','trunk','etherchannel','lacp','pagp','port-channel',
  'nat','pat','acl','ipv6','ipv4','arp','icmp','tcp','udp',
  'wpa2','wpa3','wep','ssid','capwap','lwapp',
  'ansible','puppet','chef','netconf','restconf','yang',
  'syslog','netflow','cdp','lldp','ftp','tftp','sftp','scp'];

q.forEach(x => {
  const n = x.number;
  const ans = x.answer;
  const choices = x.choices || [];
  const ex = (x.explanation || '');
  const qt = (x.question_text || '');
  const exLower = ex.toLowerCase();
  const qtLower = qt.toLowerCase();

  // Check 1: Empty/missing explanation
  if (!ex || ex.trim().length < 15) {
    issues.push({ n, type: 'EMPTY', msg: '解説が空または極端に短い' });
    return;
  }

  // Check 2: For single-choice, verify explanation mentions the correct answer's protocol
  if (ans && ans.length === 1 && choices.length > 0) {
    const correctChoice = choices.find(c => c.letter === ans);
    if (correctChoice && correctChoice.text) {
      const correctText = correctChoice.text.toLowerCase();
      const correctProtocol = protocols.find(p => correctText.includes(p));
      if (correctProtocol && !exLower.includes(correctProtocol)) {
        issues.push({ n, type: 'MISSING_PROTOCOL', msg: `正解=${ans}(${correctText.substring(0,35)}) だが解説に「${correctProtocol}」なし` });
      }
    }

    // Check if explanation explicitly states wrong answer
    choices.filter(c => c.letter !== ans).forEach(wc => {
      const patterns = [
        `正解は${wc.letter}`,
        `答えは${wc.letter}`,
        `${wc.letter}が正解`,
        `${wc.letter}が正しい`
      ];
      patterns.forEach(pat => {
        if (exLower.includes(pat.toLowerCase())) {
          issues.push({ n, type: 'WRONG_ANSWER', msg: `解説が「${pat}」と記述（正解は${ans}）` });
        }
      });
    });
  }

  // Check 3: Topic mismatch - question about X but explanation about completely different Y
  const topicChecks = [
    { qTerms: ['ospf'], exTerms: ['eigrp'], exMustNot: ['ospf'], label: 'Q=OSPF, EX=EIGRPのみ' },
    { qTerms: ['eigrp'], exTerms: ['ospf'], exMustNot: ['eigrp'], label: 'Q=EIGRP, EX=OSPFのみ' },
    { qTerms: ['スパニングツリー', 'stp', 'rstp'], exTerms: ['hsrp', 'vrrp'], exMustNot: ['スパニング', 'stp', 'rstp'], label: 'Q=STP, EX=FHRPのみ' },
    { qTerms: ['hsrp'], exTerms: ['stp', 'スパニング'], exMustNot: ['hsrp'], label: 'Q=HSRP, EX=STPのみ' },
    { qTerms: ['ansible'], exTerms: ['puppet', 'chef'], exMustNot: ['ansible'], label: 'Q=Ansible, EX=Puppet/Chefのみ' },
    { qTerms: ['netconf'], exTerms: ['restconf'], exMustNot: ['netconf'], label: 'Q=NETCONF, EX=RESTCONFのみ' },
    { qTerms: ['snmpv3', 'snmp v3'], exTerms: ['snmpv2', 'snmp v2'], exMustNot: ['snmpv3', 'snmp v3', 'v3'], label: 'Q=SNMPv3, EX=SNMPv2のみ' },
    { qTerms: ['ipv6'], exTerms: ['ipv4'], exMustNot: ['ipv6'], label: 'Q=IPv6, EX=IPv4のみ' },
    { qTerms: ['wpa3'], exTerms: ['wpa2'], exMustNot: ['wpa3'], label: 'Q=WPA3, EX=WPA2のみ' },
    { qTerms: ['radius'], exTerms: ['tacacs'], exMustNot: ['radius'], label: 'Q=RADIUS, EX=TACACSのみ' },
    { qTerms: ['tacacs'], exTerms: ['radius'], exMustNot: ['tacacs'], label: 'Q=TACACS, EX=RADIUSのみ' },
  ];

  topicChecks.forEach(tc => {
    const qMatch = tc.qTerms.some(t => qtLower.includes(t));
    const exHasWrong = tc.exTerms.some(t => exLower.includes(t));
    const exMissesRight = tc.exMustNot.every(t => !exLower.includes(t));
    if (qMatch && exHasWrong && exMissesRight) {
      issues.push({ n, type: 'TOPIC_MISMATCH', msg: tc.label });
    }
  });

  // Check 4: Multiple choice - explanation should mention correct answers
  if (x.correct_choices && x.correct_choices.length > 1 && choices.length > 0) {
    const correctLetters = x.correct_choices;
    const wrongLetters = choices.map(c => c.letter).filter(l => !correctLetters.includes(l));
    
    // Check if explanation explicitly says a wrong choice is correct
    wrongLetters.forEach(wl => {
      if (exLower.includes(`正解は${wl.toLowerCase()}`) || exLower.includes(`${wl.toLowerCase()}が正解`)) {
        issues.push({ n, type: 'WRONG_MC_ANSWER', msg: `解説が${wl}を正解と記述（正解は${correctLetters.join(',')}）` });
      }
    });
  }

  // Check 5: Explanation seems to be about a completely different question
  // Heuristic: if question mentions a specific technology but explanation mentions none of it
  const qtKeywords = qtLower.match(/[a-z][a-z0-9+#]{2,}/g) || [];
  const exKeywords = exLower.match(/[a-z][a-z0-9+#]{2,}/g) || [];
  const qtUniqueTerms = [...new Set(qtKeywords.filter(w => w.length >= 4))];
  if (qtUniqueTerms.length >= 5) {
    const matchCount = qtUniqueTerms.filter(t => exKeywords.includes(t)).length;
    const matchRatio = matchCount / qtUniqueTerms.length;
    if (matchRatio < 0.05 && qtUniqueTerms.length >= 8) {
      issues.push({ n, type: 'LOW_OVERLAP', msg: `問題と解説のキーワード一致率が非常に低い (${matchCount}/${qtUniqueTerms.length})` });
    }
  }
});

// Print results
console.log(`\n=== 全${q.length}問チェック完了 ===`);
console.log(`検出された問題: ${issues.length}件\n`);

// Group by type
const byType = {};
issues.forEach(i => {
  if (!byType[i.type]) byType[i.type] = [];
  byType[i.type].push(i);
});

Object.entries(byType).forEach(([type, items]) => {
  console.log(`--- ${type} (${items.length}件) ---`);
  items.forEach(i => console.log(`  Q${i.n}: ${i.msg}`));
  console.log();
});
