import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';

const owner = 'owner_123456789';
const editor = 'editor_123456789';
const stranger = 'stranger_123456789';
const rules = fs.readFileSync('firestore.rules', 'utf8');
let env;

const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const stamp = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
    await setDoc(doc(db, 'users', owner), {
      uid: owner, displayName: 'Workspace Admin', createdAt: stamp, updatedAt: stamp,
    });
    await setDoc(doc(db, 'users', owner, 'meta', 'settings'), {
      ownerId: owner, name: 'PLC Workspace', icon: '📚', theme: 'light', updatedAt: stamp,
    });
    await setDoc(doc(db, 'users', owner, 'pages', 'page_one'), {
      ownerId: owner, id: 'page_one', title: 'Existing Notes', icon: '📄',
      font: 'sans', smallText: false, fullWidth: false, isFavorite: false,
      isTrashed: false, isDatabase: false, locked: false, position: 0,
      createdAt: stamp, updatedAt: stamp,
    });
  });
};

test('Firestore rules enforce owner-approved shared workspace access', async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'demo-plc-shared-workspace',
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });
  const auth = (uid) => env.authenticatedContext(uid, {
    email_verified: true, email: uid + '@example.invalid',
  }).firestore();

  try {
    await t.test('anonymous and unapproved identities cannot read owner data', async () => {
      await seed();
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', owner, 'pages', 'page_one')));
      await assertFails(getDoc(doc(auth(stranger), 'users', owner, 'pages', 'page_one')));
    });

    await t.test('verified Editor can request access without self-approval', async () => {
      await seed();
      const ownerDb = auth(owner);
      const editorDb = auth(editor);
      await assertSucceeds(setDoc(doc(editorDb, 'users', owner, 'joinRequests', editor), {
        uid: editor, name: 'Rafly', email: editor + '@example.invalid',
        createdAt: serverTimestamp(),
      }));
      await assertSucceeds(getDoc(doc(editorDb, 'users', owner, 'joinRequests', editor)));
      await assertFails(getDocs(collection(editorDb, 'users', owner, 'joinRequests')));
      await assertSucceeds(getDocs(collection(ownerDb, 'users', owner, 'joinRequests')));
    });

    await t.test('owner can create Editor membership; Editor cannot self-approve', async () => {
      await seed();
      const ownerDb = auth(owner);
      const editorDb = auth(editor);
      const memberRef = doc(ownerDb, 'users', owner, 'members', editor);
      await assertFails(setDoc(doc(editorDb, 'users', owner, 'members', editor), {
        uid: editor, name: 'Rafly', email: editor + '@example.invalid',
        role: 'editor', createdAt: serverTimestamp(),
      }));
      await assertSucceeds(setDoc(memberRef, {
        uid: editor, name: 'Rafly', email: editor + '@example.invalid',
        role: 'editor', createdAt: serverTimestamp(),
      }));
      assert.equal((await getDoc(doc(editorDb, 'users', owner, 'members', editor))).data()?.role, 'editor');
    });

    await t.test('approved Editor reads and edits owner content, but not settings or membership', async () => {
      await seed();
      const ownerDb = auth(owner);
      const editorDb = auth(editor);
      const outsiderDb = auth(stranger);
      await assertSucceeds(setDoc(doc(ownerDb, 'users', owner, 'members', editor), {
        uid: editor, name: 'Rafly', email: editor + '@example.invalid',
        role: 'editor', createdAt: serverTimestamp(),
      }));
      await assertSucceeds(getDoc(doc(editorDb, 'users', owner, 'pages', 'page_one')));
      await assertSucceeds(getDocs(query(
        collection(editorDb, 'users', owner, 'pages'),
        where('ownerId', '==', owner),
      )));
      await assertFails(getDocs(collection(editorDb, 'users', owner, 'pages')));
      await assertFails(getDoc(doc(outsiderDb, 'users', owner, 'pages', 'page_one')));
      await assertSucceeds(updateDoc(doc(editorDb, 'users', owner, 'pages', 'page_one'), {
        title: 'Updated by Rafly', updatedAt: serverTimestamp(),
      }));
      await assertFails(updateDoc(doc(editorDb, 'users', owner, 'meta', 'settings'), {
        name: 'Unapproved rename', updatedAt: serverTimestamp(),
      }));
      await assertFails(deleteDoc(doc(editorDb, 'users', owner, 'pages', 'page_one')));
      await assertFails(deleteDoc(doc(editorDb, 'users', owner, 'members', editor)));
    });

    await t.test('revoking an Editor immediately blocks owner data access', async () => {
      await seed();
      const ownerDb = auth(owner);
      const editorDb = auth(editor);
      await assertSucceeds(setDoc(doc(ownerDb, 'users', owner, 'members', editor), {
        uid: editor, name: 'Rafly', email: editor + '@example.invalid',
        role: 'editor', createdAt: serverTimestamp(),
      }));
      await assertSucceeds(getDoc(doc(editorDb, 'users', owner, 'pages', 'page_one')));
      await assertSucceeds(deleteDoc(doc(ownerDb, 'users', owner, 'members', editor)));
      await assertFails(getDoc(doc(editorDb, 'users', owner, 'pages', 'page_one')));
    });
  } finally {
    await env.cleanup();
  }
});
