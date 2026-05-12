"""
For questions where detailed_explanation exists and explanation seems mismatched,
replace explanation with a summary derived from detailed_explanation.
"""
import json
import re

JSON_PATH = r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json'

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    questions = json.load(f)

def extract_topic_keywords(text):
    """Extract topic-indicating keywords from text."""
    if not text:
        return set()
    t = text.lower()
    words = set(re.findall(r'[a-z][a-z0-9_\-\.]+', t))
    return words

def has_topic_mismatch(question_text, choices_text, explanation):
    """Check if explanation topic differs from question topic."""
    ctx = (question_text + ' ' + choices_text).lower()
    expl = explanation.lower()
    
    # Topic markers: (topic_name, markers_in_expl, markers_that_should_be_in_question)
    checks = [
        ('poe', ['power over ethernet', '802.3af', '802.3at', '802.3bt'], ['poe', 'power over ethernet', '電力供給', '給電']),
        ('ospf_specific', ['ospf エリア', 'dr選出', 'lsa タイプ', 'ospfコスト'], ['ospf']),
        ('dhcp_specific', ['dhcpoffer', 'dhcpdiscover', 'dhcpack', 'dhcprequest', 'dhcpスヌーピング'], ['dhcp']),
        ('ipsec_specific', ['ipsecトンネル', 'ipsec transport'], ['ipsec', 'vpn', 'トンネル']),
    ]
    
    for topic, expl_markers, ctx_markers in checks:
        if any(m in expl for m in expl_markers) and not any(m in ctx for m in ctx_markers):
            return True
    return False

def summarize_detailed(detailed, max_len=120):
    """Create a short summary from detailed_explanation."""
    if not detailed:
        return None
    # Take first meaningful paragraph
    lines = [l.strip() for l in detailed.split('\n') if l.strip()]
    
    # Skip lines that are just the correct answer header
    summary_lines = []
    for line in lines:
        if line.startswith('【正解】'):
            continue
        if line.startswith('・') or line.startswith('-'):
            continue
        if '他の選択肢' in line or '以下の通り' in line:
            break
        summary_lines.append(line)
        # Get enough content for a summary
        if len(''.join(summary_lines)) > max_len:
            break
    
    result = ''.join(summary_lines)
    if len(result) > 200:
        result = result[:197] + '...'
    return result if result else None

updated = 0
for q in questions:
    num = q.get('number', '?')
    explanation = q.get('explanation', '')
    detailed = q.get('detailed_explanation', '')
    question_text = q.get('question_text', '')
    
    if not explanation or not detailed:
        continue
    
    # Build choices text
    choices_text = ' '.join(c.get('text', '') for c in q.get('choices', []))
    choices_text += ' '.join(item.get('text', '') for item in q.get('dd_items', []))
    choices_text += ' '.join(target.get('text', '') for target in q.get('dd_targets', []))
    
    # Check if explanation seems mismatched
    if has_topic_mismatch(question_text, choices_text, explanation):
        new_expl = summarize_detailed(detailed)
        if new_expl and len(new_expl) > 10:
            print(f"Q{num}: REPLACING explanation")
            print(f"  OLD: {explanation[:80]}...")
            print(f"  NEW: {new_expl[:80]}...")
            q['explanation'] = new_expl
            updated += 1

print(f"\nTotal updated: {updated}")

with open(JSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print("Done!")
