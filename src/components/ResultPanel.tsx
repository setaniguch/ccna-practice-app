import type { Question, AnswerMap, DragDropAnswerMap, LabAnswerMap } from '../types';
import { resolveImageUrl } from '../utils/imagePath';
import { gradeLabCommands, normalizeCommand } from '../utils/iosCommand';
import './ResultPanel.css';

interface Props {
  questions: Question[];
  answers: AnswerMap;
  ddAnswers: DragDropAnswerMap;
  labAnswers: LabAnswerMap;
  onRestart: () => void;
}

type Status = 'ok' | 'ng' | 'partial' | 'na';

function judge(
  q: Question,
  ans: string[] | undefined,
  dd: Record<string, string> | undefined,
  lab: Record<string, string[]> | undefined,
): Status {
  if (q.type === 'drag_and_drop') {
    if (!q.dd_correct_mapping || !q.dd_items) return 'na';
    if (!dd) return 'ng';
    for (const item of q.dd_items) {
      if (dd[item.id] !== q.dd_correct_mapping[item.id]) return 'ng';
    }
    return 'ok';
  }
  if (q.type === 'lab') {
    if (!q.lab) return 'na';
    let totalExpected = 0;
    let totalMatched = 0;
    for (const t of q.lab.tasks) {
      const entered = (lab && lab[t.device]) ?? [];
      const r = gradeLabCommands(entered, t.expected_commands);
      totalExpected += r.total;
      totalMatched += r.matched;
    }
    if (totalExpected === 0) return 'na';
    if (totalMatched === totalExpected) return 'ok';
    if (totalMatched === 0) return 'ng';
    return 'partial';
  }
  if (q.type === 'multiple_choice' && q.correct_choices) {
    if (!ans || ans.length === 0) return 'ng';
    const a = [...ans].sort().join(',');
    const b = [...q.correct_choices].sort().join(',');
    return a === b ? 'ok' : 'ng';
  }
  if (q.type === 'multiple_choice' && q.answer && /^[A-Z](,[A-Z])*$/.test(q.answer.trim())) {
    if (!ans || ans.length === 0) return 'ng';
    const a = [...ans].sort().join(',');
    const b = q.answer.trim().split(',').sort().join(',');
    return a === b ? 'ok' : 'ng';
  }
  return 'na';
}

function findText(list: { id: string; text: string }[] | undefined, id: string | undefined): string {
  if (!list || !id) return '(未選択)';
  return list.find((x) => x.id === id)?.text ?? id;
}

