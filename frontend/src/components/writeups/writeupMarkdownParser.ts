import katex from 'katex';
import { Marked, type Token, type TokenizerAndRendererExtension } from 'marked';
import markedFootnote from 'marked-footnote';

function mathExtension(displayMode: boolean): TokenizerAndRendererExtension {
  const name = displayMode ? 'writeupMathBlock' : 'writeupMathInline';
  const pattern = displayMode
    ? /^ {0,3}\$\$[ \t]*([^$]+?)\$\$[ \t]*(?=\n|$)\n?/
    : /^\$(?![\s$])((?:\\[^\n]|[^\\$\n|])+?)(?<!\s)\$(?![$\d])/;
  return {
    name,
    level: displayMode ? 'block' : 'inline',
    start(source) {
      if (!displayMode) return source.indexOf('$');
      const start = /(?:^|\n) {0,3}\$\$/.exec(source);
      return start ? start.index + (start[0].startsWith('\n') ? 1 : 0) : undefined;
    },
    tokenizer(source) {
      const match = pattern.exec(source);
      const text = match?.[1].trim();
      if (!match || !text) return;
      return { type: name, raw: match[0], text };
    },
    renderer(token) {
      const markup = katex.renderToString(token.text, {
        displayMode, output: 'mathml', trust: false, throwOnError: false,
        maxExpand: 100, maxSize: 20,
      });
      return displayMode ? `<div class="writeup-math-block">${markup}</div>\n` : markup;
    },
  };
}

const criticPattern = /^\{(?:\+\+(.+?)\+\+|--(.+?)--|~~(.+?)~>(.+?)~~|>>(.+?)<<|==(.+?)==)\}/;
const criticMarkup: TokenizerAndRendererExtension = {
  name: 'writeupCriticMarkup',
  level: 'inline',
  start(source) {
    return source.search(/\{(?:\+\+|--|~~|>>|==)/);
  },
  tokenizer(source) {
    const match = criticPattern.exec(source);
    if (!match) return;
    const [, addition, deletion, original, replacement, comment, highlight] = match;
    const parts = [
      ['ins', addition], ['del', deletion], ['del', original], ['ins', replacement],
      ['aside', comment], ['mark', highlight],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]));
    return {
      type: 'writeupCriticMarkup',
      raw: match[0],
      parts: parts.map(([tag, text]) => ({ tag, content: this.lexer.inlineTokens(text.trim()) })),
    };
  },
  renderer(token) {
    return token.parts.map(({ tag, content }: { tag: string; content: Token[] }) => {
      const inner = this.parser.parseInline(content);
      return tag === 'aside' ? `<span class="writeup-critic-note">[Nota de revisión: ${inner}]</span>` : `<${tag}>${inner}</${tag}>`;
    }).join(' ');
  },
};

export const writeupMarkdownParser = new Marked(
  markedFootnote({ description: 'Notas al pie', backRefLabel: 'Volver a la referencia' }),
  { extensions: [mathExtension(true), mathExtension(false), criticMarkup] },
);

/** Complete a short delimiter row for preview only. Marked leaves missing body cells empty. */
export function fillMissingTableDelimiters(markdown: string): string {
  const lines = markdown.split('\n');
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const fenceMarker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (fenceMarker && fenceMarker[1][0] === fence[0] && fenceMarker[1].length >= fence.length && !fenceMarker[2].trim()) fence = undefined;
      continue;
    }
    if (fenceMarker) {
      fence = fenceMarker[1];
      continue;
    }
    const delimiter = /^ {0,3}\|(?:[ \t]*:?-+:?[ \t]*\|)+$/.test(line);
    const header = lines[i - 1]?.trimEnd();
    if (!delimiter || !header || !/^ {0,3}\|.*\|$/.test(header)) continue;
    const count = (row: string) => (row.match(/(?<!\\)\|/g)?.length ?? 0) - 1;
    const missing = count(header) - count(line);
    if (missing > 0) lines[i] = line + ' --- |'.repeat(missing);
  }
  return lines.join('\n');
}
