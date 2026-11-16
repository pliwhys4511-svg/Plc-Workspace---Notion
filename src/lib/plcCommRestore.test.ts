import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorkspace } from './seedData';
import { planPlcCommRestore } from './plcCommRestore';

test('existing PLC Comm page is opened without changing content', () => {
  const ws = createSeedWorkspace();
  const result = planPlcCommRestore(ws);
  assert.equal(result.action, 'open');
  assert.equal(result.workspace, ws);
  assert.equal(result.page.id, 'page_plc_comm');
});

test('restore previously trashed PLC Comm without creating duplicate rows', () => {
  const ws = createSeedWorkspace();
  ws.pages = ws.pages.map((p) => p.id === 'page_plc_comm' ? { ...p, isTrashed: true } : p);
  const before = ws.pages.length;
  const result = planPlcCommRestore(ws);
  assert.equal(result.action, 'restore');
  assert.equal(result.workspace.pages.length, before);
  assert.equal(result.page.isTrashed, false);
  assert.equal(result.workspace.databases.db_plc_comm, ws.databases.db_plc_comm);
});

test('create missing PLC Comm page and preserve unrelated pages', () => {
  const ws = createSeedWorkspace();
  ws.pages = ws.pages.filter((p) => p.id !== 'page_plc_comm');
  delete ws.databases.db_plc_comm;
  delete ws.blocksByPage.page_plc_comm;
  const original = JSON.stringify(ws);
  const result = planPlcCommRestore(ws);
  assert.equal(result.action, 'create');
  assert.equal(result.page.title, 'PLC Comm');
  assert.equal(result.page.isDatabase, true);
  assert.equal(result.newDatabase?.columns.length, 9);
  assert.equal(result.workspace.databases.db_plc_comm?.rows.length, 0);
  assert.equal(result.workspace.pages.length, ws.pages.length + 1);
  assert.equal(JSON.stringify(ws), original);
});

test('reuse detached PLC Comm database without altering existing campaign rows', () => {
  const ws = createSeedWorkspace();
  ws.pages = ws.pages.filter((p) => p.id !== 'page_plc_comm');
  ws.databases.db_plc_comm.rows.push({
    id: 'row_sample',
    pageId: 'rowp_sample',
    databaseId: 'db_plc_comm',
    cells: { col_title: 'Existing Campaign' },
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const result = planPlcCommRestore(ws);
  assert.equal(result.action, 'create');
  assert.equal(result.newDatabase, undefined);
  assert.equal(result.workspace.databases.db_plc_comm.rows.length, 1);
  assert.equal(result.page.databaseId, 'db_plc_comm');
});

test('repair existing PLC Comm page when its database document is absent', () => {
  const ws = createSeedWorkspace();
  const originalPage = ws.pages.find((p) => p.id === 'page_plc_comm')!;
  ws.blocksByPage.page_plc_comm = [
    { id: 'blk_keep', pageId: 'page_plc_comm', type: 'paragraph', content: 'Existing notes', position: 0 },
  ];
  delete ws.databases.db_plc_comm;
  const outcome = planPlcCommRestore(ws);
  assert.equal(outcome.action, 'repair');
  assert.equal(outcome.page.id, originalPage.id);
  assert.equal(outcome.newDatabase?.id, 'db_plc_comm');
  assert.equal(outcome.workspace.pages.length, ws.pages.length);
  assert.equal(outcome.workspace.blocksByPage.page_plc_comm[0].content, 'Existing notes');
  assert.equal(ws.databases.db_plc_comm, undefined);
});

test('repair trashed PLC Comm page missing a database without duplicating pages', () => {
  const ws = createSeedWorkspace();
  const p = ws.pages.find((page) => page.id === 'page_plc_comm')!;
  p.isTrashed = true;
  delete ws.databases.db_plc_comm;
  const result = planPlcCommRestore(ws);
  assert.equal(result.action, 'repair');
  assert.equal(result.page.isTrashed, false);
  assert.equal(result.workspace.pages.filter((page) => page.id === 'page_plc_comm').length, 1);
});
