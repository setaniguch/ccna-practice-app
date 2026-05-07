import { useState } from 'react';
import type { Question, AnswerMap, DragDropAnswerMap, LabAnswerMap } from '../types';
import QuestionCard from './QuestionCard';
import { resolveImageUrl } from '../utils/imagePath';
import { gradeLabCommands } from '../utils/iosCommand';
import './PracticeMode.css';

interface Props {
  questions: Question[];
  onFinish: () => void;
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
    if (!dd || Object.keys(dd).length === 0) return 'ng';
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
  if (q.type === 'multiple_choice') {
    if (q.correct_choices) {
      if (!ans || ans.length === 0) return 'ng';
      const a = [...ans].sort().join(',');
      const b = [...q.correct_choices].sort().join(',');
      return a === b ? 'ok' : 'ng';
    }
    if (q.answer && /^[A-Z](,[A-Z])*$/.test(q.answer.trim())) {
      if (!ans || ans.length === 0) return 'ng';
      const a = [...ans].sort().join(',');
      const b = q.answer.trim().split(',').sort().join(',');
      return a === b ? 'ok' : 'ng';
    }
  }
  return 'na';
}

export default function PracticeMode({ questions, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [ddAnswers, setDdAnswers] = useState<DragDropAnswerMap>({});
  const [labAnswers, setLabAnswers] = useState<LabAnswerMap>({});
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  const current = questions[index];
  const isLast = index === questions.length - 1;

  const handleAnswer = (next: string[]) => {
    setAnswers((prev) => ({ ...prev, [current.number]: next }));
  };
  const handleDdChange = (itemId: string, targetId: string) => {
    setDdAnswers((prev) => {
      const cur = { ...(prev[current.number] ?? {}) };
      if (targetId === '') delete cur[itemId];
      else cur[itemId] = targetId;
      return { ...prev, [current.number]: cur };
    });
  };
  const handleLabChange = (deviceHostname: string, commands: string[]) => {
    setLabAnswers((prev) => {
      const cur = { ...(prev[current.number] ?? {}) };
      cur[deviceHostname] = commands;
      return { ...prev, [current.number]: cur };
    });
  };

  const handleCheck = () => {
    setShowAnswer(true);
    const status = judge(current, answers[current.number], ddAnswers[current.number], labAnswers[current.number]);
    if (status === 'ok') {
      setStats((s) => ({ ...s, correct: s.correct + 1 }));
    } else if (status !== 'na') {
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const handleNext = () => {
    setShowAnswer(false);
    if (isLast) {
      onFinish();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const status = showAnswer
    ? judge(current, answers[current.number], ddAnswers[current.number], labAnswers[current.number])
    : null;

  return (
    <div className="app">
      <header className="app__header app__header--practice">
        <div>
          <h1 className="app__title--exam">CCNA 練習モード</h1>
          <div className="app__subtitle--exam">
            問 {index + 1} / {questions.length}　|　正解: {stats.correct}　不正解: {stats.wrong}
          </div>
        </div>
        <button className="secondary small" onClick={onFinish}>
          練習を終了
        </button>
      </header>

      <div className="exam-progress">
        <div className="exam-progress__bar" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
      </div>

      <main className="app__main">
        <QuestionCard
          question={current}
          selected={answers[current.number] ?? []}
          ddAnswers={ddAnswers[current.number] ?? {}}
          labCommands={labAnswers[current.number] ?? {}}
          onChange={handleAnswer}
          onDdChange={handleDdChange}
          onLabChange={handleLabChange}
        />

        {showAnswer && (
          <div className={`practice-answer practice-answer--${status}`}>
            <div className="practice-answer__status">
              {status === 'ok' && '✅ 正解！'}
              {status === 'ng' && '❌ 不正解'}
              {status === 'partial' && '⚠️ 部分正解'}
              {status === 'na' && 'ℹ️ 採点不可'}
            </div>
            <div className="practice-answer__detail">
              {current.type === 'multiple_choice' && current.correct_choices && (
                <p><strong>正解:</strong> {current.correct_choices.join(', ')}</p>
              )}
              {current.type === 'drag_and_drop' && current.dd_correct_mapping && current.dd_items && current.dd_targets && (
                <div>
                  <strong>正解マッピング:</strong>
                  <ul className="practice-answer__mapping">
                    {current.dd_items.map((item) => {
                      const targetId = current.dd_correct_mapping![item.id];
                      const target = current.dd_targets!.find((t) => t.id === targetId);
                      return (
                        <li key={item.id}>
                          {item.text} → {target?.text ?? targetId}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {current.type === 'lab' && current.lab?.solution_images && current.lab.solution_images.length > 0 && (
                <div className="practice-answer__images">
                  {current.lab.solution_images.map((src) => (
                    <img key={src} src={resolveImageUrl(src)} alt="模範解答" />
                  ))}
                </div>
              )}
              {current.answer_images && current.answer_images.length > 0 && (
                <div className="practice-answer__images">
                  {current.answer_images.map((src) => (
                    <img key={src} src={resolveImageUrl(src)} alt="解答" />
                  ))}
                </div>
              )}
              {current.explanation && (
                <div className="practice-answer__explanation">
                  <strong>解説:</strong> {current.explanation}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="nav nav--single">
          {!showAnswer ? (
            <button className="primary" onClick={handleCheck}>
              答え合わせ
            </button>
          ) : (
            <button className="primary" onClick={handleNext}>
              {isLast ? '練習を終了' : '次の問題 →'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
