import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { acceptCompletion, autocompletion, closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from '@codemirror/commands';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { typstCompletionSource } from './typstSnippets';

export interface TypstCodeEditorHandle {
  focus: () => void;
  insert: (snippet: string) => void;
  wrapSelection: (prefix: string, suffix: string, placeholder?: string) => void;
  undo: () => void;
  redo: () => void;
  openSearch: () => void;
}

interface TypstCodeEditorProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onPasteImages?: (files: File[]) => void | Promise<void>;
}

interface TypstModeState {
  inRawBlock: boolean;
}

const typstLanguage = StreamLanguage.define<TypstModeState>({
  name: 'typst',
  startState: () => ({ inRawBlock: false }),
  token(stream, state) {
    if (state.inRawBlock) {
      if (stream.match(/```/)) {
        state.inRawBlock = false;
        return 'keyword';
      }
      stream.next();
      return 'string';
    }
    if (stream.sol() && stream.match(/={1,6}\s+.*$/)) return 'heading';
    if (stream.eatSpace()) return null;
    if (stream.match(/\/\/.*$/)) return 'comment';
    if (stream.match(/```/)) {
      state.inRawBlock = true;
      return 'keyword';
    }
    if (stream.match(/`[^`]*`/)) return 'string';
    if (stream.match(/#[\w-]+/)) return 'keyword';
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/'(?:[^'\\]|\\.)*'/)) return 'string';
    if (stream.match(/\b(?:true|false|none|auto|left|right|center|top|bottom)\b/)) return 'atom';
    if (stream.match(/\b\d+(?:\.\d+)?(?:%|pt|cm|mm|in|em)?\b/)) return 'number';
    stream.next();
    return null;
  },
});

const typstHighlighting = HighlightStyle.define([
  { tag: tags.heading, color: '#FFFFFF', fontWeight: '700' },
  { tag: tags.keyword, color: 'var(--brand-accent, #0F766E)', fontWeight: '600' },
  { tag: tags.string, color: '#D2D8D5' },
  { tag: tags.comment, color: '#B3B9BC', fontStyle: 'italic' },
  { tag: tags.number, color: 'var(--brand-accent, #0F766E)' },
  { tag: tags.atom, color: '#D2D8D5' },
]);

const typstTheme = EditorView.theme({
  '&': { height: '100%', minHeight: '100%', backgroundColor: '#080A0A', color: '#FFFFFF' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '16px 12px 24px 8px', caretColor: 'var(--brand-accent, #0F766E)' },
  '.cm-gutters': { backgroundColor: '#080A0A', color: '#B3B9BC', border: 'none', borderRight: '1px solid #252B29' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 8px', minWidth: '3ch' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#171B1A' },
  '.cm-cursor': { borderLeftColor: 'var(--brand-accent, #0F766E)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#24423E' },
  '.cm-searchMatch': { backgroundColor: '#39413F', outline: '1px solid #65706C' },
  '.cm-tooltip': { backgroundColor: '#101313', color: '#FFFFFF', border: '1px solid #39413F' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#171B1A', color: '#FFFFFF' },
  '.cm-panels': { backgroundColor: '#101313', color: '#FFFFFF', borderColor: '#252B29' },
  '.cm-textfield, .cm-button': { backgroundColor: '#171B1A', color: '#FFFFFF', borderColor: '#39413F' },
  '&.cm-focused': { outline: '2px solid var(--brand-accent, #0F766E)', outlineOffset: '-2px' },
}, { dark: true });

export const TypstCodeEditor = forwardRef<TypstCodeEditorHandle, TypstCodeEditorProps>(function TypstCodeEditor(
  { value, label, onChange, onPasteImages },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteImagesRef = useRef(onPasteImages);
  onChangeRef.current = onChange;
  onPasteImagesRef.current = onPasteImages;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    insert: (snippet) => {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: snippet },
        selection: EditorSelection.cursor(from + snippet.length),
        scrollIntoView: true,
      });
      view.focus();
    },
    wrapSelection: (prefix, suffix, placeholder = 'texto') => {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      const content = selected || placeholder;
      const insert = `${prefix}${content}${suffix}`;
      const selection = selected
        ? EditorSelection.cursor(from + insert.length)
        : EditorSelection.range(from + prefix.length, from + prefix.length + content.length);
      view.dispatch({ changes: { from, to, insert }, selection, scrollIntoView: true });
      view.focus();
    },
    undo: () => { const view = viewRef.current; if (view) undo(view); },
    redo: () => { const view = viewRef.current; if (view) redo(view); },
    openSearch: () => { const view = viewRef.current; if (view) { openSearchPanel(view); view.focus(); } },
  }), []);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        typstLanguage,
        syntaxHighlighting(typstHighlighting),
        autocompletion({ override: [typstCompletionSource], activateOnTyping: true }),
        keymap.of([
          { key: 'Tab', run: acceptCompletion },
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': label,
          'aria-multiline': 'true',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          paste(event) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const files = items
              .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file));
            if (files.length === 0 || !onPasteImagesRef.current) return false;
            event.preventDefault();
            void onPasteImagesRef.current(files);
            return true;
          },
        }),
        typstTheme,
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [label]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="h-full min-h-[240px] min-w-0 overflow-hidden bg-obsidian-bg" />;
});
