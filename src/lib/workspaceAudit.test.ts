import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceStore } from '../../server/db';
import { createSeedWorkspace } from './seedData';
import {
  enqueueMutation, flushOutbox, loadOutbox, saveOutbox, setStaticHostMode,
  loadCachedWorkspace, saveCachedWorkspace,
} from './offlineSync';

class TestStorage {
  private items = new Map<string, string>();
  getItem(k: string) { return this.items.get(k) ?? null; }
  setItem(k: string, v: string) { this.items.set(k, v); }
  removeItem(k: string) { this.items.delete(k); }
  clear() { this.items.clear(); }
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new TestStorage() });

test('deleted sample pages do not reappear after loading cache', () => {
  const data = createSeedWorkspace();
  data.pages = data.pages.filter(p => p.id !== 'page_plc_comm');
  saveCachedWorkspace(data);
  assert.equal(loadCachedWorkspace()?.pages.some(p => p.id === 'page_plc_comm'), false);
});

test('offline patches keep order and adjacent PUT snapshots compact', () => {
  saveOutbox([]);
  enqueueMutation({ method: 'PATCH', url: '/api/pages/test', body: { title: 'One' } });
  enqueueMutation({ method: 'PATCH', url: '/api/pages/test', body: { icon: '⭐' } });
  enqueueMutation({ method: 'PUT', url: '/api/pages/test/blocks', body: { blocks: [1] } });
  enqueueMutation({ method: 'PUT', url: '/api/pages/test/blocks', body: { blocks: [2] } });
  assert.equal(loadOutbox().length, 3);
  assert.deepEqual(loadOutbox()[2].body, { blocks: [2] });
});

test('offline flush preserves edits appended while a request is in progress', async () => {
  setStaticHostMode(false);
  saveOutbox([]);
  enqueueMutation({ method: 'PATCH', url: '/api/pages/a', body: { title: 'A' } });
  const previous = globalThis.fetch;
  let notify!: () => void;
  let release!: () => void;
  const started = new Promise<void>(r => { notify = r; });
  const pending = new Promise<void>(r => { release = r; });
  let count = 0;
  globalThis.fetch = (async () => {
    if (++count === 1) { notify(); await pending; }
    return { ok: true, status: 200, headers: { get: () => 'application/json' } } as unknown as Response;
  }) as typeof fetch;
  try {
    const result = flushOutbox();
    await started;
    enqueueMutation({ method: 'PATCH', url: '/api/pages/b', body: { title: 'B' } });
    release();
    assert.equal(await result, 2);
    assert.equal(loadOutbox().length, 0);
  } finally {
    globalThis.fetch = previous;
    saveOutbox([]);
  }
});

test('failed request stays queued rather than being treated as synchronized', async () => {
  setStaticHostMode(false);
  saveOutbox([]);
  enqueueMutation({ method: 'DELETE', url: '/api/pages/a' });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({ ok: false, status: 403, headers: { get: () => 'application/json' } } as unknown as Response)
  ) as typeof fetch;
  try {
    assert.equal(await flushOutbox(), 0);
    assert.equal(loadOutbox().length, 1);
  } finally {
    globalThis.fetch = previous;
    saveOutbox([]);
  }
});

test('session revoked on passcode update and row pages removed with database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plc-regression-'));
  try {
    const store = new WorkspaceStore(dir);
    assert.equal(store.setPassword('first-secret').ok, true);
    const session = store.createSession();
    assert.equal(store.hasSession(session), true);
    assert.equal(store.setPassword('second-secret', 'first-secret').ok, true);
    assert.equal(store.hasSession(session), false);
    const initial = store.getWorkspaceData();
    const database = initial.databases['db_plc_comm'];
    if (database) {
      const rowPageIds = database.rows.map(row => row.pageId);
      store.deletePagePermanently('page_plc_comm');
      const remaining = store.getWorkspaceData();
      for (const id of rowPageIds) assert.equal(remaining.pages.some(p => p.id === id), false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
