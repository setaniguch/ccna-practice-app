# Implementation Plan: lab-help-command

## Overview

ラボ練習ターミナル（`src/components/LabPanel.tsx`）に Cisco IOS 風の `?` コンテキスト依存ヘルプを追加する。実装は「純粋ロジック層（`src/utils/iosHelp.ts`）を切り出す → Tab 補完を同じ語彙構築ロジックに置き換える → `handleKey` に `?` ブランチを統合する」という増分順で進める。純粋関数は fast-check による property-based test で検証し、UI 統合（フォーカス・スクロール・onChange 非発火・回帰）は React Testing Library で検証する。

各コード変更後は `npm run build`（`tsc -b && vite build`）で型・ビルドを確認する。テストは Vitest を導入して実行する（`vitest run` 単発実行）。

## Tasks

- [x] 1. テスト基盤とプロジェクト構成のセットアップ
  - [x] 1.1 Vitest / fast-check / Testing Library を導入し設定
    - `vitest`、`fast-check`、`@testing-library/react`、`@testing-library/dom`、`jsdom` を devDependencies に追加（固定バージョンでインストール）
    - `vite.config.ts` に `test`（`environment: 'jsdom'`、`globals: true`）設定を追加
    - `package.json` に `"test": "vitest run"` スクリプトを追加
    - スモーク用に空の `src/utils/iosHelp.test.ts` を作成し `vitest run` が動作することを確認
    - _Requirements: 6.5_

- [x] 2. 純粋ロジック層 `src/utils/iosHelp.ts` の骨格と語彙構築
  - [ ] 2.1 モジュール骨格・型・共通定数を定義
    - `src/utils/iosHelp.ts` を新規作成
    - `HelpQuery` 判別可能ユニオン型（`none` / `full` / `word`）を定義
    - `COMMON_COMMANDS: string[]`（`LabPanel.tsx` のインライン定義から移設）をエクスポート
    - `NO_CANDIDATES_MESSAGE: string`（非空、例: `"% No matching commands"`）をエクスポート
    - `CliMode`（`./iosCli`）と `LabTask`（`../types`）を import
    - _Requirements: 2.3, 3.4_

  - [ ] 2.2 `isValueToken` と `buildVocabulary` を実装（Tab 補完から移設・挙動不変）
    - `isValueToken(tok)`: 数字を含む or `,` を含む or 空 → true
    - `buildVocabulary(tasks, device, cliMode)`: `device` のタスクの `expected_commands` と `COMMON_COMMANDS` を単語分解し、値トークン除外・小文字化した `Set<string>` を返す
    - `cliMode` は将来のモード別絞り込み用に受け取るが、現時点は既存挙動（デバイス単位）を維持
    - _Requirements: 2.2, 6.3_

  - [ ]* 2.3 buildVocabulary の値トークン除外 property test を作成
    - **Property 4: 値トークンの除外**
    - **Validates: Requirements 2.4, 3.3**
    - fast-check、最低 100 回反復、タグコメント付与

- [x] 3. ヘルプクエリ分類ロジック `classifyHelpQuery` の実装
  - [ ] 3.1 `classifyHelpQuery(inputBeforeQuestion)` を実装
    - 空文字列 or 末尾が空白（`/\s$/`）→ `{ kind: 'full', preservedInput: input }`
    - 末尾が非空白 → 末尾の連続非空白文字列（最大 256 文字）を `prefix` として抽出し `{ kind: 'word', prefix, preservedInput: input }`
    - `preservedInput` は渡された `input` をそのまま（`?` を含まず、順序・内容不変）
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1_

  - [ ]* 3.2 分類の正しさ property test を作成
    - **Property 1: ヘルプクエリの分類が正しい**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - full/word 判定と prefix 抽出（最大 256 文字・非空白連続）を検証

  - [ ]* 3.3 入力保持（`?` 除去の恒等性）property test を作成
    - **Property 2: 入力保持（`?` 除去の恒等性）**
    - **Validates: Requirements 1.4, 1.5, 4.1**
    - `preservedInput === input`（空白含む全文字が順序・内容一致、`?` を含まない）を検証

  - [ ]* 3.4 空入力の Full 分類 example テストを作成
    - `input === ''` で `kind === 'full'` かつ `preservedInput === ''`
    - _Requirements: 4.2_

