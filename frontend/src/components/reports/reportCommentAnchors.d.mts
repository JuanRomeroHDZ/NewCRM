import type * as Y from 'yjs';

export function createTypstRangeAnchor(sharedText: Y.Text, from: number, to: number): string | null;
export function resolveTypstRangeAnchor(
  anchor: string,
  document: Y.Doc,
  sharedText: Y.Text,
): { from: number; to: number } | null;
