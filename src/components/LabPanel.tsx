import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabSpec } from '../types';
import { applyCommand, buildPrompt, INITIAL_STATE, type CliState } from '../utils/iosCli';
import {
  classifyHelpQuery,
  commandsForMode,
  generateHelpCandidates,
  NO_CANDIDATES_MESSAGE,
} from '../utils/iosHelp';
import { parseLabSections } from '../utils/labSections';
import { resolveImageUrl } from '../utils/imagePath';
import './LabPanel.css';

/** 左パネルのタブ。本番試験と同じ順序（Tasks / Guidelines / Topology）。 */
type InfoTab = 'tasks' | 'guidelines' | 'topology';

const INFO_TABS: { key: InfoTab; label: string }[] = [
  { key: 'tasks', label: 'タスク' },
  { key: 'guidelines', label: 'ガイドライン' },
  { key: 'topology', label: 'トポロジ' },
];

interface Props {
  lab: LabSpec;
  /** 問題文全体。ガイドライン / トポロジ / タスクのタブへ分解して表示する */
  questionText?: string;
  /** トポロジタブに表示する図 */
  topologyImages?: string[];
  /** デバイスごとの入力済みコマンド履歴（永続化用） */
  commands: Record<string, string[]>;
  onChange: (deviceHostname: string, commands: string[]) => void;
}

interface DeviceTerminalState {
  cli: CliState;
  /** 端末画面に表示する行（プロンプト+入力 / 出力） */
  lines: string[];
  /** 採点対象の入力コマンド一覧（モード遷移なども含む） */
  history: string[];
  /** 上下キーの履歴ナビ用カーソル */
  historyCursor: number;
}

