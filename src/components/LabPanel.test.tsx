import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { LabSpec } from '../types';
import LabPanel from './LabPanel';

/**
 * Component / regression tests for the `?` help feature in the Lab terminal.
 *
 * These cover UI integration concerns that are NOT expressible as pure-logic
 * property tests: input restoration, focus retention, screen scrolling,
 * onChange non-firing, graded-history invariance, and non-regression of the
 * existing Enter / Tab / history-navigation behavior.
 *
 * The pure logic (classification / vocabulary / candidate generation) is
 * covered separately in src/utils/iosHelp.test.ts.
 */

// A controllable switch that lets a single test force the help pure-functions
// to throw, so we can exercise the defensive try/catch fallback (要件 5.4, 6.4).
// vi.hoisted is required because vi.mock factories are hoisted above imports.
const helpControl = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock('../utils/iosHelp', async (importActual) => {
  const actual = await importActual<typeof import('../utils/iosHelp')>();
  const boom = () => {
    throw new Error('help failure (test)');
  };
  return {
    ...actual,
    classifyHelpQuery: (input: string) =>
      helpControl.shouldThrow ? boom() : actual.classifyHelpQuery(input),
    generateHelpCandidates: (
      query: import('../utils/iosHelp').HelpQuery,
      vocabulary: Set<string>,
    ) =>
      helpControl.shouldThrow ? boom() : actual.generateHelpCandidates(query, vocabulary),
  };
});

/** 代表的なラボ仕様（デバイス R1 と 2 タスク）。 */
function makeLab(): LabSpec {
  return {
    devices: [{ hostname: 'R1', kind: 'router' }],
    tasks: [
      {
        name: 'IF 設定',
        description: 'インターフェース設定',
        device: 'R1',
        expected_commands: ['show ip interface brief', 'interface gigabitethernet0/0'],
      },
    ],
  };
}

/** LabPanel を描画し、入力要素・スクリーン・onChange モックを返すヘルパ。 */
function renderLab(commands: Record<string, string[]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <LabPanel lab={makeLab()} commands={commands} onChange={onChange} />,
  );
  const input = utils.container.querySelector('.lab__input') as HTMLInputElement;
  const screen = utils.container.querySelector('.lab__screen') as HTMLDivElement;
  return { ...utils, input, screen, onChange };
}

/** 画面に描画された行（.lab__line）のテキストを配列で返す。 */
function lineTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.lab__line')).map(
    (el) => el.textContent ?? '',
  );
}

/** 入力欄に値をセットする（onChange 経由で React state を更新）。 */
function typeValue(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  helpControl.shouldThrow = false;
});

afterEach(() => {
  cleanup();
  helpControl.shouldThrow = false;
  vi.clearAllMocks();
});

// 8.1 入力復元・フォーカス保持・スクロール
describe('8.1 入力復元・フォーカス保持・スクロール (要件 4.3, 4.5, 4.6)', () => {
  it('? 押下後、入力欄の値が preservedInput に復元される (要件 4.5)', () => {
    const { input } = renderLab();
    typeValue(input, 'sh');
    input.focus();

    fireEvent.keyDown(input, { key: '?' });

    // Word_Help_Query: preservedInput === 'sh'（? を含まず順序・内容不変）
    expect(input.value).toBe('sh');
  });

  it('? 押下後も入力要素がフォーカスを保持する (要件 4.5)', () => {
    const { input } = renderLab();
    typeValue(input, 'sh');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: '?' });

    expect(document.activeElement).toBe(input);
  });

  it('lines の描画順序が [結合行(prompt+preservedInput), ...候補] になる (要件 4.3)', () => {
    const { input, container } = renderLab();
    typeValue(input, 'sh');
    input.focus();

    fireEvent.keyDown(input, { key: '?' });

    // 'sh' に前方一致する語彙: show, shutdown（大文字小文字非依存の辞書順）
    // 結合行は現在のプロンプト(R1>) + preservedInput('sh')
    expect(lineTexts(container)).toEqual(['R1>sh', 'show', 'shutdown']);
  });

  it('ヘルプ出力の追加後、画面が最下部までスクロールする (要件 4.6)', async () => {
    const { input, screen } = renderLab();

    // jsdom はレイアウトを行わないため scrollHeight/scrollTop を明示的に定義し、
    // useEffect が scrollTop = scrollHeight を実行することを検証する。
    let scrollTopValue = 0;
    Object.defineProperty(screen, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(screen, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (v: number) => {
        scrollTopValue = v;
      },
    });

    typeValue(input, 'sh');
    input.focus();
    fireEvent.keyDown(input, { key: '?' });

    await waitFor(() => {
      expect(scrollTopValue).toBe(1000);
    });
  });
});

