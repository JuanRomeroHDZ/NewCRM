import { marked } from 'marked';

export type MarkdownListStyle =
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'done'
  | 'nested-bullet'
  | 'nested-ordered'
  | 'square'
  | 'circle'
  | 'alpha'
  | 'alpha-upper'
  | 'roman'
  | 'roman-upper';

export interface MarkdownEditResult {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
}

const listPrefix = /^\s*(?:(?:[-+*])\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s*)/;

function selectedLineRange(source: string, selectionStart: number, selectionEnd: number) {
  const start = Math.max(0, Math.min(source.length, selectionStart));
  const end = Math.max(start, Math.min(source.length, selectionEnd));
  const blockStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lastSelectedCharacter = end > start ? end - 1 : start;
  const newline = source.indexOf('\n', lastSelectedCharacter);
  const blockEnd = newline < 0 ? source.length : newline;
  return { start, end, blockStart, blockEnd, block: source.slice(blockStart, blockEnd) };
}

function cleanListItem(line: string): string {
  return line.replace(listPrefix, '').trim();
}

export function transformMarkdownList(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  style: MarkdownListStyle,
): MarkdownEditResult {
  const range = selectedLineRange(source, selectionStart, selectionEnd);
  const originalLines = range.block.split('\n');
  const items = originalLines.map(cleanListItem).filter((line) => line.length > 0);
  // Keep an empty list item at the caret so the user can start typing directly.
  const content = items.length ? items : [''];
  const prefixStyles: Partial<Record<MarkdownListStyle, (index: number) => string>> = {
    bullet: () => '- ',
    ordered: (index) => `${index + 1}. `,
    task: () => '- [ ] ',
    done: () => '- [x] ',
    // CommonMark requires four spaces for a nested list under a `- ` item.
    'nested-bullet': () => '    - ',
    'nested-ordered': (index) => `    ${index + 1}. `,
  };

  let replacement = '';
  const prefix = prefixStyles[style];
  if (prefix) {
    replacement = content.map((item, index) => `${prefix(index)}${item}`).join('\n');
  } else {
    const listTag = style === 'square' || style === 'circle' ? 'ul' : 'ol';
    const listType = style === 'square' ? 'square'
      : style === 'circle' ? 'circle'
      : style === 'alpha' ? 'a'
      : style === 'alpha-upper' ? 'A'
      : style === 'roman' ? 'i' : 'I';
    const itemsHtml = content.map((item) => `<li>${marked.parseInline(item, { async: false })}</li>`).join('\n');
    replacement = `<${listTag} type="${listType}">\n${itemsHtml}\n</${listTag}>`;
  }

  const markdown = source.slice(0, range.blockStart) + replacement + source.slice(range.blockEnd);
  const cursor = range.blockStart + replacement.length;
  return { markdown, selectionStart: cursor, selectionEnd: cursor };
}

export function indentMarkdownLines(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'indent' | 'outdent',
): MarkdownEditResult {
  const range = selectedLineRange(source, selectionStart, selectionEnd);
  const lines = range.block.split('\n');
  const nextLines = lines.map((line) => {
    if (direction === 'indent') return `    ${line}`;
    return line.replace(/^ {1,4}/, '');
  });
  const replacement = nextLines.join('\n');
  const markdown = source.slice(0, range.blockStart) + replacement + source.slice(range.blockEnd);

  if (range.start === range.end) {
    const firstLineIndent = direction === 'indent' ? 4 : Math.min(4, lines[0].match(/^ */)?.[0].length ?? 0);
    const cursor = Math.max(range.blockStart, Math.min(markdown.length, range.start + (direction === 'indent' ? firstLineIndent : -firstLineIndent)));
    return { markdown, selectionStart: cursor, selectionEnd: cursor };
  }
  return {
    markdown,
    selectionStart: range.blockStart,
    selectionEnd: range.blockStart + replacement.length,
  };
}

export function createColoredUnderlineOpeningTag(color: string): string {
  const safeColor = /^#[\da-f]{6}$/i.test(color) ? color.toUpperCase() : '#A98242';
  return `<u style="text-decoration-color: ${safeColor}; text-decoration-thickness: 1px;">`;
}

