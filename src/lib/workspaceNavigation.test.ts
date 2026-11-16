import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorkspace } from './seedData';
import {
  findVisiblePlcCommPage,
  isPlcCommPage,
  otherWorkspacePages,
} from './workspaceNavigation';

test('PLC Comm appears as a dedicated root navigation item, not a quick action', () => {
  const ws = createSeedWorkspace();
  const page = findVisiblePlcCommPage(ws.pages);
  assert.equal(page?.title, 'PLC Comm');
  assert.equal(page?.parentId, null);
  assert.ok(page && isPlcCommPage(page));
  assert.equal(otherWorkspacePages(ws.pages).some(isPlcCommPage), false);
});

test('old workspaces without PLC Comm still support a virtual entry', () => {
  const ws = createSeedWorkspace();
  ws.pages = ws.pages.filter((p) => p.id !== 'page_plc_comm');
  assert.equal(findVisiblePlcCommPage(ws.pages), undefined);
  assert.deepEqual(otherWorkspacePages(ws.pages), ws.pages);
});

test('renamed tracker page with canonical database ID is recognized', () => {
  const ws = createSeedWorkspace();
  const tracked = ws.pages.find((p) => p.id === 'page_plc_comm')!;
  tracked.id = 'page_other';
  tracked.title = 'Campaign Records';
  assert.ok(isPlcCommPage(tracked));
});

test('trashed PLC Comm is not the active entry but is excluded from normal tree', () => {
  const ws = createSeedWorkspace();
  const page = ws.pages.find((p) => p.id === 'page_plc_comm')!;
  page.isTrashed = true;
  assert.equal(findVisiblePlcCommPage(ws.pages), undefined);
  assert.equal(otherWorkspacePages(ws.pages).some(isPlcCommPage), false);
});
