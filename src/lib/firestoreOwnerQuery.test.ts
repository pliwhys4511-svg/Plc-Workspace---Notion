import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./firestoreStore.ts', import.meta.url), 'utf8');

test('all cloud workspace snapshot collection subscriptions filter by ownerId', () => {
  assert.match(source, /function ownedCollection\(uid: string, name: string\)/);
  assert.match(source, /where\('ownerId', '==', uid\)/);
  for (const name of ['pages', 'blocks', 'databases', 'dbRows', 'comments']) {
    assert.ok(
      source.includes(`ownedCollection(uid, '${name}'),\n    (snap) => {`),
      `${name} subscription must use the owner-scoped query`,
    );
  }
});

test('bulk backup and deletion operations do not list unfiltered collections', () => {
  assert.match(source, /getDocs\(ownedCollection\(uid, colName\)\)/);
  assert.doesNotMatch(source, /getDocs\(collection\(db, 'users', uid, colName\)\)/);
  assert.doesNotMatch(source, /query\(collection\(db, 'users', uid, '(blocks|comments)'\), where\('pageId'/);
});

test('cloud block and comment deletion is restricted to the intended pages', () => {
  assert.match(source, /docSnap\.data\(\)\.pageId === safePageId && !keepIds\.has/);
  assert.match(source, /deleting\.has\(String\(d\.data\(\)\.pageId \?\? ''\)\)/);
});

test('Firestore snapshot listener errors are reported rather than thrown asynchronously', () => {
  const handler = source.slice(
    source.indexOf('const handleSubError ='),
    source.indexOf('const unsubSettings ='),
  );
  assert.match(handler, /onError\?\.\(friendly\)/);
  assert.doesNotMatch(handler, /throw |handleFirestoreError\(/);
});
