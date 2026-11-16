import type { Database, Page, WorkspaceData } from './types';
import { createSeedWorkspace } from './seedData';
import { createId } from './workspaceOps';

export interface PlcCommRestoreResult {
  workspace: WorkspaceData;
  page: Page;
  action: 'open' | 'restore' | 'create';
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
  const existingPage = workspace.pages.find((page) => {
    const db = page.databaseId ? workspace.databases[page.databaseId] : null;
    return page.isDatabase && Boolean(db) &&
      (page.title.trim().toLocaleLowerCase('en') === 'plc comm' ||
       page.databaseId === 'db_plc_comm' ||
       db?.title.trim().toLocaleLowerCase('en') === 'plc comm');
  });
  if (existingPage) {
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

  const unlinkedDb = Object.values(workspace.databases).find((db) =>
    (db.id === 'db_plc_comm' || db.title.trim().toLocaleLowerCase('en') === 'plc comm') &&
    !workspace.pages.some((page) => page.databaseId === db.id),
  );

  const seed = createSeedWorkspace();
  const templatePage = seed.pages.find((page) => page.id === 'page_plc_comm');
  const templateDb = seed.databases.db_plc_comm;
  if (!templatePage || !templateDb) throw new Error('PLC Comm template is missing.');

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