// 8.2 onChange 非発火・採点履歴非記録
describe('8.2 onChange 非発火・採点履歴非記録 (要件 5.1, 5.3)', () => {
  it('? 入力で onChange が呼ばれない (要件 5.3)', () => {
    const { input, onChange } = renderLab();
    typeValue(input, 'show ip');
    input.focus();

    fireEvent.keyDown(input, { key: '?' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ヘルプ処理の前後で採点履歴 (history) が不変である (要件 5.1)', () => {
    // 事前に 'enable' を履歴に持つ状態で描画（history=['enable'], mode=priv）
    const { input, onChange } = renderLab({ R1: ['enable'] });

    // ヘルプを実行（? 入力）→ history には何も追加されないはず
    typeValue(input, 'show ip');
    input.focus();
    fireEvent.keyDown(input, { key: '?' });
    expect(onChange).not.toHaveBeenCalled();

    // 実コマンド 'exit' を Enter 送信 → history は ['enable', 'exit'] になるべき。
    // もしヘルプが履歴に混入していれば末尾が 'exit' 単独 +1 にならない。
    typeValue(input, 'exit');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('R1', ['enable', 'exit']);
  });
});

// 8.3 既存挙動の非退行（回帰）
describe('8.3 既存挙動の非退行（回帰） (要件 6.1, 6.2, 6.4)', () => {
  it('? を含まないコマンドの Enter 送信で history が +1 され onChange が発火する (要件 6.1, 6.2)', () => {
    const { input, onChange, container } = renderLab();
    typeValue(input, 'enable');
    input.focus();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('R1', ['enable']);
    // 送信後は入力欄がクリアされ、プロンプト行が画面に追加される
    expect(input.value).toBe('');
    expect(lineTexts(container)).toContain('R1>enable');
  });

  it('Tab 補完が従来通り単一候補を補完する (要件 6.1)', () => {
    const { input } = renderLab();
    typeValue(input, 'ena');
    input.focus();

    fireEvent.keyDown(input, { key: 'Tab' });

    // 'ena' の唯一の候補 'enable' に補完され末尾に空白が付く
    expect(input.value).toBe('enable ');
  });

  it('上下キーの履歴ナビが従来通り動作する (要件 6.1)', () => {
    const { input } = renderLab({ R1: ['enable', 'configure terminal'] });
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('configure terminal');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('enable');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('configure terminal');
  });

  it('ヘルプ関数が例外を投げても Enter 送信が継続動作する (要件 6.4)', () => {
    helpControl.shouldThrow = true;
    const { input, onChange, container } = renderLab();

    typeValue(input, 'sh');
    input.focus();
    // ? はヘルプ関数の例外により何も起こさない（既存挙動を妨げない）
    fireEvent.keyDown(input, { key: '?' });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('sh'); // 入力は保持される

    // Enter は従来通り送信できる
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('R1', ['sh']);
    expect(lineTexts(container)).toContain('R1>sh');
  });

  it('ヘルプ関数が例外を投げても Tab 補完と履歴ナビが継続動作する (要件 6.4)', () => {
    helpControl.shouldThrow = true;
    const { input } = renderLab({ R1: ['enable'] });
    input.focus();

    // Tab 補完は buildVocabulary（非モック）を使うため継続動作する
    typeValue(input, 'ena');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('enable ');

    // 履歴ナビも継続動作
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('enable');
  });
});
