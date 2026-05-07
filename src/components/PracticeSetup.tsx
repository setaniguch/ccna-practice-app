import { useMemo, useState } from 'react';
import type { Question } from '../types';
import './PracticeMode.css';

interface Props {
  allQuestions: Question[];
  onStart: (questions: Question[]) => void;
  onBack: () => void;
}

type FilterMode = 'category' | 'type' | 'range' | 'pick';

const CATEGORIES = [
  'ネットワーク基礎',
  'ネットワークアクセス',
  'IP接続',
  'IPサービス',
  'セキュリティ基礎',
  'ワイヤレス',
  '自動化',
] as const;

export default function PracticeSetup({ allQuestions, onStart, onBack }: Props) {
  const [filterMode, setFilterMode] = useState<FilterMode>('category');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['multiple_choice', 'drag_and_drop', 'lab']));
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(CATEGORIES));
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(50);
  const [pickText, setPickText] = useState('');
  const [shuffle, setShuffle] = useState(true);
  const [error, setError] = useState('');

  const maxNum = allQuestions.length;

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allQuestions.forEach((q) => {
      const c = q.category ?? 'ネットワーク基礎';
      m[c] = (m[c] || 0) + 1;
    });
    return m;
  }, [allQuestions]);

  const toggleType = (t: string) => {
    setSelectedTypes((prev) => {
      const s = new Set(prev);
      if (s.has(t)) s.delete(t);
      else s.add(t);
      return s;
    });
  };

  const toggleCat = (c: string) => {
    setSelectedCats((prev) => {
      const s = new Set(prev);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      return s;
    });
  };

  const handleStart = () => {
    let selected: Question[] = [];

    if (filterMode === 'category') {
      selected = allQuestions.filter((q) => {
        const cat = q.category ?? 'ネットワーク基礎';
        return selectedCats.has(cat);
      });
      if (selected.length === 0) {
        setError('少なくとも1つのカテゴリを選択してください');
        return;
      }
    } else if (filterMode === 'type') {
      selected = allQuestions.filter((q) => selectedTypes.has(q.type));
      if (selected.length === 0) {
        setError('少なくとも1つのタイプを選択してください');
        return;
      }
    } else if (filterMode === 'range') {
      const from = Math.max(1, rangeFrom);
      const to = Math.min(maxNum, rangeTo);
      if (from > to) {
        setError('範囲が無効です（開始 ≤ 終了）');
        return;
      }
      selected = allQuestions.filter((q) => q.number >= from && q.number <= to);
    } else {
      // pick specific numbers
      const nums = pickText
        .split(/[,\s、]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (nums.length === 0) {
        setError('問題番号を入力してください（カンマ区切り）');
        return;
      }
      const numSet = new Set(nums);
      selected = allQuestions.filter((q) => numSet.has(q.number));
      if (selected.length === 0) {
        setError('指定した番号に該当する問題がありません');
        return;
      }
    }

    if (shuffle) {
      for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
      }
    }

    setError('');
    onStart(selected);
  };

  return (
    <div className="practice-setup">
      <h2>練習モード設定</h2>

      <div className="ps__section">
        <h3>出題方法</h3>
        <div className="ps__tabs">
          <button className={filterMode === 'category' ? 'active' : ''} onClick={() => setFilterMode('category')}>
            カテゴリ別
          </button>
          <button className={filterMode === 'type' ? 'active' : ''} onClick={() => setFilterMode('type')}>
            タイプ別
          </button>
          <button className={filterMode === 'range' ? 'active' : ''} onClick={() => setFilterMode('range')}>
            番号範囲
          </button>
          <button className={filterMode === 'pick' ? 'active' : ''} onClick={() => setFilterMode('pick')}>
            番号指定
          </button>
        </div>
      </div>

      {filterMode === 'category' && (
        <div className="ps__section">
          {CATEGORIES.map((cat) => (
            <label key={cat} className="ps__check">
              <input type="checkbox" checked={selectedCats.has(cat)} onChange={() => toggleCat(cat)} />
              {cat}（{catCounts[cat] ?? 0} 問）
            </label>
          ))}
        </div>
      )}

      {filterMode === 'type' && (
        <div className="ps__section">
          <label className="ps__check">
            <input type="checkbox" checked={selectedTypes.has('multiple_choice')} onChange={() => toggleType('multiple_choice')} />
            選択問題（{allQuestions.filter((q) => q.type === 'multiple_choice').length} 問）
          </label>
          <label className="ps__check">
            <input type="checkbox" checked={selectedTypes.has('drag_and_drop')} onChange={() => toggleType('drag_and_drop')} />
            ドラッグ＆ドロップ（{allQuestions.filter((q) => q.type === 'drag_and_drop').length} 問）
          </label>
          <label className="ps__check">
            <input type="checkbox" checked={selectedTypes.has('lab')} onChange={() => toggleType('lab')} />
            ラボ（{allQuestions.filter((q) => q.type === 'lab').length} 問）
          </label>
        </div>
      )}

      {filterMode === 'range' && (
        <div className="ps__section">
          <div className="ps__range">
            <label>
              開始:
              <input type="number" min={1} max={maxNum} value={rangeFrom} onChange={(e) => setRangeFrom(Number(e.target.value))} />
            </label>
            <span>〜</span>
            <label>
              終了:
              <input type="number" min={1} max={maxNum} value={rangeTo} onChange={(e) => setRangeTo(Number(e.target.value))} />
            </label>
            <span className="ps__hint">（全 {maxNum} 問）</span>
          </div>
        </div>
      )}

      {filterMode === 'pick' && (
        <div className="ps__section">
          <p className="ps__hint">問題番号をカンマ区切りで入力してください（例: 18, 100, 635）</p>
          <textarea
            className="ps__textarea"
            value={pickText}
            onChange={(e) => setPickText(e.target.value)}
            placeholder="18, 100, 635"
            rows={3}
          />
        </div>
      )}

      <div className="ps__section">
        <label className="ps__check">
          <input type="checkbox" checked={shuffle} onChange={() => setShuffle(!shuffle)} />
          出題順をシャッフルする
        </label>
      </div>

      {error && <div className="ps__error">{error}</div>}

      <div className="ps__actions">
        <button className="secondary" onClick={onBack}>← 戻る</button>
        <button className="primary" onClick={handleStart}>練習を開始</button>
      </div>
    </div>
  );
}
