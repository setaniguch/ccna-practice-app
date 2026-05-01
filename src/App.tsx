import { useEffect, useMemo, useRef, useState } from 'react';
import questionsData from './data/questions.json';
import type { Question, AnswerMap, DragDropAnswerMap, LabAnswerMap } from './types';
import QuestionCard from './components/QuestionCard';
import ResultPanel from './components/ResultPanel';
import { isAnswerFullyEntered } from './utils/answerStatus';
import './App.css';

const ALL_QUESTIONS = questionsData as Question[];
/** 本番 CCNA に近い出題数 */
const QUESTION_COUNT = 100;
/** 制限時間（分）— 本番 CCNA 200-301 は 120 分 */
const TIME_LIMIT_MIN = 120;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions(): Question[] {
  return shuffle(ALL_QUESTIONS).slice(0, Math.min(QUESTION_COUNT, ALL_QUESTIONS.length));
}

function formatTime(sec: number): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Phase = 'start' | 'exam' | 'result';

export default function App() {
  const [phase, setPhase] = useState<Phase>('start');
  const [sessionId, setSessionId] = useState(0);
  const questions = useMemo(() => pickQuestions(), [sessionId]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [ddAnswers, setDdAnswers] = useState<DragDropAnswerMap>({});
  const [labAnswers, setLabAnswers] = useState<LabAnswerMap>({});
  const [endsAt, setEndsAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
  const finishedRef = useRef(false);

  // 1秒ごとに残り時間更新
  useEffect(() => {
    if (phase !== 'exam') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // 時間切れで自動採点
  useEffect(() => {
    if (phase !== 'exam') return;
    if (endsAt && now >= endsAt && !finishedRef.current) {
      finishedRef.current = true;
      setPhase('result');
    }
  }, [phase, endsAt, now]);

  // ブラウザ閉じ防止（試験中）
  useEffect(() => {
    if (phase !== 'exam') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  const current = questions[index];
  const isLast = index === questions.length - 1;
  const canProceed = true; // 本番 CCNA 同様、未回答でも次へ進める
  const fullyEntered = current
    ? isAnswerFullyEntered(current, answers[current.number] ?? [], ddAnswers[current.number] ?? {})
    : false;

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

  const handleNext = () => {
    if (!canProceed) return;
    if (isLast) {
      // 本番 CCNA 同様、試験終了時のみ最終確認を表示
      const ok = window.confirm(
        'これは最後の問題です。試験を終了して採点します。\n本当に終了してよろしいですか？',
      );
      if (!ok) return;
      finishedRef.current = true;
      setPhase('result');
    } else {
      // 本番試験では「次へ」押下に確認ダイアログは出ない
      setIndex((i) => i + 1);
    }
  };

  const handleStart = () => {
    setSessionId((s) => s + 1);
    setIndex(0);
    setAnswers({});
    setDdAnswers({});
    setLabAnswers({});
    finishedRef.current = false;
    setEndsAt(Date.now() + TIME_LIMIT_MIN * 60 * 1000);
    setNow(Date.now());
    setPhase('exam');
  };

  const handleRestart = () => {
    setPhase('start');
  };

  // ===== Start screen =====
  if (phase === 'start') {
    return (
      <div className="app">
        <header className="app__header">
          <h1>CCNA 200-301 模擬試験</h1>
          <p className="app__subtitle">
            プールから無作為に <strong>{Math.min(QUESTION_COUNT, ALL_QUESTIONS.length)}</strong> 問を出題します
            （問題プール: 全 {ALL_QUESTIONS.length} 問）
          </p>
        </header>
        <main className="app__main">
          <h2 className="start__title">試験ガイドライン</h2>
          <ul className="start__list">
            <li>制限時間: <strong>{TIME_LIMIT_MIN} 分</strong>。残り時間は画面右上に表示されます。</li>
            <li>出題数: <strong>{Math.min(QUESTION_COUNT, ALL_QUESTIONS.length)} 問</strong>（毎回ランダム抽出）。</li>
            <li><strong>一度「次へ」を押すと、前の問題には戻れません</strong>（本番試験と同じ仕様）。</li>
            <li>未回答状態では「次へ」に進めません。すべて回答してから進んでください。</li>
            <li>制限時間が経過すると、自動的に試験が終了し採点されます。</li>
            <li>試験中はブラウザを閉じないでください。リロードすると進捗は失われます。</li>
            <li>採点結果画面では、問題ごとの正誤・正解・あなたの回答を確認できます。</li>
          </ul>
          <div className="start__actions">
            <button className="primary big" onClick={handleStart}>
              試験を開始する
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ===== Result screen =====
  if (phase === 'result') {
    return (
      <div className="app">
        <header className="app__header">
          <h1>CCNA 200-301 模擬試験 — 採点結果</h1>
        </header>
        <main className="app__main">
          <ResultPanel
            questions={questions}
            answers={answers}
            ddAnswers={ddAnswers}
            labAnswers={labAnswers}
            onRestart={handleRestart}
          />
        </main>
      </div>
    );
  }

  // ===== Exam screen =====
  const remainSec = Math.max(0, Math.floor((endsAt - now) / 1000));
  const lowTime = remainSec <= 5 * 60;
  return (
    <div className="app">
      <header className="app__header app__header--exam">
        <div>
          <h1 className="app__title--exam">CCNA 200-301 模擬試験</h1>
          <div className="app__subtitle--exam">
            問 {index + 1} / {questions.length}（残 {questions.length - index - 1} 問）
          </div>
        </div>
        <div className={`timer${lowTime ? ' timer--low' : ''}`}>
          残り時間 <span className="timer__value">{formatTime(remainSec)}</span>
        </div>
      </header>
      <div className="exam-progress">
        <div
          className="exam-progress__bar"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
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
        <div className="nav nav--single">
          <div className="nav__hint">
            {fullyEntered
              ? '回答済みです。「次へ」を押すと前の問題には戻れません。'
              : '未回答または不完全な回答ですが、「次へ」で進むこともできます（本番 CCNA 同様、未回答は不正解扱い）。'}
          </div>
          <button className="primary" onClick={handleNext} disabled={!canProceed}>
            {isLast ? '試験を終了して採点 →' : '次へ →'}
          </button>
        </div>
      </main>
    </div>
  );
}
