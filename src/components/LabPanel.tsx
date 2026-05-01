import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabSpec } from '../types';
import { applyCommand, buildPrompt, INITIAL_STATE, type CliState } from '../utils/iosCli';
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

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInput();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // 実機 IOS と同じく「現在打っている単語」だけを補完する。
      // expected_commands と共通 IOS コマンドからキーワード辞書を構築。
      const COMMON_COMMANDS = [
        'enable', 'disable', 'exit', 'end',
        'configure terminal',
        'write', 'write memory',
        'copy running-config startup-config',
        'show running-config', 'show startup-config',
        'show ip interface brief', 'show interfaces', 'show vlan brief',
        'show ip route', 'show version',
        'no shutdown', 'shutdown',
        'interface', 'interface range',
        'switchport', 'trunk', 'allowed', 'vlan', 'native',
        'channel-group', 'mode', 'active', 'passive', 'on',
        'port-channel', 'ethernet', 'gigabitethernet', 'fastethernet',
      ];
      const allCommands = [
        ...lab.tasks
          .filter((t) => t.device === activeDevice)
          .flatMap((t) => t.expected_commands),
        ...COMMON_COMMANDS,
      ];
      // 各コマンドを単語に分解して語彙集合を構築
      // ただし数値や ',' を含むトークン（VLAN リスト等の値）は除外
      const isValueToken = (tok: string) =>
        /[0-9,]/.test(tok) || tok.length === 0;
      const vocabulary = new Set<string>();
      for (const cmd of allCommands) {
        for (const tok of cmd.split(/\s+/)) {
          if (!isValueToken(tok)) vocabulary.add(tok.toLowerCase());
        }
      }

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
