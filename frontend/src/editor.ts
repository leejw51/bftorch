// editor.ts — a CodeMirror 6 Python editor wrapper for the PyTorch Sandbox.
//   - real Python syntax highlighting (@codemirror/lang-python)
//   - a dark theme + HighlightStyle matching the app palette
//   - curated PyTorch autocomplete (from hints.ts) so users learn while typing
//   - Ctrl/Cmd+Enter runs the code
//   - getCode() / setCode() helpers

import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  highlightSpecialChars,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  foldGutter,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { PYTORCH_HINTS } from './hints';

/* ------------------------------------------------------------------ *
 * Theme: editor chrome + selection + gutter colors.
 * ------------------------------------------------------------------ */
const sandboxTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text)',
      backgroundColor: 'var(--code-bg)',
      fontSize: '13px',
      height: '100%',
      borderRadius: '8px',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      lineHeight: '1.6',
      padding: '6px 0',
    },
    '.cm-content': { caretColor: 'var(--accent)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'rgba(238,76,44,0.22)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(238,76,44,0.10)',
      color: 'var(--accent-2)',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(238,76,44,0.25)',
      color: 'inherit',
      outline: '1px solid rgba(238,76,44,0.4)',
    },
    // autocomplete popup
    '.cm-tooltip': {
      backgroundColor: 'var(--panel-2)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: '12.5px',
      maxHeight: '16em',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'rgba(238,76,44,0.18)',
      color: 'var(--text)',
    },
    '.cm-completionLabel': { color: 'var(--text)' },
    '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '0.6em' },
    '.cm-completionIcon': { color: 'var(--accent-2)', opacity: '0.9' },
    '.cm-completionInfo': {
      backgroundColor: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      color: 'var(--muted)',
      padding: '8px 10px',
      maxWidth: '320px',
    },
  },
  { dark: true },
);

/* ------------------------------------------------------------------ *
 * Syntax token colors (match the cheatsheet palette).
 * ------------------------------------------------------------------ */
const sandboxHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: 'var(--keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--fn)' },
  { tag: [t.definition(t.function(t.variableName))], color: 'var(--fn)' },
  { tag: [t.className, t.typeName, t.namespace], color: 'var(--tag)' },
  { tag: [t.propertyName], color: 'var(--text)' },
  { tag: [t.variableName], color: 'var(--text)' },
  { tag: [t.operator, t.punctuation], color: 'var(--muted)' },
  { tag: [t.self, t.atom], color: 'var(--keyword)' },
]);

/* ------------------------------------------------------------------ *
 * Autocomplete source: curated PyTorch hints + identifiers in the doc.
 * ------------------------------------------------------------------ */
// Most important PyTorch functions, in priority order — these surface first in
// the popup so beginners meet the essentials before the long tail.
const IMPORTANT: string[] = [
  'torch.tensor', 'torch.zeros', 'torch.ones', 'torch.arange', 'torch.randn',
  'reshape', 'view', 'permute', 'transpose', 'squeeze', 'unsqueeze',
  'torch.matmul', '@', 'torch.cat', 'torch.stack',
  '.sum()', '.mean()', '.max()', '.argmax()', 'torch.softmax',
  'requires_grad', '.backward()', '.grad', 'torch.no_grad', '.item()',
  'nn.Linear', 'nn.ReLU', 'nn.Sequential', 'nn.Module',
  'F.relu', 'F.softmax', 'F.cross_entropy',
  'torch.optim.Adam', '.zero_grad()', '.step()', '.parameters()',
  '.shape', '.dtype', '.to()',
];

function boostFor(label: string): number {
  const i = IMPORTANT.indexOf(label);
  if (i >= 0) return 99 - i; // earlier in IMPORTANT → higher boost → ranked first
  if (label.startsWith('torch.') || label.startsWith('nn.') || label.startsWith('F.')) return -10;
  return -20;
}

// The last segment of a label, e.g. 'torch.arange' → 'arange', '.sum()' → 'sum()'.
function lastSegment(label: string): string {
  const s = label.replace(/^[.@]/, '');
  const dot = s.lastIndexOf('.');
  return dot >= 0 ? s.slice(dot + 1) : s;
}

// Top-level completions: full labels (e.g. typing `torch.ar` → `torch.arange`).
const TOPLEVEL_COMPLETIONS: Completion[] = PYTORCH_HINTS.map((h) => ({
  label: h.label,
  detail: h.detail,
  info: h.info,
  type: h.type,
  boost: boostFor(h.label),
}));

// Member completions: after a dot (e.g. typing `x.per` → `permute`). We match &
// insert just the segment after the dot so the filter text lines up.
const MEMBER_COMPLETIONS: Completion[] = PYTORCH_HINTS.map((h) => {
  const seg = lastSegment(h.label);
  return { label: seg, apply: seg, detail: h.detail, info: h.info, type: h.type, boost: boostFor(h.label) };
}).filter((c) => c.label.length > 0);

function pytorchCompletions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[@A-Za-z_][\w.]*/);
  if (!word) return null;
  if (word.from === word.to && !ctx.explicit) return null;

  // Member access: the user typed `something.partial` → complete the part after
  // the LAST dot (so labels like `permute` match what was typed).
  const dot = word.text.lastIndexOf('.');
  if (dot >= 0) {
    return {
      from: word.from + dot + 1,
      options: MEMBER_COMPLETIONS,
      validFor: /^\w*$/,
    };
  }

  return {
    from: word.from,
    options: TOPLEVEL_COMPLETIONS,
    validFor: /^[@A-Za-z_][\w.]*$/,
  };
}

/* ------------------------------------------------------------------ */

export interface EditorHandle {
  view: EditorView;
  getCode(): string;
  setCode(code: string): void;
  focus(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  doc?: string;
  onRun?: () => void;
}

const language = new Compartment();

export function createEditor({ parent, doc = '', onRun }: EditorOptions): EditorHandle {
  const runKeymap = keymap.of([
    {
      key: 'Mod-Enter',
      preventDefault: true,
      run: () => {
        onRun?.();
        return true;
      },
    },
  ]);

  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      language.of(python()),
      syntaxHighlighting(sandboxHighlight),
      // Pop hints automatically as the user types (not only on a manual trigger).
      autocompletion({
        override: [pytorchCompletions],
        icons: true,
        activateOnTyping: true,
        activateOnTypingDelay: 80,
        maxRenderedOptions: 60,
      }),
      runKeymap,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      sandboxTheme,
      EditorView.lineWrapping,
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode: (code: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      });
    },
    focus: () => view.focus(),
  };
}
