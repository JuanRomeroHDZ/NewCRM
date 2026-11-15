/** User-authored labels use a fixed palette and never accept CSS or HTML. */
const LABEL_OR_CODE = /(```[\s\S]*?```|`[^`\n]*`)|\{etiqueta:(jade|rojo|azul|dorado|neutro):(pequena|normal|grande):([^{}\n]{1,120})\}/g;

export function renderWriteupLabels(markdown: string): string {
  return markdown.replace(LABEL_OR_CODE, (match, code: string | undefined, color: string, size: string, label: string) => {
    if (code) return code;
    const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `<span class="writeup-label writeup-label-${color} writeup-label-${size}">${safe}</span>`;
  });
}
