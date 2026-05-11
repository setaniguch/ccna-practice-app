import json
with open(r'c:\Users\staniguch\CCNA_PracticeApp\src\data\questions.json','r',encoding='utf-8') as f:
    qs = json.load(f)
for q in qs:
    if q.get('type')=='multiple_choice' and len(q.get('question_images',[]))>=4 and len(q.get('choices',[]))>=4:
        num = q['number']
        imgs = q['question_images']
        nc = len(q['choices'])
        print(f"Q{num}: {len(imgs)} images, {nc} choices")
        for i in imgs:
            print(f"  img: {i}")
