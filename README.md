# CCNA 練習アプリ (モック)

`questions.json` (50問) からランダムに 10 問を出題する練習アプリです。  
Kiro_ShikakuApp の pl600-practice-app を参考にした最小構成のモックです。

## セットアップ

```powershell
cd c:\Users\staniguch\CCNA_PracticeApp
npm install
npm run dev
```

ブラウザで表示される URL（既定 http://localhost:5173）にアクセスしてください。

## 仕様

- 出題形式: `multiple_choice`（単一/複数選択）に対応
- `drag_and_drop` 等の画像回答問題は表示のみで採点対象外
- 画像 (`/assets/media/exam-media/...`) は `<img>` で参照します
  - 表示したい場合は同じパス構成で `public/assets/...` にファイルを配置してください
  - 見つからない場合はその旨が表示されます
- 採点完了後「もう一度挑戦する」で別の10問が再抽選されます

## 主要ファイル

- `src/App.tsx` — セッション管理・ランダム抽選
- `src/components/QuestionCard.tsx` — 出題UI
- `src/components/ResultPanel.tsx` — 採点UI
- `src/data/questions.json` — 問題データ（コピー済み）
