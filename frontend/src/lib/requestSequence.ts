/** Tracks the newest asynchronous request so stale responses can be ignored. */
export function createRequestSequence() {
  let current = 0;

  return {
    next: () => ++current,
    invalidate: () => { current += 1; },
    isCurrent: (request: number) => request === current,
  };
}