export default function LabPanel({
  lab,
  questionText,
  topologyImages,
  commands,
  onChange,
}: Props) {
  const devices = lab.devices;
  const [activeDevice, setActiveDevice] = useState(devices[0]?.hostname ?? '');
  const [infoTab, setInfoTab] = useState<InfoTab>('tasks');
  const [states, setStates] = useState<Record<string, DeviceTerminalState>>(() => {
    const init: Record<string, DeviceTerminalState> = {};
    for (const d of devices) {
      const saved = commands[d.hostname] ?? [];
      // 保存済みコマンドを replay してモードを復元
      let cli: CliState = INITIAL_STATE;
      const lines: string[] = [];
      for (const c of saved) {
        lines.push(`${buildPrompt(d.hostname, cli)}${c}`);
        const r = applyCommand(cli, c);
        cli = r.next;
        for (const o of r.output) lines.push(o);
      }
      init[d.hostname] = { cli, lines, history: [...saved], historyCursor: saved.length };
    }
    return init;
  });
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const currentState = states[activeDevice];

  // 画面を最下部までスクロール
  useEffect(() => {
    if (screenRef.current) {
      screenRef.current.scrollTop = screenRef.current.scrollHeight;
    }
  }, [currentState?.lines.length, activeDevice]);

  // 問題文を左パネルのタブ（タスク / ガイドライン / トポロジ）に分解
  const sections = useMemo(() => parseLabSections(questionText), [questionText]);
  // 同一ファイル名の重複を除去したトポロジ図
  const topoImages = useMemo(
    () => Array.from(new Set(topologyImages ?? [])),
    [topologyImages],
  );

  if (!devices.length || !currentState) return null;

  const submitInput = () => {
    const raw = input;
    const cmd = raw.trimEnd();
    setInput('');
    setStates((prev) => {
      const cur = prev[activeDevice];
      const promptLine = `${buildPrompt(activeDevice, cur.cli)}${cmd}`;
      const newLines = [...cur.lines, promptLine];
      let nextCli = cur.cli;
      let newHistory = cur.history;
      if (cmd) {
        const r = applyCommand(cur.cli, cmd);
        nextCli = r.next;
        for (const o of r.output) newLines.push(o);
        newHistory = [...cur.history, cmd];
        // 親に通知
        onChange(activeDevice, newHistory);
      }
      return {
        ...prev,
        [activeDevice]: {
          cli: nextCli,
          lines: newLines,
          history: newHistory,
          historyCursor: newHistory.length,
        },
      };
    });
  };

  // ? ヘルプ本体。`inputBeforeQuestion` は ? を除いた入力途中の文字列。
  // keydown の ? / ？ 経路と、Enter 送信時に末尾が ? / ？ だった経路の双方から呼ぶ。
  // ヘルプは「調べる」補助操作。いかなる失敗も既存挙動を妨げない（要件 5.4, 6.4）
  const runHelp = (inputBeforeQuestion: string) => {
    try {
      const cur = states[activeDevice];
      const query = classifyHelpQuery(inputBeforeQuestion);
      // 現在の CLI モードで入力可能なコマンドだけを対象にする（実機同様）
      const phrases = commandsForMode(cur.cli.mode);
      const candidates = generateHelpCandidates(query, phrases);
      const outputLines =
        candidates.length > 0 ? candidates : [NO_CANDIDATES_MESSAGE];
      // classifyHelpQuery は full / word のみ返す（none は返さない）
      const preservedInput =
        query.kind === 'none' ? inputBeforeQuestion : query.preservedInput;

      // 結合行（プロンプト + 保持入力）を生成。失敗時は省略して候補出力を継続（要件 4.4）
      let promptLine: string | null = null;
      try {
        promptLine = `${buildPrompt(activeDevice, cur.cli)}${preservedInput}`;
      } catch {
        promptLine = null;
      }

      setStates((prev) => {
        const c = prev[activeDevice];
        const appended =
          promptLine !== null
            ? [promptLine, ...outputLines]
            : [...outputLines];
        return {
          ...prev,
          [activeDevice]: {
            // cli / history / historyCursor は不変（要件 5.1, 5.2）
            ...c,
            lines: [...c.lines, ...appended],
          },
        };
      });
      // ? を除去した入力を復元（要件 1.5, 4.1, 4.2）。onChange は呼ばない（要件 5.3）
      setInput(preservedInput);
    } catch {
      // 失敗時は何もしない＝既存挙動継続（要件 5.4, 6.4）
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // IME・全角入力などで ? / ？ が入力欄に残ったまま Enter された場合は
      // 送信せずヘルプとして扱う（末尾の ? / ？ を除去して分類）。
      if (/[?？]$/.test(input)) {
        const before = input.replace(/[?？]+$/, '');
        runHelp(before);
        return;
      }
      submitInput();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Tab 補完は ? ヘルプと同一の文脈依存ロジックを使う（実機準拠）。
      // 「現在打っている単語」を、その文脈で来られる次単語だけに補完する。
      try {
        // 末尾が空白 or 空なら補完しない（部分語がないため）
        if (input.length === 0 || /\s$/.test(input)) return;
        const lastSpace = input.lastIndexOf(' ');
        const head = lastSpace >= 0 ? input.slice(0, lastSpace + 1) : '';
        const partial = input.slice(lastSpace + 1).toLowerCase();
        if (!partial) return;

        const cur = states[activeDevice];
        const query = classifyHelpQuery(input); // word query（prefix=現在の単語）
        const phrases = commandsForMode(cur.cli.mode);
        const matches = generateHelpCandidates(query, phrases); // 前方一致済みの次単語

        if (matches.length === 0) return;
        if (matches.length === 1) {
          setInput(head + matches[0] + ' ');
        } else {
          // 共通接頭辞（大文字小文字無視）
          let common = matches[0].toLowerCase();
          for (const m of matches.slice(1)) {
            const ml = m.toLowerCase();
            let i = 0;
            while (i < common.length && i < ml.length && common[i] === ml[i]) i++;
            common = common.slice(0, i);
          }
          if (common.length > partial.length) {
            setInput(head + common);
          } else {
            setStates((prev) => {
              const c = prev[activeDevice];
              const newLines = [
                ...c.lines,
                `${buildPrompt(activeDevice, c.cli)}${input}`,
                matches.join('  '),
              ];
              return { ...prev, [activeDevice]: { ...c, lines: newLines } };
            });
          }
        }
      } catch {
        // 補完ロジック失敗時は何もしない（既存の入力を維持）
      }
    } else if ((e.key === '?' || e.key === '？') && !e.nativeEvent.isComposing) {
      // ? / ？ を input に混入させない（要件 1.4）。IME 変換中（isComposing）は除外
      e.preventDefault();
      runHelp(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStates((prev) => {
        const cur = prev[activeDevice];
        if (cur.history.length === 0) return prev;
        const newCursor = Math.max(0, cur.historyCursor - 1);
        setInput(cur.history[newCursor] ?? '');
        return { ...prev, [activeDevice]: { ...cur, historyCursor: newCursor } };
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStates((prev) => {
        const cur = prev[activeDevice];
        const newCursor = Math.min(cur.history.length, cur.historyCursor + 1);
        setInput(cur.history[newCursor] ?? '');
        return { ...prev, [activeDevice]: { ...cur, historyCursor: newCursor } };
      });
    }
  };

  const prompt = buildPrompt(activeDevice, currentState.cli);

  return (
    <div className="lab">
      <div className="lab__split">
        {/* 左パネル: タスク / ガイドライン / トポロジ（本番試験と同じ 3 タブ） */}
        <section className="lab__info">
          <div className="lab__infoTabs" role="tablist" aria-label="ラボ情報">
            {INFO_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`lab-infotab-${t.key}`}
                aria-selected={infoTab === t.key}
                aria-controls="lab-infopanel"
                className={`lab__infoTab${infoTab === t.key ? ' lab__infoTab--active' : ''}`}
                onClick={() => setInfoTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            className="lab__infoBody"
            id="lab-infopanel"
            role="tabpanel"
            aria-labelledby={`lab-infotab-${infoTab}`}
          >
            {infoTab === 'tasks' && (
              sections.intro || sections.tasks ? (
                <>
                  {sections.intro && (
                    <p className="lab__sectionText">{sections.intro}</p>
                  )}
                  {sections.tasks && (
                    <p className="lab__sectionText">{sections.tasks}</p>
                  )}
                </>
              ) : (
                <p className="lab__empty">タスクの記載はありません。</p>
              )
            )}

            {infoTab === 'guidelines' && (
              sections.guidelines ? (
                <p className="lab__sectionText">{sections.guidelines}</p>
              ) : (
                <p className="lab__empty">ガイドラインの記載はありません。</p>
              )
            )}

            {infoTab === 'topology' && (
              <>
                {topoImages.length > 0 && (
                  <div className="lab__topoImgs">
                    {topoImages.map((src) => (
                      <img key={src} src={resolveImageUrl(src)} alt="トポロジ図" />
                    ))}
                  </div>
                )}
                {sections.topology && (
                  <p className="lab__sectionText">{sections.topology}</p>
                )}
                {lab.topology && (
                  <pre className="lab__topoAscii">{lab.topology}</pre>
                )}
                {topoImages.length === 0 && !sections.topology && !lab.topology && (
                  <p className="lab__empty">トポロジ図はありません。</p>
                )}
                <div className="lab__topoDevices">
                  <span className="lab__topoDevicesLabel">
                    デバイスコンソールを開く:
                  </span>
                  {devices.map((d) => (
                    <button
                      key={d.hostname}
                      type="button"
                      className={`lab__topoDevice${activeDevice === d.hostname ? ' lab__topoDevice--active' : ''}`}
                      onClick={() => setActiveDevice(d.hostname)}
                    >
                      {d.hostname}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* 右パネル: デバイスごとのタブを持つターミナル */}
        <section className="lab__console">
          <div className="lab__deviceTabs" role="tablist" aria-label="デバイスコンソール">
            {devices.map((d) => (
              <button
                key={d.hostname}
                type="button"
                role="tab"
                aria-selected={activeDevice === d.hostname}
                className={`lab__deviceTab${activeDevice === d.hostname ? ' lab__deviceTab--active' : ''}`}
                onClick={() => setActiveDevice(d.hostname)}
              >
                {d.hostname}
              </button>
            ))}
          </div>

          <div className="lab__terminal" onClick={() => inputRef.current?.focus()}>
            <div className="lab__screen" ref={screenRef}>
              {currentState.lines.map((l, i) => (
                <div key={i} className="lab__line">{l}</div>
              ))}
              <div className="lab__inputLine">
                <span className="lab__prompt">{prompt}</span>
                <input
                  ref={inputRef}
                  className="lab__input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
