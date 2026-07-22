# Requirements Document

## Introduction

本機能は、CCNA_PracticeApp のラボ練習モード（`type === 'lab'` の問題）で使用するターミナル（`src/components/LabPanel.tsx`）に、Cisco IOS 風の「`?`」コンテキスト依存ヘルプコマンドを実装するものである。学習者が実機の Cisco IOS と同じ操作感でコマンドを調べられるようにすることで、CCNA 学習の実機再現性を高めることを目的とする。

`?` ヘルプは、学習者が入力途中のコマンドラインに応じて、現在の CLI モード（ユーザーモード / 特権モード / 各種設定モード）で利用可能なコマンドやキーワードの候補を画面に表示する。候補の語彙は、既存の Tab 補完と同じソース（各タスクの `expected_commands` と共通コマンド一覧）から構築する。ヘルプ表示後も入力途中の内容は保持され、実機同様にプロンプトと入力が再表示される。`?` 入力自体は採点対象のコマンド履歴には記録されない。

## Glossary

- **Lab_Terminal**: ラボ練習モードのターミナル UI コンポーネント（`src/components/LabPanel.tsx`）。学習者のコマンド入力を受け付け、画面（`lines` 配列）に出力を描画する。
- **Help_Feature**: 本要件で追加する `?` コンテキスト依存ヘルプ機能。
- **CLI_Mode**: 現在の Cisco IOS モード。`user`, `priv`, `config`, `config-if`, `config-line`, `config-router`, `config-vlan`, `config-acl-std`, `config-acl-ext`, `config-aaa`, `config-keychain`, `config-keychain-key`, `config-radius`, `config-tacacs`, `config-ssh-pubkey`, `config-snmp` のいずれか（`src/utils/iosCli.ts` の `CliMode`）。
- **Vocabulary**: ヘルプ候補・Tab 補完候補の元になるキーワード集合。対象デバイスのタスクの `expected_commands` と共通コマンド一覧（`COMMON_COMMANDS`）を単語に分解して構築する。
- **Full_Help_Query**: `?` 単独入力、または語のあとに空白を挟んで `?` を入力した状態（例: `show ?`）。現在のコンテキストで利用可能な候補一覧を要求する。
- **Word_Help_Query**: 部分語の直後に空白なしで `?` を入力した状態（例: `sh?`）。部分語で始まる候補一覧を要求する。
- **Preserved_Input**: ヘルプ出力表示後に復元される、`?` を除いた入力途中の文字列。
- **Graded_History**: 採点対象として記録されるコマンド履歴（`DeviceTerminalState.history`）。
- **Prompt_String**: `buildPrompt` が生成するモード依存のプロンプト文字列（例: `Router(config-if)#`）。

## Requirements

### Requirement 1: ヘルプクエリの検出

**User Story:** 学習者として、入力欄で `?` を入力したときにヘルプが起動してほしい。実機 IOS と同じ操作でコマンドを調べられるようにするためである。

#### Acceptance Criteria

1. WHILE Lab_Terminal が有効な CLI_Mode にある, WHEN 学習者が入力欄で `?` 文字を入力する, THE Help_Feature SHALL 当該入力をヘルプクエリとして検出し、対応するヘルプ出力を 1 秒以内に Lab_Terminal の画面に表示する
2. WHEN 入力欄の内容が `?` のみである、または末尾が 1 文字以上の空白に続く `?` である, THE Help_Feature SHALL 当該入力を Full_Help_Query として分類する
3. WHEN 入力欄の末尾が空白以外の文字に続く `?` である, THE Help_Feature SHALL 当該入力を Word_Help_Query として分類し、`?` 直前の連続した非空白文字列（最大 256 文字）を部分語として抽出する
4. WHEN ヘルプクエリが検出される, THE Help_Feature SHALL `?` 文字を実行対象のコマンド文字列に含めない
5. WHEN ヘルプ出力の表示が完了する, THE Help_Feature SHALL `?` を除いた入力途中の文字列を入力欄に保持し、現在の Prompt_String を再表示する
6. IF 学習者が有効な CLI_Mode 以外で `?` を入力する, THEN THE Help_Feature SHALL ヘルプクエリとして検出せず、ヘルプ出力を表示せず、入力欄の状態を変更しない

### Requirement 2: コンテキスト依存の候補生成（Full_Help_Query）

**User Story:** 学習者として、`?` だけを入力したときに現在のモードで使えるコマンド一覧を見たい。次に何を入力できるか把握するためである。

#### Acceptance Criteria

1. WHEN Full_Help_Query が検出される, THE Help_Feature SHALL 現在の CLI_Mode に対応する Vocabulary から重複を除いた候補一覧を生成し、ヘルプクエリ検出後ただちに（後続のキー入力を待たずに）Lab_Terminal の画面に表示する
2. THE Help_Feature SHALL 候補一覧を、対象デバイスのタスクの `expected_commands` と共通コマンド一覧から構築した Vocabulary から導出する
3. IF 現在の CLI_Mode に対応する候補が 1 件も存在しない, THEN THE Help_Feature SHALL 利用可能な候補が無いことを示す 1 行以上の非空メッセージ行を画面に表示する
4. THE Help_Feature SHALL 候補一覧から、数字を 1 文字以上含むトークンおよび `,` を含むトークンを値トークンとして除外する
5. WHEN 候補一覧を画面に表示する, THE Help_Feature SHALL 候補を大文字小文字を区別しない辞書順に並べ、各候補を高々 1 回だけ表示する
6. IF 値トークンの除外処理が失敗する, THEN THE Help_Feature SHALL 未フィルタの候補一覧をそのまま画面に表示する

