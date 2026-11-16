import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkspacePin, EDITOR_NAMES, loadWorkspaceAccess, saveWorkspaceAccess, clearWorkspaceAccess } from './accessTier';

test('admin tier requires the correct PIN', () => {
  assert.deepEqual(checkWorkspacePin('admin', '4511'), { role: 'admin', displayName: 'Admin' });
  assert.equal(checkWorkspacePin('admin', '1234'), null);
  assert.equal(checkWorkspacePin('admin', ''), null);
});
test('editor tier requires a listed editor and the editor PIN', () => {
  for (const name of EDITOR_NAMES) {
    assert.deepEqual(checkWorkspacePin('editor', '1234', name), { role: 'editor', displayName: name });
  }
  assert.equal(checkWorkspacePin('editor', '4511', 'Mala'), null);
  assert.equal(checkWorkspacePin('editor', '1234'), null);
  assert.equal(checkWorkspacePin('editor', '1234', 'Anonymous'), null);
});
test('role choice persists across visits and can be cleared', () => {
  const state = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    setItem(k: string, v: string) { state.set(k, v); },
    getItem(k: string) { return state.get(k) ?? null; },
    removeItem(k: string) { state.delete(k); },
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem(k: string, v: string) { state.set(k, v); },
    getItem(k: string) { return state.get(k) ?? null; },
    removeItem(k: string) { state.delete(k); },
  } });
  saveWorkspaceAccess({ role: 'editor', displayName: 'Rafly' });
  assert.deepEqual(loadWorkspaceAccess(), { role: 'editor', displayName: 'Rafly' });
  clearWorkspaceAccess();
  assert.equal(loadWorkspaceAccess(), null);
  state.set('plc.workspace.access.session.v1', '{"role":"admin","displayName":"Hacker"}');
  assert.equal(loadWorkspaceAccess(), null);
});