- [x] 4. 候補生成ロジック `generateHelpCandidates` の実装
  - [x] 4.1 `generateHelpCandidates(query, vocabulary)` を実装
    - `full`: 語彙全件を対象
    - `word`: `prefix` に大文字小文字非依存で前方一致する語を対象
    - 値トークン除外（独立小関数に分離し try/catch で保護、失敗時は未フィルタ候補を返す）
    - 重複除去・大文字小文字非依存の辞書順ソート
    - `none` は空配列を返す
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [ ]* 4.2 候補が語彙の部分集合である property test を作成
    - **Property 3: 候補は語彙の部分集合（健全性）**
    - **Validates: Requirements 2.2**

  - [ ]* 4.3 出力がソート済みかつ重複なし property test を作成
    - **Property 5: 出力はソート済みかつ重複なし**
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 4.4 Word 候補が部分語に前方一致する property test を作成
    - **Property 6: Word 候補は部分語に前方一致する**
    - **Validates: Requirements 3.1**

  - [ ]* 4.5 前方一致が大文字小文字非依存である property test を作成
    - **Property 7: 前方一致は大文字小文字非依存（メタモルフィック）**
    - **Validates: Requirements 3.2**

  - [ ]* 4.6 候補ゼロ件・値トークン除外失敗の example テストを作成
    - 空語彙 / 不一致 prefix で空配列を返す（統合層で `NO_CANDIDATES_MESSAGE` 表示に使う）
    - 値トークン除外関数を例外投げにモック → 未フィルタ候補が返る
    - _Requirements: 2.3, 2.6, 3.4_

- [x] 5. チェックポイント - 純粋ロジック層のテスト確認
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Tab 補完を共有語彙ロジックへ置き換え（挙動不変）
  - [x] 6.1 `LabPanel.handleKey` の Tab ブランチをリファクタ
    - インライン `COMMON_COMMANDS` 定義と語彙構築を削除し `buildVocabulary(lab.tasks, activeDevice, cur.cli.mode)` 呼び出しに置換
    - 前方一致フィルタ・共通接頭辞計算・候補表示の Tab 固有ロジックは変更せず維持
    - `isValueToken` は `iosHelp.ts` から import
    - _Requirements: 6.1, 6.3_

  - [ ]* 6.2 Tab 補完とヘルプの候補集合一致 property test を作成
    - **Property 9: Tab 補完とヘルプの候補集合一致**
    - **Validates: Requirements 6.3**
    - 任意の `LabTask[]`・接頭辞で、Tab のマッチ集合と Word ヘルプ候補集合が一致

- [x] 7. `handleKey` への `?` ヘルプ統合
  - [x] 7.1 `?` ブランチと `handleHelpQuery` を実装
    - `onKeyDown` で `e.key === '?'` を捕捉し `e.preventDefault()`（`?` を input に混入させない）
    - `classifyHelpQuery(input)` → `buildVocabulary(...)` → `generateHelpCandidates(...)` を呼ぶ
    - 結合行 `buildPrompt + preservedInput` を生成（生成失敗時は省略して候補出力を継続）
    - `setStates` で `lines` に `[結合行, ...候補 or NO_CANDIDATES_MESSAGE]` を追記（`cli` / `history` / `historyCursor` は不変）
    - `setInput(preservedInput)` で `?` 除去入力を復元、`onChange` は呼ばない
    - 全体を try/catch で囲み、失敗時は既存挙動を継続（何もしない）
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.1, 2.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.4_

  - [ ]* 7.2 ヘルプ処理の状態不変性 property test を作成
    - **Property 8: ヘルプ処理の状態不変性**
    - **Validates: Requirements 5.1, 5.2**
    - 任意の初期 `history` / `cli` とヘルプ入力で、処理前後の `history`（要素数・内容）と `cli.mode` が不変

- [x] 8. UI 統合の component テストと回帰テスト
  - [ ]* 8.1 入力復元・フォーカス保持・スクロールの component テストを作成
    - `?` 押下後、`input.value === preservedInput` かつ入力要素がフォーカス保持（要件 4.5）
    - `lines` 追加後に描画順序が `[結合行, ...候補]`（要件 4.3）、最下部スクロール（要件 4.6）
    - _Requirements: 4.3, 4.5, 4.6_

  - [ ]* 8.2 onChange 非発火・採点履歴非記録の component テストを作成
    - `onChange` をモックし、`?` 入力で呼ばれないことを検証
    - ヘルプ処理前後で `history` が不変であることを検証
    - _Requirements: 5.1, 5.3_

  - [ ]* 8.3 既存挙動の非退行（回帰）テストを作成
    - `?` を含まない代表入力で Enter 送信（`history` +1・`onChange` 発火）、Tab 補完、上下キー履歴ナビが従来通り動作
    - ヘルプ関数を例外投げにモック → Enter / Tab / 履歴が継続動作
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 9. 最終チェックポイント - 全テストとビルド確認
  - `npm run build` と `vitest run` を実行し、全テスト通過・型エラーなしを確認
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 付きサブタスクは任意（テスト）。実装エージェントは `*` 付きを実装せず、`*` なしを必ず実装する。
- 各タスクはトレーサビリティのため具体的な要件番号を参照している。
- Property test（Property 1〜9）は fast-check で最低 100 回反復し、`// Feature: lab-help-command, Property {番号}: ...` のタグコメントを付与する。
- 純粋ロジック（分類・語彙・フィルタ・ソート・状態不変性）は property test、UI 副作用（フォーカス・スクロール・onChange・回帰）は component/example test で担う。
- Tab 補完とヘルプは同一 `buildVocabulary` を共有することで、同一入力接頭辞に対する候補集合一致（要件 6.3）を構造的に保証する。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.3", "3.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1", "8.2", "8.3"] }
  ]
}
```
