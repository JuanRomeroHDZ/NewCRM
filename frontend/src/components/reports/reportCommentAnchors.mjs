import * as Y from 'yjs';

function encodeBytes(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function decodeBytes(value) {
  if (typeof value !== 'string' || value.length > 256) return null;
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function createTypstRangeAnchor(sharedText, from, to) {
  if (!sharedText || from >= to || from < 0 || to > sharedText.length) return null;
  return JSON.stringify({
    version: 1,
    kind: 'typst-range',
    start: encodeBytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(sharedText, from))),
    end: encodeBytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(sharedText, to))),
  });
}

export function resolveTypstRangeAnchor(anchor, document, sharedText) {
  if (typeof anchor !== 'string' || anchor.length > 1024 || !document || !sharedText) return null;
  let parsed;
  try {
    parsed = JSON.parse(anchor);
  } catch {
    return null;
  }
  if (parsed?.version !== 1 || parsed?.kind !== 'typst-range') return null;
  const startBytes = decodeBytes(parsed.start);
  const endBytes = decodeBytes(parsed.end);
  if (!startBytes || !endBytes) return null;

  try {
    const start = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(startBytes), document);
    const end = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(endBytes), document);
    if (!start || !end || start.type !== sharedText || end.type !== sharedText) return null;
    if (start.index < 0 || end.index < 0 || start.index > sharedText.length || end.index > sharedText.length) return null;
    if (start.index === end.index) return null;
    return { from: Math.min(start.index, end.index), to: Math.max(start.index, end.index) };
  } catch {
    return null;
  }
}
