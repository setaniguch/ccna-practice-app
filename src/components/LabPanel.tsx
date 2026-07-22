import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabSpec } from '../types';
import { applyCommand, buildPrompt, INITIAL_STATE, type CliState } from '../utils/iosCli';
import {
  buildVocabulary,
  classifyHelpQuery,
  generateHelpCandidates,
  NO_CANDIDATES_MESSAGE,
} from '../utils/iosHelp';
import './LabPanel.css';

interface Props {
  lab: LabSpec;
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

export default function LabPanel({ lab, commands, onChange }: Props) {
  const devices = lab.devices;
  const [activeDevice, setActiveDevice] = useState(devices[0]?.hostname ?? '');
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
      const vocabulary = buildVocabulary(
        lab.tasks,
        activeDevice,
        cur.cli.mode,
      );
      const candidates = generateHelpCandidates(query, vocabulary);
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
      // 実機 IOS と同じく「現在打っている単語」だけを補完する。
      // 語彙集合は共有ロジック buildVocabulary で構築（ヘルプと同一・挙動不変）。
      const vocabulary = buildVocabulary(
        lab.tasks,
        activeDevice,
        currentState.cli.mode,
      );

      // 末尾に空白がなければ「現在の単語」を補完、空白で終わっていれば何もしない
      // （次に何が来るかは実機ではコマンドツリーに依存。ここでは値の自動補完を抑止）
      if (input.length === 0 || /\s$/.test(input)) return;
      const lastSpace = input.lastIndexOf(' ');
      const head = lastSpace >= 0 ? input.slice(0, lastSpace + 1) : '';
      const partial = input.slice(lastSpace + 1).toLowerCase();
      if (!partial) return;

      const matches = Array.from(vocabulary).filter((w) =>
        w.startsWith(partial),
      );
      if (matches.length === 0) return;
      if (matches.length === 1) {
        setInput(head + matches[0] + ' ');
      } else {
        let common = matches[0];
        for (const m of matches.slice(1)) {
          let i = 0;
          while (i < common.length && i < m.length && common[i] === m[i]) i++;
          common = common.slice(0, i);
        }
        if (common.length > partial.length) {
          setInput(head + common);
        } else {
          setStates((prev) => {
            const cur = prev[activeDevice];
            const newLines = [
              ...cur.lines,
              `${buildPrompt(activeDevice, cur.cli)}${input}`,
              matches.join('  '),
            ];
            return { ...prev, [activeDevice]: { ...cur, lines: newLines } };
          });
        }
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

  const tasksForDevice = useMemo(
    () => lab.tasks.filter((t) => t.device === activeDevice),
    [lab.tasks, activeDevice],
  );

  const prompt = buildPrompt(activeDevice, currentState.cli);

  return (
    <div className="lab">
      <div className="lab__deviceTabs">
        {devices.map((d) => (
          <button
            key={d.hostname}
            className={`lab__deviceTab${activeDevice === d.hostname ? ' lab__deviceTab--active' : ''}`}
            onClick={() => setActiveDevice(d.hostname)}
          >
            {d.hostname}
          </button>
        ))}
      </div>

      {tasksForDevice.length > 0 && (
        <div className="lab__deviceTaskHint" style={{ display: 'none' }} />
      )}

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
    </div>
  );
}
