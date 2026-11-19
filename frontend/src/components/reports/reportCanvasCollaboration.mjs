import * as Y from 'yjs';

export function elementFieldsToPlainObject(fields) {
  return Object.fromEntries(Array.from(fields.entries(), ([key, value]) => [
    key,
    value instanceof Y.Text ? value.toString() : value,
  ]));
}

function applyTextEdit(sharedText, nextValue) {
  const currentValue = sharedText.toString();
  if (currentValue === nextValue) return;

  let prefix = 0;
  while (prefix < currentValue.length && prefix < nextValue.length
    && currentValue[prefix] === nextValue[prefix]) prefix += 1;

  let suffix = 0;
  while (suffix < currentValue.length - prefix && suffix < nextValue.length - prefix
    && currentValue[currentValue.length - suffix - 1] === nextValue[nextValue.length - suffix - 1]) suffix += 1;

  const deleteLength = currentValue.length - prefix - suffix;
  if (deleteLength) sharedText.delete(prefix, deleteLength);
  const insertion = nextValue.slice(prefix, nextValue.length - suffix);
  if (insertion) sharedText.insert(prefix, insertion);
}

/**
 * Merge one Excalidraw element snapshot into its Y.Map. Properties remain
 * independent CRDT values; text labels use Y.Text and a minimal edit so
 * concurrent insertions/deletions can be merged character by character.
 */
export function applyExcalidrawElementFields(fields, element) {
  for (const key of Array.from(fields.keys())) {
    if (!Object.prototype.hasOwnProperty.call(element, key)) fields.delete(key);
  }

  for (const [key, value] of Object.entries(element)) {
    if (key === 'text' && element.type === 'text' && typeof value === 'string') {
      let sharedText = fields.get('text');
      if (!(sharedText instanceof Y.Text)) {
        const previousText = typeof sharedText === 'string' ? sharedText : '';
        sharedText = new Y.Text();
        fields.set('text', sharedText);
        if (previousText) sharedText.insert(0, previousText);
      }
      applyTextEdit(sharedText, value);
      continue;
    }
    if (JSON.stringify(fields.get(key)) !== JSON.stringify(value)) fields.set(key, value);
  }
}
