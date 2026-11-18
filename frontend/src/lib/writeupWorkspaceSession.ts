const key = 'lessso.writeup.workspace';
const modes = ['markdown', 'whiteboard', 'dual', 'findings', 'assets'] as const;

export type WorkspaceMode = typeof modes[number];

export interface WriteupWorkspace {
  reportId: string;
  boardId: string | null;
  mode: WorkspaceMode;
}

export function readWriteupWorkspace(): WriteupWorkspace | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && typeof value.reportId === 'string' && value.reportId &&
        (value.boardId === null || typeof value.boardId === 'string') && modes.includes(value.mode)) {
      return { reportId: value.reportId, boardId: value.boardId, mode: value.mode };
    }
  } catch { /* El informe sigue disponible cuando el almacenamiento falla. */ }
  return null;
}

export function rememberWriteupWorkspace(value: WriteupWorkspace | null) {
  try {
    if (!value) {
      sessionStorage.removeItem(key);
      return;
    }
    const { reportId, boardId, mode } = value;
    sessionStorage.setItem(key, JSON.stringify({ reportId, boardId, mode }));
  } catch { /* La selección de esta sesión sigue funcionando en memoria. */ }
}
