import type { Question } from '../types';
import { resolveImageUrl } from '../utils/imagePath';
import { computeDdRequired, isAnswerFullyEntered } from '../utils/answerStatus';
import { formatIosConfigText, looksLikeIosConfig, looksLikeIosConfigLoose, questionTextSuggestsCli } from '../utils/formatChoice';
import LabPanel from './LabPanel';
import './QuestionCard.css';
import { useState } from 'react';

interface DragDropAreaProps {
  items: { id: string; text: string }[];
  targets: { id: string; text: string }[];
  required: Record<string, number>;
  ddAnswers: Record<string, string>;
  onDdChange: (itemId: string, targetId: string) => void;
}

function DragDropArea({ items, targets, required, ddAnswers, onDdChange }: DragDropAreaProps) {
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null);

  // ddAnswers: itemId -> targetId
  // 既に配置済みのitem集合
  const placedItems = new Set(Object.keys(ddAnswers));
  // ターゲット内に配置されているitemを取得
  const itemsInTarget = (targetId: string) =>
    items.filter((it) => ddAnswers[it.id] === targetId);

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggingItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setOverTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overTarget !== targetId) setOverTarget(targetId);
  };

  const handleDragLeave = () => {
    setOverTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) onDdChange(itemId, targetId);
    setOverTarget(null);
    setDraggingItem(null);
  };

  // パレット（未配置）への戻し用
  const handleDropPalette = (e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) onDdChange(itemId, '');
    setDraggingItem(null);
  };

  const unplacedItems = items.filter((it) => !placedItems.has(it.id));

  return (
    <div className="dnd">
      <div className="dnd__pane">
        <div className="dnd__paneTitle">選択肢</div>
        <div
          className="dnd__palette"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropPalette}
        >
          {unplacedItems.length === 0 && (
            <div className="dnd__empty">（すべて配置済み）</div>
          )}
          {unplacedItems.map((it) => (
            <div
              key={it.id}
              className={`dnd__card${draggingItem === it.id ? ' dnd__card--dragging' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, it.id)}
              onDragEnd={handleDragEnd}
            >
              {it.text}
            </div>
          ))}
        </div>
      </div>
      <div className="dnd__pane">
        <div className="dnd__paneTitle">回答エリア</div>
        <div className="dnd__targets">
          {targets.map((t) => {
            const placed = itemsInTarget(t.id).length;
            const need = required[t.id] ?? 0;
            const filled = need > 0 && placed === need;
            const over = need > 0 && placed > need;
            return (
            <div
              key={t.id}
              className={`dnd__target${overTarget === t.id ? ' dnd__target--over' : ''}`}
              onDragOver={(e) => handleDragOver(e, t.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, t.id)}
            >
              <div className="dnd__targetLabel">
                {t.text}
                {need > 0 && (
                  <span className={`dnd__count${filled ? ' dnd__count--ok' : ''}${over ? ' dnd__count--over' : ''}`}>
                    {placed} / {need}
                  </span>
                )}
              </div>
              <div className="dnd__slot">
                {itemsInTarget(t.id).map((it) => (
                  <div
                    key={it.id}
                    className={`dnd__card dnd__card--placed${draggingItem === it.id ? ' dnd__card--dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, it.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {it.text}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Props {
  question: Question;
  selected: string[];
  ddAnswers: Record<string, string>;
  labCommands: Record<string, string[]>;
  onChange: (next: string[]) => void;
  onDdChange: (itemId: string, targetId: string) => void;
  onLabChange: (deviceHostname: string, commands: string[]) => void;
}

export default function QuestionCard({ question, selected, ddAnswers, labCommands, onChange, onDdChange, onLabChange }: Props) {
  const isMulti = question.multi_select === true;
  const isDragDrop = question.type === 'drag_and_drop';
  const isLab = question.type === 'lab';
  const hasDdData = isDragDrop && question.dd_items && question.dd_targets;
  const hasLabData = isLab && question.lab && question.lab.devices.length > 0;
  const isComplete = isAnswerFullyEntered(question, selected, ddAnswers);

  const toggle = (letter: string) => {
    if (isMulti) {
      const next = selected.includes(letter)
        ? selected.filter((l) => l !== letter)
        : [...selected, letter];
      onChange(next);
    } else {
      onChange([letter]);
    }
  };

  return (
    <div className="qcard">
      <h2 className="qcard__title">問 {question.number}</h2>
      {(() => {
        const text = question.question_text;
        const topoImgs = isLab ? question.lab?.topology_images : undefined;
        if (topoImgs && topoImgs.length > 0) {
          // 元HTMLと同じく Topology / トポロジ と Tasks / タスク の間に画像を挿入
          const m = text.match(/\n[ \t]*(Tasks|タスク)\s*\n?\s*-/);
          if (m && m.index !== undefined) {
            const before = text.slice(0, m.index);
            const after = text.slice(m.index);
            return (
              <>
                <p className="qcard__text">{before}</p>
                <div className="qcard__images">
                  {topoImgs.map((src) => (
                    <img key={src} src={resolveImageUrl(src)} alt="トポロジ図" />
                  ))}
                </div>
                <p className="qcard__text">{after}</p>
              </>
            );
          }
        }
        return <p className="qcard__text">{text}</p>;
      })()}

      {question.question_images && question.question_images.length > 0 && (
        <div className="qcard__images">
          {question.question_images.map((src) => (
            <img key={src} src={resolveImageUrl(src)} alt="問題図" />
          ))}
        </div>
      )}

      {hasDdData ? (
        <div className="qcard__dragdrop">
          <p className="qcard__hint">
            下のカードを各枠にドラッグ＆ドロップしてください（各カテゴリの右側の数字が「必要数 / 配置数」です）
          </p>
          <DragDropArea
            items={question.dd_items!}
            targets={question.dd_targets!}
            required={computeDdRequired(question)}
            ddAnswers={ddAnswers}
            onDdChange={onDdChange}
          />
          {!isComplete && (
            <div className="qcard__warn">
              ⚠ 未配置または配置数が不足しています。このまま「次へ」で進もうとすると不正解扱いになります。
            </div>
          )}
        </div>
      ) : isDragDrop ? (
        <div className="qcard__unsupported">
          この D&amp;D 問題は採点対象外です。
        </div>
      ) : hasLabData ? (
        <LabPanel
          key={question.number}
          lab={question.lab!}
          commands={labCommands}
          onChange={onLabChange}
        />
      ) : isLab ? (
        <div className="qcard__unsupported">
          このラボ問題は現在採点対象外です。
        </div>
      ) : question.type === 'multiple_choice' && question.choices ? (
        (() => {
          // 1問の中で「コード扱い」と「テキスト扱い」が混在すると見栄えが崩れるため、
          // 以下のいずれかを満たす場合は問題内の全選択肢を統一してコードブロックで描画する:
          //   1. 厳格な検出器でいずれかの選択肢が CLI と判定された
          //   2. 問題文が「コマンド／command」を主題にしており、かつ
          //      いずれかの選択肢が CLI らしいトークンで始まる短文（日本語混じりでない）
          const strict = question.choices.some((c) => looksLikeIosConfig(c.text));
          const hint = questionTextSuggestsCli(question.question_text) &&
            question.choices.some((c) => looksLikeIosConfigLoose(c.text));
          const useCodeStyle = strict || hint;
          return (
        <ul className="qcard__choices">
          {question.choices.map((c) => {
            const checked = selected.includes(c.letter);
            return (
              <li key={c.letter}>
                <label className={checked ? 'choice checked' : 'choice'}>
                  <input
                    type={isMulti ? 'checkbox' : 'radio'}
                    name={`q${question.number}`}
                    checked={checked}
                    onChange={() => toggle(c.letter)}
                  />
                  <span className="choice__letter">{c.letter}.</span>
                  <span className="choice__text">
                    {useCodeStyle ? (
                      <pre className="choice__code">{formatIosConfigText(c.text)}</pre>
                    ) : (
                      c.text
                    )}
                    {c.images && c.images.length > 0 && (
                      <span className="choice__images">
                        {c.images.map((src) => (
                          <img key={src} src={resolveImageUrl(src)} alt={`選択肢 ${c.letter}`} />
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
          {isMulti && (
            <li className="qcard__hint">
              ※ {question.correct_choices?.length ?? 0} 個選択してください（現在 {selected.length} 個）
            </li>
          )}
          {isMulti && !isComplete && (
            <li className="qcard__warn qcard__warn--li">
              ⚠ 選択数が不足していますが、このまま「次へ」で進むこともできます（不正解扱い）。
            </li>
          )}
        </ul>
          );
        })()
      ) : (
        <div className="qcard__unsupported">
          この問題形式 ({question.type}) は未対応です。
        </div>
      )}
    </div>
  );
}
