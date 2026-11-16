import type { Database, Page, WorkspaceData } from './types';
import { createSeedWorkspace } from './seedData';
import { createId } from './workspaceOps';
import { isPlcCommPage } from './workspaceNavigation';

export interface PlcCommRestoreResult {
  workspace: WorkspaceData;
  page: Page;
  action: 'open' | 'restore' | 'create' | 'repair';
  newDatabase?: Database;
}

/**
 * Reopen an existing PLC Comm database page, restore it from Trash, or create it
 * explicitly when requested. Never migrate automatically: an absent page may
 * have been intentionally removed by the user.
 *
 * Existing database rows, content and custom columns are always preserved.
 */
export function planPlcCommRestore(workspace: WorkspaceData): PlcCommRestoreResult {
  const seed = createSeedWorkspace();
  const templatePage = seed.pages.find((page) => page.id === 'page_plc_comm');
  const templateDb = seed.databases.db_plc_comm;
  if (!templatePage || !templateDb) throw new Error('PLC Comm template is missing.');

  const existingPage = workspace.pages.find(isPlcCommPage);
  if (existingPage) {
    const linkedDb = existingPage.databaseId
      ? workspace.databases[existingPage.databaseId]
      : undefined;
    if (linkedDb) {
      if (!existingPage.isTrashed) {
        return { workspace, page: existingPage, action: 'open' };
      }
      const restored = { ...existingPage, isTrashed: false, updatedAt: new Date().toISOString() };
      return {
        workspace: {
          ...workspace,
          pages: workspace.pages.map((page) => page.id === existingPage.id ? restored : page),
        },
        page: restored,
        action: 'restore',
      };
    }

    // Older cloud/local snapshots may contain a PLC Comm page whose database
    // document is missing. Repair only its association; preserve page ID/content.
    const detachedDb = Object.values(workspace.databases).find((db) =>
      (db.id === 'db_plc_comm' || db.title.trim().toLocaleLowerCase('en') === 'plc comm') &&
      !workspace.pages.some((page) => page.databaseId === db.id),
    );
    const dbId = detachedDb?.id ?? existingPage.databaseId ??
      (workspace.databases.db_plc_comm ? createId('db') : 'db_plc_comm');
    const newDatabase = detachedDb ? undefined : {
      ...templateDb,
      id: dbId,
      rows: [],
      columns: templateDb.columns.map((column) => ({
        ...column,
        options: column.options?.map((option) => ({ ...option })),
      })),
    };
    const repaired = {
      ...existingPage,
      databaseId: dbId,
      isTrashed: false,
      updatedAt: new Date().toISOString(),
    };
    return {
      workspace: {
        ...workspace,
        pages: workspace.pages.map((page) => page.id === existingPage.id ? repaired : page),
        databases: newDatabase
          ? { ...workspace.databases, [dbId]: newDatabase }
          : workspace.databases,
      },
      page: repaired,
      action: 'repair',
      newDatabase,
    };
  }

  const unlinkedDb = Object.values(workspace.databases).find((db) =>
    (db.id === 'db_plc_comm' || db.title.trim().toLocaleLowerCase('en') === 'plc comm') &&
    !workspace.pages.some((page) => page.databaseId === db.id),
  );

  let newDatabase: Database | undefined;
  const dbId = unlinkedDb?.id ??
    (workspace.databases.db_plc_comm ? createId('db') : 'db_plc_comm');
  if (!unlinkedDb) {
    newDatabase = {
      ...templateDb,
      id: dbId,
      rows: [],
      columns: templateDb.columns.map((column) => ({
        ...column,
        options: column.options?.map((option) => ({ ...option })),
      })),
    };
  }

  const pageId = workspace.pages.some((page) => page.id === 'page_plc_comm')
    ? createId('page')
    : 'page_plc_comm';
  const now = new Date().toISOString();
  const page: Page = {
    ...templatePage,
    id: pageId,
    databaseId: dbId,
    createdAt: now,
    updatedAt: now,
    isTrashed: false,
    isFavorite: true,
    position: Math.max(0, ...workspace.pages.filter((p) => p.parentId === null).map((p) => p.position)) + 1,
  };
  return {
    workspace: {
      ...workspace,
      pages: [...workspace.pages, page],
      databases: newDatabase ? { ...workspace.databases, [dbId]: newDatabase } : workspace.databases,
      blocksByPage: { ...workspace.blocksByPage, [pageId]: [] },
    },
    page,
    action: 'create',
    newDatabase,
  };
}
