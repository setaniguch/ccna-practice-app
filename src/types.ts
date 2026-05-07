export interface Choice {
  letter: string;
  text: string;
  /** 選択肢が画像で表される場合のファイル名一覧 */
  images?: string[];
}

export interface DragDropEntry {
  id: string;
  text: string;
}

export interface LabTask {
  /** タスク名（タスクタブに表示） */
  name: string;
  /** タスクの説明文 */
  description: string;
  /** 対象デバイスホスト名 */
  device: string;
  /** 期待される正解コマンド列（順序問わず、正規化後比較） */
  expected_commands: string[];
}

export interface LabDevice {
  /** ホスト名（プロンプトに表示） */
  hostname: string;
  /** デバイス種別（表示用） */
  kind?: 'router' | 'switch' | 'pc';
}

export interface LabSpec {
  /** トポロジ説明（任意のテキスト） */
  topology?: string;
  /** トポロジ図の画像ファイル名（public/images/ 以下） */
  topology_images?: string[];
  /** 操作対象デバイス一覧 */
  devices: LabDevice[];
  /** タスク一覧 */
  tasks: LabTask[];
  /** 採点画面で表示する「模範解答」画像 */
  solution_images?: string[];
}

export interface Question {
  number: number;
  question_images?: string[];
  question_text: string;
  type: 'multiple_choice' | 'drag_and_drop' | 'lab' | string;
  category?: string;
  choices?: Choice[];
  answer: string;
  correct_choices?: string[];
  multi_select?: boolean;
  answer_images?: string[];
  dd_mode?: 'match' | 'category' | 'lab' | string;
  dd_items?: DragDropEntry[];
  dd_targets?: DragDropEntry[];
  dd_correct_mapping?: Record<string, string>;
  /** ラボ問題（type==='lab'）の仕様 */
  lab?: LabSpec;
}

export type AnswerMap = Record<number, string[]>;
/** D&D問題用: questionNumber → { itemId: targetId } */
export type DragDropAnswerMap = Record<number, Record<string, string>>;
/** ラボ問題用: questionNumber → { deviceHostname: enteredCommands[] } */
export type LabAnswerMap = Record<number, Record<string, string[]>>;
