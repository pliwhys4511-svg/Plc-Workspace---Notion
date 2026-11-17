import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorkspace } from './seedData';
import { readFileSync } from 'node:fs';
import { buildPageTree } from './workspaceOps';
import { planHighImpactTracker } from './highImpactTracker';
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

test('PLC Comm and High Impact are root-level nodes rendered by the same sidebar tree', () => {
  const ws = planHighImpactTracker(createSeedWorkspace()).workspace;
  const root = buildPageTree(ws.pages, null);
  assert.ok(root.some(node => node.page.id === 'page_plc_comm'));
  assert.ok(root.some(node => node.page.id === 'page_high_impact_elearning_2026'));
  const sidebar = readFileSync(new URL('../components/Sidebar.tsx', import.meta.url), 'utf8');
  assert.match(sidebar, /buildPageTree\(pages, null\)/);
  assert.match(sidebar, /\{!plcCommPage && \(/);
  assert.match(sidebar, /tree\.map\(\(node\) => renderTreeNode\(node, 0\)\)/);
});
