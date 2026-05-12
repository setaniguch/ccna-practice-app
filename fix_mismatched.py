"""
Detect and fix explanations where the topic is CLEARLY wrong.
Only fix when detailed_explanation exists and can provide a replacement.
Uses strict matching to minimize false positives.
"""
import json
import re

JSON_PATH = r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json'

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    questions = json.load(f)

# Strict topic detection: explanation must STRONGLY indicate a topic 
# that the question clearly has NOTHING to do with
TOPIC_SIGNATURES = {
    'PoE/電力供給': {
        'expl_must': [r'(?:power over ethernet|poe|802\.3a[ft]|802\.3bt|電力供給|給電|受電)'],
        'ctx_any': ['poe', 'power', '電力', '給電', '受電', 'watt', 'ワット'],
    },
    'OSPF': {
        'expl_must': [r'(?:ospf(?:v[23])?のエリア|ospf(?:v[23])?ネイバー|dr/bdr|ospfコスト|ospfプロセス|lsa(?:タイプ| type)|ospfの(?:特徴|動作))'],
        'ctx_any': ['ospf', 'エリア0', 'area 0', 'lsa', 'dr選出', 'ospfv'],
    },
    'STP': {
        'expl_must': [r'(?:スパニングツリー|stp|rstp|pvst|ルートブリッジ選出|bpdu(?:ガード|guard))'],
        'ctx_any': ['スパニングツリー', 'stp', 'rstp', 'pvst', 'ルートブリッジ', 'bpdu', 'spanning'],
    },
    'NAT': {
        'expl_must': [r'(?:nat(?:の|を|は)|pat|(?:アドレス|ip)変換|(?:内部|外部)(?:グローバル|ローカル))'],
        'ctx_any': ['nat', 'pat', 'アドレス変換', 'ip変換', 'グローバル', 'inside', 'outside'],
    },
    'IPsec/VPN': {
        'expl_must': [r'(?:ipsec|vpnトンネル|ike(?:v[12])?|セキュリティアソシエーション|sa)'],
        'ctx_any': ['ipsec', 'vpn', 'トンネル', 'ike', 'tunnel', 'transport'],
    },
}

def build_context(q):
    """Build all text context from question, choices, items."""
    parts = [q.get('question_text', '')]
    for c in q.get('choices', []):
        parts.append(c.get('text', ''))
    for item in q.get('dd_items', []):
        parts.append(item.get('text', ''))
    for target in q.get('dd_targets', []):
        parts.append(target.get('text', ''))
    return ' '.join(parts).lower()

def summarize_detailed(detailed):
    """Create a concise summary from detailed_explanation."""
    if not detailed:
        return None
    lines = [l.strip() for l in detailed.split('\n') if l.strip()]
    
    summary_parts = []
    total = 0
    for line in lines:
        if line.startswith('【正解】'):
            continue
        # Stop at "other choices" section
        if any(kw in line for kw in ['他の選択肢', '不正解の理由', '以下の通り', '各選択肢']):
            break
        summary_parts.append(line)
        total += len(line)
        if total > 150:
            break
    
    result = ' '.join(summary_parts)
    # Clean up
    result = re.sub(r'\s+', ' ', result).strip()
    if len(result) > 200:
        result = result[:197] + '...'
    return result if len(result) > 15 else None

fixes = []
for q in questions:
    num = q.get('number', '?')
    explanation = q.get('explanation', '')
    detailed = q.get('detailed_explanation', '')
    
    if not explanation or not detailed:
        continue
    
    ctx = build_context(q)
    expl_lower = explanation.lower()
    
    for topic_name, sigs in TOPIC_SIGNATURES.items():
        # Check if explanation strongly matches this topic
        expl_match = any(re.search(pat, expl_lower) for pat in sigs['expl_must'])
        if not expl_match:
            continue
        
        # Check if question context has ANY mention of this topic
        ctx_match = any(kw in ctx for kw in sigs['ctx_any'])
        if ctx_match:
            continue
        
        # This is a mismatch! Generate replacement from detailed_explanation
        new_expl = summarize_detailed(detailed)
        if new_expl:
            fixes.append({
                'number': num,
                'topic': topic_name,
                'old': explanation,
                'new': new_expl,
            })
            q['explanation'] = new_expl
        break  # One fix per question

print(f"Total fixes: {len(fixes)}")
for f in sorted(fixes, key=lambda x: x['number']):
    print(f"\nQ{f['number']} [{f['topic']}]:")
    print(f"  OLD: {f['old'][:100]}")
    print(f"  NEW: {f['new'][:100]}")

if fixes:
    with open(JSON_PATH, 'w', encoding='utf-8') as f_out:
        json.dump(questions, f_out, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(fixes)} fixes to questions.json")
else:
    print("\nNo fixes needed.")