export default function ResultPanel({ questions, answers, ddAnswers, labAnswers, onRestart }: Props) {
  const judged = questions.map((q) => ({
    q,
    status: judge(q, answers[q.number], ddAnswers[q.number], labAnswers[q.number]),
  }));
  const scorable = judged.filter((r) => r.status !== 'na');
  const correctCount = scorable.filter((r) => r.status === 'ok').length;
  const percent = scorable.length === 0 ? 0 : Math.round((correctCount / scorable.length) * 100);

  const CATEGORIES = [
    'Network Fundamentals', 'Network Access', 'IP Connectivity',
    'IP Services', 'Security Fundamentals', 'Automation and Programmability',
  ];
  const categoryStats = CATEGORIES.map((cat) => {
    const catJudged = judged.filter((r) => (r.q.category ?? 'Network Fundamentals') === cat);
    const catScorable = catJudged.filter((r) => r.status !== 'na');
    const catCorrect = catScorable.filter((r) => r.status === 'ok').length;
    const pct = catScorable.length === 0 ? 0 : Math.round((catCorrect / catScorable.length) * 100);
    return { cat, total: catJudged.length, scorable: catScorable.length, correct: catCorrect, pct };
  }).filter((s) => s.total > 0);

  return (
    <div className="result">
      <h2>採点結果</h2>
      <div className="result__score">
        <span className="result__big">{correctCount} / {scorable.length}</span>
        <span className="result__percent">({percent}%)</span>
      </div>
      {scorable.length < questions.length && (
        <p className="result__note">
          ※ 採点不可の問題は対象外です
        </p>
      )}

      <div className="result__catChart">
        <h3>カテゴリ別正答率</h3>
        {categoryStats.map((s) => {
          const barColor = s.pct >= 80 ? '#16a34a' : s.pct >= 60 ? '#2563eb' : s.pct >= 40 ? '#f59e0b' : '#dc2626';
          return (
            <div key={s.cat} className="result__catRow">
              <span className="result__catLabel">{s.cat}</span>
              <div className="result__catBar">
                <div className="result__catFill" style={{ width: `${s.pct}%`, background: barColor }} />
              </div>
              <span className="result__catPct">{s.pct}% ({s.correct}/{s.scorable})</span>
            </div>
          );
        })}
      </div>

      <ol className="result__list">
        {judged.map(({ q, status }) => {
          const ans = answers[q.number];
          const dd = ddAnswers[q.number] ?? {};
          const isDD = q.type === 'drag_and_drop';
          const hasDdData = isDD && q.dd_items && q.dd_targets && q.dd_correct_mapping;
          return (
            <li key={q.number} className={`result__item ${status}`}>
              <div className="result__head">
                <span className="result__num">
                  問 {q.number}
                  {isDD && <span className="tag">D&amp;D</span>}
                </span>
                <span className="result__badge">
                  {status === 'ok' ? '○ 正解' : status === 'partial' ? '△ 部分正解' : status === 'ng' ? '× 不正解' : '— 対象外'}
                </span>
              </div>
              <div className="result__qtext">{q.question_text}</div>

              {q.question_images && q.question_images.length > 0 && (
                <div className="result__imgs">
                  {q.question_images.map((src) => (
                    <img key={src} src={resolveImageUrl(src)} alt="問題図" />
                  ))}
                </div>
              )}

              {q.type === 'lab' && q.lab && (
                <div className="result__lab">
                  {q.lab.tasks.map((t, idx) => {
                    const entered = (labAnswers[q.number] && labAnswers[q.number][t.device]) ?? [];
                    const r = gradeLabCommands(entered, t.expected_commands);
                    return (
                      <div key={idx} className="result__labTask">
                        <div className="result__labTitle">
                          [{t.device}] {t.name} — {r.matched} / {r.total}
                        </div>
                        <table className="result__ddtable">
                          <thead>
                            <tr>
                              <th>期待コマンド</th>
                              <th>判定</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.expected_commands.map((c, i) => {
                              const enteredNorm = new Set(entered.map(normalizeCommand));
                              const ok = enteredNorm.has(normalizeCommand(c));
                              return (
                                <tr key={i} className={ok ? 'ok' : 'ng'}>
                                  <td><code>{c}</code></td>
                                  <td>{ok ? '○' : '×'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {entered.length > 0 && (
                          <details>
                            <summary>あなたの入力 ({entered.length} 行)</summary>
                            <pre className="result__labLog">{entered.join('\n')}</pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!isDD && q.type !== 'lab' && (
                <>
                  <div className="result__row">
                    <span className="result__label">あなたの回答:</span>
                    <span>{ans && ans.length > 0 ? [...ans].sort().join(', ') : '未回答'}</span>
                  </div>
                  <div className="result__row">
                    <span className="result__label">正解:</span>
                    <span>{q.correct_choices ? q.correct_choices.join(', ') : q.answer}</span>
                  </div>
                </>
              )}

              {hasDdData && (
                <table className="result__ddtable">
                  <thead>
                    <tr>
                      <th>項目</th>
                      <th>あなたの回答</th>
                      <th>正解</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.dd_items!.map((item) => {
                      const userId = dd[item.id];
                      const correctId = q.dd_correct_mapping![item.id];
                      const ok = userId === correctId;
                      return (
                        <tr key={item.id} className={ok ? 'ok' : 'ng'}>
                          <td>{item.text}</td>
                          <td>{findText(q.dd_targets, userId)}</td>
                          <td>{findText(q.dd_targets, correctId)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {isDD && q.answer_images && q.answer_images.length > 0 && (
                <details className="result__answer">
                  <summary>元の正解図を表示</summary>
                  <div className="result__imgs">
                    {q.answer_images.map((src) => (
                      <img key={src} src={resolveImageUrl(src)} alt="正解図" />
                    ))}
                  </div>
                </details>
              )}
              {q.explanation && (
                <div className="practice-answer__explanation">
                  <strong>解説:</strong> {q.explanation}
                </div>
              )}
              {q.detailed_explanation && (
                <details className="practice-answer__detailed">
                  <summary>詳細解説を表示</summary>
                  <div className="practice-answer__detailed-content">
                    {q.detailed_explanation.split('\n').map((line, i) => (
                      <span key={i}>{line}<br /></span>
                    ))}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ol>

      <button className="result__restart" onClick={onRestart}>
        もう一度挑戦する
      </button>
    </div>
  );
}