### Requirement 3: 部分語に基づく候補生成（Word_Help_Query）

**User Story:** 学習者として、`sh?` のように途中まで入力して `?` を押したときに、その文字で始まるコマンド候補を見たい。うろ覚えのコマンドを確認するためである。

#### Acceptance Criteria

1. WHEN Word_Help_Query が検出される, THE Help_Feature SHALL 抽出した部分語を接頭辞として前方一致する候補のみを Vocabulary から抽出し、重複を除去したうえでアルファベット昇順に整列して画面に表示する
2. THE Help_Feature SHALL 候補の前方一致判定を大文字小文字を区別せずに行い、画面に表示する候補は Vocabulary 上の元の表記を保持する
3. THE Help_Feature SHALL Word_Help_Query の候補一覧から数値および `,` を含む値トークンを除外する
4. IF 部分語で始まる候補が 1 件も存在しない, THEN THE Help_Feature SHALL 一致候補が無いことを示す空でないメッセージ行を画面に表示し、現在の CLI_Mode と Preserved_Input を変更しない

### Requirement 4: 入力内容の保持と再表示

**User Story:** 学習者として、ヘルプを見た後も入力していた内容が消えずに続きを打ちたい。実機 IOS と同じ操作感を得るためである。

#### Acceptance Criteria

1. WHEN ヘルプ出力が表示される, THE Help_Feature SHALL ヘルプを起動した `?` 文字のみを入力文字列から除去し、それ以外の文字（空白を含む）を順序・内容ともに変更せずに保持した文字列を Preserved_Input として入力欄に復元する
2. WHEN Full_Help_Query の入力欄が `?` のみであり Preserved_Input が空文字列となる, THE Help_Feature SHALL 入力欄を空文字列に復元する
3. WHEN ヘルプ出力が表示される, THE Help_Feature SHALL 現在の Prompt_String と Preserved_Input を結合した 1 行を、ヘルプ出力（候補一覧またはメッセージ行）の直前に画面へ追加する
4. IF Prompt_String と Preserved_Input を結合した行の追加が失敗する, THEN THE Help_Feature SHALL 当該結合行を省略したうえで候補一覧のヘルプ出力の表示を継続する
5. WHEN Preserved_Input を入力欄に復元する, THE Help_Feature SHALL 入力欄を編集可能かつ入力フォーカスを保持した状態に維持し、学習者が Preserved_Input の末尾から続けて文字を入力できるようにする
6. WHEN 結合行と全てのヘルプ出力行の画面への追加が完了する, THE Help_Feature SHALL 画面（`lines` 配列の描画領域）を最下部（最後に追加された行が可視となる位置）までスクロールする

### Requirement 5: 採点履歴への非記録とモード非遷移

**User Story:** 学習者として、ヘルプを使っても採点結果に影響しないでほしい。ヘルプは調べるための操作であり回答ではないためである。

#### Acceptance Criteria

1. WHEN ヘルプクエリ（末尾に `?` を含むコマンド入力）が処理される, THE Help_Feature SHALL 当該ヘルプクエリおよびその出力を含むいかなるエントリも Graded_History に追加せず、処理前の Graded_History のエントリ数および内容を処理後も同一に維持する
2. WHEN ヘルプクエリが処理される, THE Help_Feature SHALL 処理前の CLI_Mode を変更せず、処理後も同一の CLI_Mode を維持する
3. WHEN ヘルプクエリが処理される, THE Help_Feature SHALL 親コンポーネントへのコマンド変更通知（`onChange`）を発火しない
4. IF 認識できないまたは構文的に無効なヘルプクエリが処理される, THEN THE Help_Feature SHALL Graded_History にエントリを追加せず、かつ処理前の CLI_Mode を維持し、かつ `onChange` を発火しない

### Requirement 6: 既存ターミナル機能との共存

**User Story:** 学習者として、ヘルプ機能が追加されても既存の入力・補完・履歴操作が今まで通り動いてほしい。学習の流れを妨げないためである。

#### Acceptance Criteria

1. IF 入力欄に `?` が含まれない, THEN THE Lab_Terminal SHALL Help_Feature 追加前と同一の入力に対して同一の出力結果で、Enter 送信・Tab 補完・上下キー履歴ナビゲーションを実行する
2. WHEN 学習者が `?` を含まない通常コマンドを Enter で送信する, THE Lab_Terminal SHALL 当該コマンドを Graded_History に記録する
3. THE Help_Feature SHALL Tab 補完と同一の Vocabulary 構築ロジックを変更せずに使用し、同一の入力接頭辞に対して Tab 補完の候補集合と一致する候補を生成する
4. IF Help_Feature の初期化または動作が失敗する, THEN THE Lab_Terminal SHALL 既存の Enter 送信・Tab 補完・上下キー履歴ナビゲーションの動作を継続する
5. WHEN 学習者がヘルプクエリを入力する, THE Help_Feature SHALL ヘルプ出力を 200 ミリ秒以内に画面へ反映する
