import type { Question } from '../types';

/** 各DD問題で各targetに何個アイテムが入るべきかを返す */
export function computeDdRequired(q: Question): Record<string, number> {
  const required: Record<string, number> = {};
  if (!q.dd_targets || !q.dd_correct_mapping) return required;
  for (const t of q.dd_targets) required[t.id] = 0;
  for (const targetId of Object.values(q.dd_correct_mapping)) {
    required[targetId] = (required[targetId] ?? 0) + 1;
  }
  return required;
}

/** ある問題が「次へ進める状態」かどうか
 *  本番 CCNA では未回答／部分回答のまま次へ進める仕様のため、
 *  ここでは常に true を返す。回答状況の通知は UI 側のヒント表示のみで行う。
 */
export function isAnswerComplete(
  _q: Question,
  _selected: string[],
  _ddAnswers: Record<string, string>,
): boolean {
  return true;
}

/** 「採点上正しい数の入力が揃っているか」を判定するヘルパ。
 *  ヒント表示用途で使用し、ナビゲーション制御には使わない。
 */
export function isAnswerFullyEntered(
  q: Question,
  selected: string[],
  ddAnswers: Record<string, string>,
): boolean {
  if (q.type === 'drag_and_drop') {
    if (!q.dd_items || !q.dd_targets) return true; // 採点不可なのでブロックしない
    if (q.dd_correct_mapping) {
      // 各targetに必要な配置数の合計が満たされていればOK（未使用アイテムは許容）
      const required = computeDdRequired(q);
      const placed: Record<string, number> = {};
      for (const t of q.dd_targets) placed[t.id] = 0;
      for (const tid of Object.values(ddAnswers)) {
        if (tid) placed[tid] = (placed[tid] ?? 0) + 1;
      }
      for (const t of q.dd_targets) {
        if (placed[t.id] !== required[t.id]) return false;
      }
      return true;
    }
    // mapping無しの場合は全アイテム配置必須
    for (const it of q.dd_items) {
      if (!ddAnswers[it.id]) return false;
    }
    return true;
  }
  if (q.type === 'multiple_choice') {
    if (q.multi_select === true) {
      const need = q.correct_choices?.length ?? 0;
      if (need === 0) return selected.length > 0;
      return selected.length === need;
    }
    return selected.length > 0;
  }
  // ラボ問題は何も入力していなくても進めるようにする（部分採点）
  return true;
}
