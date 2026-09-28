/**
 * ラボ（シミュレーション）問題の本文を、本番試験の左パネルのタブ構成に合わせて分解する。
 *
 * 本番 CCNA 200-301 のラボ問題 UI は画面を左右に分割し、
 *   - 左パネル: 「Tasks（タスク）」「Guidelines（ガイドライン）」「Topology（トポロジ）」の 3 タブ
 *   - 右パネル: デバイスごとのタブを持つターミナル
 * という構成になっている。本文中の「ガイドライン -」「トポロジ -」「タスク -」といった
 * 見出し行を手がかりに、左パネルの各タブへ割り振るテキストを取り出す。
 */
export interface LabSections {
  /** 「シミュレーション -」直後の導入文（通常は空） */
  intro: string;
  /** ガイドラインタブの本文 */
  guidelines: string;
  /** トポロジタブの本文（図の補足テキスト。通常は空） */
  topology: string;
  /** タスクタブの本文 */
  tasks: string;
}

type SectionKey = keyof LabSections;

/** 見出し語（日本語/英語の両方）→ セクション種別 */
const HEADER_PATTERNS: [SectionKey, RegExp][] = [
  ['intro', /^(シミュレーション|Simulation)$/i],
  ['guidelines', /^(ガイドライン|Guideline|Guidelines)$/i],
  ['topology', /^(トポロジ|トポロジ図|Topology)$/i],
  ['tasks', /^(タスク|Task|Tasks)$/i],
];

/**
 * 「タスク -」のように "見出し語 + 区切り記号" のみで構成される行を見出しとして判定する。
 * 見出しでなければ null。
 */
export function matchLabSectionHeader(line: string): SectionKey | null {
  // 区切り記号（- – — : ：）で終わり、その手前に区切り記号を含まない短い語が 1 つだけある行
  const m = /^[ \t]*([^\s\-–—:：][^\-–—:：]*?)[ \t]*[-–—:：][ \t]*$/.exec(line);
  if (!m) return null;
  const word = m[1].trim();
  for (const [key, re] of HEADER_PATTERNS) {
    if (re.test(word)) return key;
  }
  return null;
}

const EMPTY: LabSections = { intro: '', guidelines: '', topology: '', tasks: '' };

/** 問題文をセクションに分解する。見出しが無い場合は全文をタスクとして扱う。 */
export function parseLabSections(text: string | undefined | null): LabSections {
  if (!text) return { ...EMPTY };

  const buckets: Record<SectionKey, string[]> = {
    intro: [],
    guidelines: [],
    topology: [],
    tasks: [],
  };
  let current: SectionKey = 'intro';

  for (const line of text.split('\n')) {
    const key = matchLabSectionHeader(line);
    if (key) {
      current = key;
      continue;
    }
    buckets[current].push(line);
  }

  const sections: LabSections = {
    intro: buckets.intro.join('\n').trim(),
    guidelines: buckets.guidelines.join('\n').trim(),
    topology: buckets.topology.join('\n').trim(),
    tasks: buckets.tasks.join('\n').trim(),
  };

  // 「タスク -」見出しが無い問題（本文が導入部に全部入っている）は、本文をタスクとして扱う
  if (!sections.tasks && sections.intro) {
    sections.tasks = sections.intro;
    sections.intro = '';
  }

  return sections;
}
