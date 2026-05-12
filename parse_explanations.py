"""
Parse HTML files from ExamTopics and extract detailed explanations.
Map Question # to questions.json number and add detailed_explanation field.
"""
import re
import json
import os
import glob
from html import unescape

HTML_DIR = r'c:\Users\staniguch\Downloads\OneDrive_1_2026-5-11'
JSON_PATH = r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json'

def clean_html(text):
    """Remove HTML tags and clean up text."""
    # Replace <br> and <br/> with newlines
    text = re.sub(r'<br\s*/?>', '\n', text)
    # Remove all other HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities
    text = unescape(text)
    # Clean up whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = text.strip()
    return text

def extract_explanations_from_html(filepath):
    """Extract question number and detailed explanation from an HTML file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    results = {}

    # Split by question cards
    questions = re.split(r'<div class="card exam-question-card">', content)

    for q_block in questions:
        # Extract question number
        q_match = re.search(r'Question #(\d+)', q_block)
        if not q_match:
            continue
        q_num = int(q_match.group(1))

        # Extract the explanation section (between 【解説】 and the vote button or end)
        # The explanation is inside <span class="answer-description">
        expl_match = re.search(
            r'【解説】(.*?)(?:</span>|<a href="#" class="vote-answer-button)',
            q_block,
            re.DOTALL
        )
        if expl_match:
            raw = expl_match.group(1)
            cleaned = clean_html(raw)
            if cleaned:
                results[q_num] = cleaned
        else:
            # Try alternate pattern - some might have different structure
            expl_match2 = re.search(
                r'正解.*?</span>\s*<span class="answer-description"><br>\s*(.*?)(?:</span>|<a href="#" class="vote-answer-button)',
                q_block,
                re.DOTALL
            )
            if expl_match2:
                raw = expl_match2.group(1)
                # Check if it has meaningful content (not just the correct answer line)
                cleaned = clean_html(raw)
                if cleaned and len(cleaned) > 20:
                    results[q_num] = cleaned

    return results

def main():
    # Collect all HTML files
    html_files = sorted(glob.glob(os.path.join(HTML_DIR, '*.html')))
    print(f"Found {len(html_files)} HTML files")

    # Extract all explanations
    all_explanations = {}
    for filepath in html_files:
        filename = os.path.basename(filepath)
        explanations = extract_explanations_from_html(filepath)
        print(f"  {filename}: {len(explanations)} explanations extracted")
        all_explanations.update(explanations)

    print(f"\nTotal explanations extracted: {len(all_explanations)}")

    # Load questions.json
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    print(f"Total questions in JSON: {len(questions)}")

    # Map question numbers - HTML uses sequential 1-based numbering
    # questions.json uses "number" field
    matched = 0
    unmatched_html = []

    # Build a lookup by number
    q_by_number = {}
    for q in questions:
        num = q.get('number')
        if num is not None:
            q_by_number[num] = q

    # Add detailed_explanation
    for html_num, explanation in sorted(all_explanations.items()):
        if html_num in q_by_number:
            q_by_number[html_num]['detailed_explanation'] = explanation
            matched += 1
        else:
            unmatched_html.append(html_num)

    print(f"Matched and added: {matched}")
    if unmatched_html:
        print(f"Unmatched HTML questions: {unmatched_html[:20]}...")

    # Count questions without detailed_explanation
    without = sum(1 for q in questions if 'detailed_explanation' not in q)
    print(f"Questions without detailed_explanation: {without}")

    # Save updated JSON
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print("Done! questions.json updated.")

if __name__ == '__main__':
    main()
