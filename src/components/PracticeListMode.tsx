import { useCallback, useState } from 'react';
import type { Question } from '../types';
import { resolveImageUrl } from '../utils/imagePath';
import './PracticeListMode.css';
import './PracticeMode.css';

interface Props {
  questions: Question[];
  onFinish: () => void;
}

function AnswerBlock({ q }: { q: Question }) {
  return (
    <div className="practice-answer practice-answer--ok">
      <div className="practice-answer__status">正解</div>
      <div className="practice-answer__detail">
        {q.type === 'multiple_choice' && (
          <p><strong>正解:</strong> {q.correct_choices ? q.correct_choices.join(', ') : q.answer}</p>
        )}

        {q.type === 'drag_and_drop' && q.dd_correct_mapping && q.dd_items && q.dd_targets && (
          <div>
            <strong>正解マッピング:</strong>
            <ul className="practice-answer__mapping">
              {q.dd_items.map((item) => {
                const targetId = q.dd_correct_mapping![item.id];
                const target = q.dd_targets!.find((t) => t.id === targetId);
                return (
                  <li key={item.id}>
                    {item.text} → {target?.text ?? targetId}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {q.type === 'lab' && q.lab && (
          <div>
            {q.lab.tasks.map((t, idx) => (
              <div key={idx} style={{ marginBottom: 8 }}>
                <strong>[{t.device}] {t.name}</strong>
                <pre className="pl__labCmds">{t.expected_commands.join('\n')}</pre>
              </div>
            ))}
            {q.lab.solution_images && q.lab.solution_images.length > 0 && (
              <div className="practice-answer__images">
                {q.lab.solution_images.map((src) => (
                  <img key={src} src={resolveImageUrl(src)} alt="模範解答" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        )}

        {q.answer_images && q.answer_images.length > 0 && (
          <div className="practice-answer__images">
            {q.answer_images.map((src) => (
              <img key={src} src={resolveImageUrl(src)} alt="解答" loading="lazy" />
            ))}
          </div>
        )}
        {q.explanation && (
          <div className="practice-answer__explanation">
            <strong>解説:</strong> {q.explanation}
          </div>
        )}
      </div>
    </div>
  );
}

function ListItem({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pl__item">
      <div className="pl__head">
        <span className="pl__num">問 {q.number}</span>
        <span className="pl__type">
          {q.type === 'multiple_choice' ? '選択' : q.type === 'drag_and_drop' ? 'D&D' : 'ラボ'}
        </span>
        {q.category && <span className="pl__cat">{q.category}</span>}
      </div>

      <div className="pl__qtext">{q.question_text}</div>

      {q.question_images && q.question_images.length > 0 && (
        <div className="pl__imgs">
          {q.question_images.map((src) => (
            <img key={src} src={resolveImageUrl(src)} alt="問題図" loading="lazy" />
          ))}
        </div>
      )}

      {q.type === 'multiple_choice' && q.choices && (
        <ul className="pl__choices">
          {q.choices.map((c) => {
            const isCorrect =
              open &&
              (q.correct_choices
                ? q.correct_choices.includes(c.letter)
                : q.answer?.split(',').map((s) => s.trim()).includes(c.letter));
            return (
              <li key={c.letter} className={isCorrect ? 'correct' : ''}>
                <span className="pl__letter">{c.letter}.</span>
                {c.text}
                {c.images && c.images.length > 0 && (
                  <div className="pl__choiceImgs">
                    {c.images.map((src) => (
                      <img key={src} src={resolveImageUrl(src)} alt={`選択肢 ${c.letter}`} loading="lazy" />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <AnswerBlock q={q} />
      ) : (
        <div className="pl__checkBtn">
          <button className="primary small" onClick={() => setOpen(true)}>答え合わせ</button>
        </div>
      )}
    </div>
  );
}

export default function PracticeListMode({ questions, onFinish }: Props) {
  const [allOpen, setAllOpen] = useState(false);

  // Scroll-to-top
  const scrollTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="app">
      <header className="app__header app__header--practice">
        <div>
          <h1 className="app__title--exam">CCNA 問題一覧</h1>
          <div className="app__subtitle--exam">{questions.length} 問</div>
        </div>
        <div className="pl__headerActions">
          <button className="secondary small" onClick={() => setAllOpen(!allOpen)}>
            {allOpen ? '全て閉じる' : '全て開く'}
          </button>
          <button className="secondary small" onClick={onFinish}>
            ← 戻る
          </button>
        </div>
      </header>

      <main className="app__main pl__list">
        {allOpen
          ? questions.map((q) => <ListItemOpen key={q.number} q={q} />)
          : questions.map((q) => <ListItem key={q.number} q={q} />)}
      </main>

      <button className="pl__scrollTop" onClick={scrollTop} title="トップへ戻る">
        ↑
      </button>
    </div>
  );
}

/** Always-open variant for "全て開く" mode */
function ListItemOpen({ q }: { q: Question }) {
  return (
    <div className="pl__item">
      <div className="pl__head">
        <span className="pl__num">問 {q.number}</span>
        <span className="pl__type">
          {q.type === 'multiple_choice' ? '選択' : q.type === 'drag_and_drop' ? 'D&D' : 'ラボ'}
        </span>
        {q.category && <span className="pl__cat">{q.category}</span>}
      </div>

      <div className="pl__qtext">{q.question_text}</div>

      {q.question_images && q.question_images.length > 0 && (
        <div className="pl__imgs">
          {q.question_images.map((src) => (
            <img key={src} src={resolveImageUrl(src)} alt="問題図" loading="lazy" />
          ))}
        </div>
      )}

      {q.type === 'multiple_choice' && q.choices && (
        <ul className="pl__choices">
          {q.choices.map((c) => {
            const isCorrect =
              q.correct_choices
                ? q.correct_choices.includes(c.letter)
                : q.answer?.split(',').map((s) => s.trim()).includes(c.letter);
            return (
              <li key={c.letter} className={isCorrect ? 'correct' : ''}>
                <span className="pl__letter">{c.letter}.</span>
                {c.text}
                {c.images && c.images.length > 0 && (
                  <div className="pl__choiceImgs">
                    {c.images.map((src) => (
                      <img key={src} src={resolveImageUrl(src)} alt={`選択肢 ${c.letter}`} loading="lazy" />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AnswerBlock q={q} />
    </div>
  );
}
