/**
 * Lightweight role chooser for the static GitHub Pages edition.
 *
 * SECURITY: This is a UX gate, NOT authorization. Values embedded in frontend
 * JavaScript (including PINs and sessionStorage) can be inspected or bypassed.
 * Real shared access requires Firebase Authentication plus server-enforced
 * roles and Firestore Security Rules.
 */
export const EDITOR_NAMES = ['Mala', 'Rafly', 'Maynard', 'Arif', 'Jasmin'] as const;

export type AccessRole = 'admin' | 'editor';
export type EditorName = (typeof EDITOR_NAMES)[number];
export interface WorkspaceAccess {
  role: AccessRole;
  displayName: string;
}

const SESSION_KEY = 'plc.workspace.access.session.v1';
// Shared PINs explicitly requested for the static, UI-only access gate.
const ADMIN_PIN = '4511';
const EDITOR_PIN = '1234';

export function checkWorkspacePin(
  role: AccessRole,
  pin: string,
  editorName?: string,
): WorkspaceAccess | null {
  if (role === 'admin' && pin === ADMIN_PIN) return { role: 'admin', displayName: 'Admin' };
  if (
    role === 'editor' &&
    pin === EDITOR_PIN &&
    EDITOR_NAMES.some((name) => name === editorName)
  ) return { role: 'editor', displayName: editorName! };
  return null;
}

export function loadWorkspaceAccess(): WorkspaceAccess | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (record.role === 'admin' && record.displayName === 'Admin') {
      return { role: 'admin', displayName: 'Admin' };
    }
    if (
      record.role === 'editor' &&
      EDITOR_NAMES.some((name) => name === record.displayName)
    ) {
      return { role: 'editor', displayName: record.displayName as EditorName };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWorkspaceAccess(access: WorkspaceAccess): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(access));
  } catch {
    // A missing session store just requires login again on refresh.
  }
}

export function clearWorkspaceAccess(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}
