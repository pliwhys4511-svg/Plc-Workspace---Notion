import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoResumeCloud } from './cloudReconnect';

test('verified admin with a saved Firebase Auth session reconnects automatically', () => {
  assert.equal(shouldAutoResumeCloud('admin', true, false), true);
});
test('do not silently open Firestore without authenticated/verified Google session', () => {
  assert.equal(shouldAutoResumeCloud('admin', false, false), false);
});
test('explicit mode lokal choice prevents further automatic reconnection', () => {
  assert.equal(shouldAutoResumeCloud('admin', true, true), false);
});
test('editor PIN does not grant access to the owner Firestore database', () => {
  assert.equal(shouldAutoResumeCloud('editor', true, false), false);
});
