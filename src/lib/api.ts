import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseViewType,
  Page,
  PageComment,
  ThemeMode,
  WorkspaceData,
  WorkspaceSettings,
} from './types';
import {
  enqueueMutation,
  isStaticHostMode,
  loadCachedWorkspace,
  saveOutbox,
  setStaticHostMode,
} from './offlineSync';
import { createSeedWorkspace } from './seedData';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';

  if (res.status === 404 || (res.ok && !contentType.includes('application/json'))) {
    throw new Error('STATIC_HOST_NO_API');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const errBody = await res.json();
        if (errBody?.error) message = errBody.error;
      } catch {
        // ignore parse failure
      }
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

async function mutateWithOfflineQueue<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<{ synced: boolean; data?: T }> {
  if (isStaticHostMode()) {
    return { synced: false };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueMutation({ url, method, body });
    return { synced: false };
  }
  try {
    const data = await requestJson<T>(url, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { synced: true, data };
  } catch (err) {
    if (err instanceof Error && err.message === 'STATIC_HOST_NO_API') {
      setStaticHostMode(true);
      saveOutbox([]);
      return { synced: false };
    }
    // Queue on network errors (TypeError from fetch), rethrow HTTP 4xx errors
    if (err instanceof TypeError) {
      enqueueMutation({ url, method, body });
      return { synced: false };
    }
    throw err;
  }
}

export interface BootstrapResponse {
  locked: boolean;
  settings?: WorkspaceSettings;
  workspace?: WorkspaceData;
  staticMode?: boolean;
}

export const api = {
  async getWorkspace(): Promise<BootstrapResponse> {
    try {
      const data = await requestJson<BootstrapResponse>('/api/workspace');
      setStaticHostMode(false);
      return data;
    } catch (err) {
      if (err instanceof Error && err.message === 'STATIC_HOST_NO_API') {
        setStaticHostMode(true);
        saveOutbox([]);
        return {
          locked: false,
          staticMode: true,
          workspace: loadCachedWorkspace() ?? createSeedWorkspace(),
        };
      }
      if (err instanceof TypeError) {
        const cached = loadCachedWorkspace();
        if (cached) {
          return { locked: false, workspace: cached };
        }
        if (
          typeof window !== 'undefined' &&
          (window.location.hostname.endsWith('github.io') ||
            window.location.protocol === 'file:')
        ) {
          setStaticHostMode(true);
          saveOutbox([]);
          return {
            locked: false,
            staticMode: true,
            workspace: createSeedWorkspace(),
          };
        }
      }
      throw err;
    }
  },

  login(password: string): Promise<{ ok: boolean; workspace: WorkspaceData }> {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return requestJson('/api/auth/logout', { method: 'POST' });
  },

  setPasscode(
    newPassword: string,
    currentPassword?: string,
  ): Promise<{ ok: boolean; settings: WorkspaceSettings }> {
    return requestJson('/api/auth/passcode', {
      method: 'POST',
      body: JSON.stringify({ newPassword, currentPassword }),
    });
  },

  updateSettings(
    patch: Partial<{ name: string; icon: string; theme: ThemeMode }>,
  ) {
    return mutateWithOfflineQueue<{ settings: WorkspaceSettings }>(
      '/api/workspace/settings',
      'PATCH',
      patch,
    );
  },

  createPage(input: {
    parentId?: string | null;
    title?: string;
    icon?: string;
    isDatabase?: boolean;
    cover?: string | null;
    blocks?: Array<Partial<Block>>;
  }) {
    return mutateWithOfflineQueue<{ page: Page; blocks: Block[]; database?: Database }>(
      '/api/pages',
      'POST',
      input,
    );
  },

  updatePage(id: string, patch: Partial<Page>) {
    return mutateWithOfflineQueue<{ page: Page }>(
      `/api/pages/${encodeURIComponent(id)}`,
      'PATCH',
      patch,
    );
  },

  duplicatePage(id: string) {
    return mutateWithOfflineQueue<{ page: Page; blocks: Block[] }>(
      `/api/pages/${encodeURIComponent(id)}/duplicate`,
      'POST',
    );
  },

  deletePagePermanently(id: string) {
    return mutateWithOfflineQueue<{ deletedIds: string[] }>(
      `/api/pages/${encodeURIComponent(id)}`,
      'DELETE',
    );
  },

  savePageBlocks(pageId: string, blocks: Block[]) {
    return mutateWithOfflineQueue<{ blocks: Block[]; createdDatabases: Database[] }>(
      `/api/pages/${encodeURIComponent(pageId)}/blocks`,
      'PUT',
      { blocks },
    );
  },

  addComment(pageId: string, text: string, author = 'Workspace Member') {
    return mutateWithOfflineQueue<{ comment: PageComment }>(
      `/api/pages/${encodeURIComponent(pageId)}/comments`,
      'POST',
      { text, author },
    );
  },

  updateComment(id: string, patch: { resolved?: boolean; text?: string }) {
    return mutateWithOfflineQueue<{ comment: PageComment }>(
      `/api/comments/${encodeURIComponent(id)}`,
      'PATCH',
      patch,
    );
  },

  deleteComment(id: string) {
    return mutateWithOfflineQueue<{ ok: boolean }>(
      `/api/comments/${encodeURIComponent(id)}`,
      'DELETE',
    );
  },

  updateDatabase(
    id: string,
    patch: Partial<{
      title: string;
      icon: string;
      activeView: DatabaseViewType;
      groupByColumnId: string;
      columns: DatabaseColumn[];
    }>,
  ) {
    return mutateWithOfflineQueue<{ database: Database }>(
      `/api/databases/${encodeURIComponent(id)}`,
      'PATCH',
      patch,
    );
  },

  addDatabaseRow(
    databaseId: string,
    cells: Record<string, DatabaseCellValue> = {},
  ) {
    return mutateWithOfflineQueue<{ row: DatabaseRow; rowPage: Page }>(
      `/api/databases/${encodeURIComponent(databaseId)}/rows`,
      'POST',
      { cells },
    );
  },

  updateDatabaseRow(
    databaseId: string,
    rowId: string,
    cells: Record<string, DatabaseCellValue>,
  ) {
    return mutateWithOfflineQueue<{ row: DatabaseRow }>(
      `/api/databases/${encodeURIComponent(databaseId)}/rows/${encodeURIComponent(rowId)}`,
      'PATCH',
      { cells },
    );
  },

  deleteDatabaseRow(databaseId: string, rowId: string) {
    return mutateWithOfflineQueue<{ ok: boolean }>(
      `/api/databases/${encodeURIComponent(databaseId)}/rows/${encodeURIComponent(rowId)}`,
      'DELETE',
    );
  },

  async importWorkspace(
    data: WorkspaceData,
  ): Promise<{ ok: boolean; workspace: WorkspaceData }> {
    if (isStaticHostMode()) {
      return { ok: true, workspace: data };
    }
    return requestJson('/api/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
