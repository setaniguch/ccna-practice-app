"""
Re-parse HTML files with broader patterns to catch explanations
that were missed in the first pass (65 questions without detailed_explanation).
"""
import re
import json
import os
import glob
from html import unescape

HTML_DIR = r'c:\Users\staniguch\Downloads\OneDrive_1_2026-5-11'
JSON_PATH = r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json'

def clean_html(text):
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = unescape(text)
    text = re.sub(r'\n\s*\n', '\n\n', text)
    return text.strip()

def extract_explanations_broad(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    results = {}
    questions = re.split(r'<div class="card exam-question-card">', content)

    for q_block in questions:
        q_match = re.search(r'Question #(\d+)', q_block)
        if not q_match:
            continue
        q_num = int(q_match.group(1))

        # Try multiple patterns
        # Pattern 1: 【解説】
        expl_match = re.search(
            r'【解説】(.*?)(?:</span>|<a href="#" class="vote-answer-button)',
            q_block, re.DOTALL
        )
        if expl_match:
            cleaned = clean_html(expl_match.group(1))
            if cleaned and len(cleaned) > 20:
                results[q_num] = cleaned
                continue

        # Pattern 2: 正解 followed by explanation content (broader)
        expl_match2 = re.search(
            r'<span class="answer-description"><br>\s*(?:正解.*?</span>\s*<span class="answer-description"><br>\s*)(.*?)(?:</span>\s*(?:<a|<br/>\s*</span>))',
            q_block, re.DOTALL
        )
        if expl_match2:
            cleaned = clean_html(expl_match2.group(1))
            if cleaned and len(cleaned) > 20:
                results[q_num] = cleaned
                continue

        # Pattern 3: correct-answer-box content
        expl_match3 = re.search(
            r'<span class="correct-answer-box">.*?<span class="answer-description"><br>\s*(.*?)(?:</span>\s*</p>)',
            q_block, re.DOTALL
        )
        if expl_match3:
            cleaned = clean_html(expl_match3.group(1))
            if cleaned and len(cleaned) > 20:
                results[q_num] = cleaned
                continue

        # Pattern 4: any answer-description with substantial content
        all_descs = re.findall(
            r'<span class="answer-description">(.*?)</span>',
            q_block, re.DOTALL
        )
        for desc in all_descs:
            cleaned = clean_html(desc)
            # Skip short ones (just "正解:" etc)
            if cleaned and len(cleaned) > 50:
                results[q_num] = cleaned
                break

    return results

# Load current questions
with open(JSON_PATH, 'r', encoding='utf-8') as f:
    questions = json.load(f)

# Find questions without detailed_explanation
missing = set()
q_by_number = {}
for q in questions:
    num = q.get('number')
    q_by_number[num] = q
    if 'detailed_explanation' not in q or not q.get('detailed_explanation'):
        missing.add(num)

print(f"Questions without detailed_explanation: {len(missing)}")
print(f"Missing: {sorted(missing)}")

# Re-parse all HTML files
html_files = sorted(glob.glob(os.path.join(HTML_DIR, '*.html')))
all_explanations = {}
for filepath in html_files:
    explanations = extract_explanations_broad(filepath)
    all_explanations.update(explanations)

# Only add for missing questions
added = 0
still_missing = []
for num in sorted(missing):
    if num in all_explanations:
        q_by_number[num]['detailed_explanation'] = all_explanations[num]
        added += 1
        print(f"  Added Q{num}: {all_explanations[num][:60]}...")
    else:
        still_missing.append(num)

print(f"\nNewly added: {added}")
print(f"Still missing: {len(still_missing)} -> {still_missing}")

if added > 0:
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    print("Saved!")
