import json
import sys

with open(r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Total questions: {len(questions)}")

# Count types
type_counts = {}
for q in questions:
    t = q.get("type", "unknown")
    type_counts[t] = type_counts.get(t, 0) + 1
print(f"Types: {type_counts}")

errors = []

for q in questions:
    num = q.get("number", "?")
    qtype = q.get("type", "unknown")

    # === Multiple Choice checks ===
    if qtype == "multiple_choice":
        answer = q.get("answer", "")
        correct = q.get("correct_choices", [])
        choices = q.get("choices", [])
        multi = q.get("multi_select", False)
        choice_letters = [c["letter"] for c in choices]

        # 1. answer vs correct_choices consistency
        answer_letters = sorted(list(answer))
        sorted_correct = sorted(correct)
        if answer_letters != sorted_correct:
            errors.append(f"Q{num}: answer='{answer}' != correct_choices={correct}")

        # 2. correct_choices must exist in choices
        for c in correct:
            if c not in choice_letters:
                errors.append(f"Q{num}: correct_choice '{c}' not in choices {choice_letters}")

        # 3. multi_select consistency
        if len(correct) > 1 and not multi:
            errors.append(f"Q{num}: multiple correct choices {correct} but multi_select=false")
        if len(correct) == 1 and multi:
            errors.append(f"Q{num}: single correct choice {correct} but multi_select=true")

        # 4. answer should not be empty for MC
        if not answer:
            errors.append(f"Q{num}: empty answer for multiple_choice")

    # === Drag and Drop checks ===
    elif qtype == "drag_and_drop":
        items = q.get("dd_items", [])
        targets = q.get("dd_targets", [])
        mapping = q.get("dd_correct_mapping", {})
        item_ids = [i["id"] for i in items]
        target_ids = [t["id"] for t in targets]
        dd_mode = q.get("dd_mode", "")

        # 1. All mapping keys must be valid item IDs
        for k in mapping:
            if k not in item_ids:
                errors.append(f"Q{num}: mapping key '{k}' not in dd_items {item_ids}")

        # 2. All mapping values must be valid target IDs
        for k, v in mapping.items():
            if v not in target_ids:
                errors.append(f"Q{num}: mapping value '{v}' for key '{k}' not in dd_targets {target_ids}")

        # 3. Check if mapping is empty
        if not mapping:
            errors.append(f"Q{num}: empty dd_correct_mapping")

        # 4. For category mode, check items vs targets balance
        # (items can be more than targets since some items may be unused)

    # === Lab checks ===
    elif qtype == "lab":
        # Labs don't have traditional answers, skip
        pass

    # === General checks ===
    # Check for missing explanation
    explanation = q.get("explanation", "")
    if not explanation and qtype != "lab":
        errors.append(f"Q{num}: missing explanation")

    # Check for missing category
    category = q.get("category", "")
    if not category:
        errors.append(f"Q{num}: missing category")

# Print results
print(f"\n=== ERRORS FOUND: {len(errors)} ===")
for e in errors:
    print(f"  {e}")

if not errors:
    print("  No errors found! All questions are consistent.")
