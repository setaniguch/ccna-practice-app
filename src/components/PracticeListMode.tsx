import { useCallback, useState } from 'react';
import type { Question } from '../types';
import { resolveImageUrl } from '../utils/imagePath';
import './PracticeListMode.css';

interface Props {
  questions: Question[];
  onFinish: () => void;
}

function ListItem({ q }: { q: Question }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pl__item">
      <div className="pl__head" onClick={() => setOpen(!open)}>
        <span className="pl__num">問 {q.number}</span>
        <span className="pl__type">
          {q.type === 'multiple_choice' ? '選択' : q.type === 'drag_and_drop' ? 'D&D' : 'ラボ'}
        </span>
        {q.category && <span className="pl__cat">{q.category}</span>}
        <span className={`pl__toggle ${open ? 'open' : ''}`}>▶</span>
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

      {open && (
        <div className="pl__answer">
          <div className="pl__answerLabel">正解</div>

          {q.type === 'multiple_choice' && (
            <div className="pl__answerText">
              {q.correct_choices ? q.correct_choices.join(', ') : q.answer}
            </div>
          )}

          {q.type === 'drag_and_drop' && q.dd_correct_mapping && q.dd_items && q.dd_targets && (
            <table className="pl__ddtable">
              <thead>
                <tr><th>項目</th><th>正解</th></tr>
              </thead>
              <tbody>
                {q.dd_items.map((item) => {
                  const targetId = q.dd_correct_mapping![item.id];
                  const target = q.dd_targets!.find((t) => t.id === targetId);
                  return (
                    <tr key={item.id}>
                      <td>{item.text}</td>
                      <td>{target?.text ?? targetId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {q.type === 'lab' && q.lab && (
            <div className="pl__labAnswer">
              {q.lab.tasks.map((t, idx) => (
                <div key={idx} className="pl__labTask">
                  <strong>[{t.device}] {t.name}</strong>
                  <pre className="pl__labCmds">{t.expected_commands.join('\n')}</pre>
                </div>
              ))}
              {q.lab.solution_images && q.lab.solution_images.length > 0 && (
                <div className="pl__imgs">
                  {q.lab.solution_images.map((src) => (
                    <img key={src} src={resolveImageUrl(src)} alt="模範解答" loading="lazy" />
                  ))}
                </div>
              )}
            </div>
          )}

          {q.answer_images && q.answer_images.length > 0 && (
            <div className="pl__imgs">
              {q.answer_images.map((src) => (
                <img key={src} src={resolveImageUrl(src)} alt="解答" loading="lazy" />
              ))}
            </div>
          )}
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

      <div className="pl__answer">
        <div className="pl__answerLabel">正解</div>

        {q.type === 'multiple_choice' && (
          <div className="pl__answerText">
            {q.correct_choices ? q.correct_choices.join(', ') : q.answer}
          </div>
        )}

        {q.type === 'drag_and_drop' && q.dd_correct_mapping && q.dd_items && q.dd_targets && (
          <table className="pl__ddtable">
            <thead>
              <tr><th>項目</th><th>正解</th></tr>
            </thead>
            <tbody>
              {q.dd_items.map((item) => {
                const targetId = q.dd_correct_mapping![item.id];
                const target = q.dd_targets!.find((t) => t.id === targetId);
                return (
                  <tr key={item.id}>
                    <td>{item.text}</td>
                    <td>{target?.text ?? targetId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {q.type === 'lab' && q.lab && (
          <div className="pl__labAnswer">
            {q.lab.tasks.map((t, idx) => (
              <div key={idx} className="pl__labTask">
                <strong>[{t.device}] {t.name}</strong>
                <pre className="pl__labCmds">{t.expected_commands.join('\n')}</pre>
              </div>
            ))}
            {q.lab.solution_images && q.lab.solution_images.length > 0 && (
              <div className="pl__imgs">
                {q.lab.solution_images.map((src) => (
                  <img key={src} src={resolveImageUrl(src)} alt="模範解答" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        )}

        {q.answer_images && q.answer_images.length > 0 && (
          <div className="pl__imgs">
            {q.answer_images.map((src) => (
              <img key={src} src={resolveImageUrl(src)} alt="解答" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
