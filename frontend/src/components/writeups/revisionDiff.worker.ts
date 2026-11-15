import { computeLineDiff, type DiffLine } from './pentestUtils';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ oldText: string; newText: string }>) => void) | null;
  postMessage: (result: DiffLine[]) => void;
};
workerScope.onmessage = (event) => {
  workerScope.postMessage(computeLineDiff(event.data.oldText, event.data.newText));
};
