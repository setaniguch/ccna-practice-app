"""
Check all 1395 questions for mismatched explanation vs answer/question content.
Uses keyword analysis to detect obviously wrong explanations.
"""
import json
import re

JSON_PATH = r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json'

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    questions = json.load(f)

def extract_keywords(text):
    """Extract meaningful keywords from text."""
    if not text:
        return set()
    # Normalize
    t = text.lower()
    # Extract English words and key terms
    words = set(re.findall(r'[a-z][a-z0-9_\-\.]+', t))
    # Extract Japanese key terms (2+ chars)
    jp = set(re.findall(r'[\u3040-\u9fff]{2,}', t))
    return words | jp

def check_explanation_relevance(q):
    """Check if explanation seems related to the question."""
    issues = []
    num = q.get('number', '?')
    question_text = q.get('question_text', '')
    explanation = q.get('explanation', '')
    detailed = q.get('detailed_explanation', '')
    answer = q.get('answer', '')
    choices = q.get('choices', [])
    
    if not explanation:
        return issues
    
    # Build context from question + choices + answer
    context_parts = [question_text]
    for c in choices:
        context_parts.append(c.get('text', ''))
    
    # For D&D questions, include items and targets
    for item in q.get('dd_items', []):
        context_parts.append(item.get('text', ''))
    for target in q.get('dd_targets', []):
        context_parts.append(target.get('text', ''))
    
    context_text = ' '.join(context_parts).lower()
    expl_lower = explanation.lower()
    
    # Define topic-specific keywords that should NOT appear in unrelated questions
    topic_markers = {
        'poe': ['power over ethernet', 'poe', '802.3af', '802.3at', '802.3bt', '電力供給'],
        'ospf': ['ospf', 'エリア', 'dr選出', 'lsa', 'ネイバー', 'コスト'],
        'bgp': ['bgp', 'as番号', 'ebgp', 'ibgp'],
        'stp': ['スパニングツリー', 'stp', 'rstp', 'ルートブリッジ', 'bpdu'],
        'dhcp': ['dhcp', 'dhcpoffer', 'dhcpdiscover', 'dhcpack'],
        'vlan': ['vlan', 'トランク', 'アクセスポート'],
        'nat': ['nat', 'pat', 'アドレス変換'],
        'acl': ['acl', 'アクセスリスト', 'access-list', 'permit', 'deny'],
        'wlan': ['wlan', 'ssid', 'wlc', 'アクセスポイント', '無線'],
        'dns': ['dns', 'ドメイン名', '名前解決'],
        'snmp': ['snmp', 'mib', 'トラップ'],
        'lldp': ['lldp', 'cdp'],
        'etherchannel': ['etherchannel', 'lacp', 'pagp', 'channel-group'],
        'ipsec': ['ipsec', 'vpn', 'トンネル'],
        'ipv6': ['ipv6', 'fe80', '2001:', 'eui-64'],
        'qos': ['qos', 'dscp', 'cos', 'キューイング'],
        'fhrp': ['hsrp', 'vrrp', 'glbp', 'fhrp'],
        'ansible': ['ansible', 'puppet', 'chef', 'playbook'],
        'rest': ['rest', 'api', 'json', 'xml'],
        'port_security': ['ポートセキュリティ', 'port-security', 'sticky'],
    }
    
    for topic, markers in topic_markers.items():
        # Check if explanation mentions topic but question doesn't
        expl_has = any(m in expl_lower for m in markers)
        ctx_has = any(m in context_text for m in markers)
        
        if expl_has and not ctx_has:
            # Double-check: maybe the detailed explanation is correct
            if detailed:
                det_keywords = extract_keywords(detailed)
                q_keywords = extract_keywords(question_text)
                overlap = det_keywords & q_keywords
                if len(overlap) >= 3:
                    issues.append(f"Q{num}: explanation mentions '{topic}' but question doesn't (detailed_explanation seems correct)")
                else:
                    issues.append(f"Q{num}: explanation mentions '{topic}' but question doesn't")
            else:
                issues.append(f"Q{num}: explanation mentions '{topic}' but question doesn't")
    
    return issues

# Also check: does the correct answer letter appear in explanation?
def check_answer_in_explanation(q):
    """Check if explanation contradicts the answer."""
    issues = []
    num = q.get('number', '?')
    qtype = q.get('type', '')
    explanation = q.get('explanation', '')
    answer = q.get('answer', '')
    choices = q.get('choices', [])
    
    if qtype != 'multiple_choice' or not explanation or not answer or not choices:
        return issues
    
    # Check if explanation explicitly states a DIFFERENT answer
    # Pattern: 【正解】X or 正解: X or 正解はX
    expl_answer_match = re.search(r'正解[：:]?\s*([A-E]+)', explanation)
    if expl_answer_match:
        expl_answer = ''.join(sorted(expl_answer_match.group(1)))
        actual_answer = ''.join(sorted(answer))
        if expl_answer != actual_answer:
            issues.append(f"Q{num}: explanation says answer is '{expl_answer_match.group(1)}' but actual answer is '{answer}'")
    
    return issues

all_issues = []
for q in questions:
    all_issues.extend(check_explanation_relevance(q))
    all_issues.extend(check_answer_in_explanation(q))

print(f"Total issues found: {len(all_issues)}")
for issue in sorted(all_issues):
    print(f"  {issue}")
