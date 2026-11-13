import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  clampNumber,
  clampString,
  deserializeTableRows,
  ensureValidFirestoreId,
  sanitizeBlockForCloud,
  sanitizeCellsForCloud,
  sanitizeColumnsForCloud,
  sanitizeCommentForCloud,
  sanitizeDatabaseForCloud,
  sanitizePageForCloud,
  sanitizeRowForCloud,
  sanitizeSettingsForCloud,
  stripUndefined,
  timestampToIso,
  type FirestoreTableRow,
} from './firestoreSerializer';
import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseViewType,
  Page,
  PageComment,
  ThemeMode,
  WorkspaceData,
} from './types';
import { createSeedWorkspace } from './seedData';

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutGoogle() {
  return signOut(auth);
}

export async function ensureUserRoot(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    const displayName = clampString(user.displayName || 'Workspace Member', 120) || 'Workspace Member';
    const photoURL = user.photoURL ? clampString(user.photoURL, 512) : undefined;
    if (!snap.exists()) {
      await setDoc(
        userRef,
        stripUndefined({
          uid: user.uid,
          displayName,
          photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } else {
      await updateDoc(
        userRef,
        stripUndefined({
          displayName,
          photoURL,
          updatedAt: serverTimestamp(),
        }),
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function commitOperationsInBatches(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
): Promise<void> {
  const CHUNK_SIZE = 380;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + CHUNK_SIZE);
    for (const apply of slice) apply(batch);
    await batch.commit();
  }
}

export async function writeWorkspaceToCloud(
  uid: string,
  workspace: WorkspaceData,
): Promise<void> {
  const settingsRef = doc(db, 'users', uid, 'meta', 'settings');
  const stage1Ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const stage2Ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  stage1Ops.push((batch) => {
    batch.set(settingsRef, sanitizeSettingsForCloud(uid, workspace.settings, serverTimestamp()));
  });

  for (const page of workspace.pages) {
    const pageRef = doc(db, 'users', uid, 'pages', ensureValidFirestoreId(page.id, 'page'));
    stage1Ops.push((batch) => {
      batch.set(
        pageRef,
        sanitizePageForCloud(uid, page, serverTimestamp(), serverTimestamp()),
      );
    });
  }

  for (const database of Object.values(workspace.databases)) {
    const dbRef = doc(db, 'users', uid, 'databases', ensureValidFirestoreId(database.id, 'db'));
    stage1Ops.push((batch) => {
      batch.set(dbRef, sanitizeDatabaseForCloud(uid, database, serverTimestamp()));
    });
    for (const row of database.rows) {
      const rowRef = doc(db, 'users', uid, 'dbRows', ensureValidFirestoreId(row.id, 'row'));
      stage2Ops.push((batch) => {
        batch.set(
          rowRef,
          sanitizeRowForCloud(uid, row, serverTimestamp(), serverTimestamp()),
        );
      });
    }
  }

  for (const blocks of Object.values(workspace.blocksByPage)) {
    for (const block of blocks) {
      const blkRef = doc(db, 'users', uid, 'blocks', ensureValidFirestoreId(block.id, 'blk'));
      stage2Ops.push((batch) => {
        batch.set(blkRef, sanitizeBlockForCloud(uid, block, serverTimestamp()));
      });
    }
  }

  for (const comments of Object.values(workspace.commentsByPage ?? {})) {
    for (const comment of comments) {
      const cmtRef = doc(db, 'users', uid, 'comments', ensureValidFirestoreId(comment.id, 'cmt'));
      stage2Ops.push((batch) => {
        batch.set(
          cmtRef,
          sanitizeCommentForCloud(uid, comment, serverTimestamp(), serverTimestamp()),
        );
      });
    }
  }

  try {
    await commitOperationsInBatches(stage1Ops);
    await commitOperationsInBatches(stage2Ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function seedOrEnsureCloudWorkspace(
  user: User,
  fallbackWorkspace?: WorkspaceData | null,
): Promise<void> {
  await ensureUserRoot(user);
  const settingsPath = `users/${user.uid}/meta/settings`;
  try {
    const settingsSnap = await getDoc(doc(db, 'users', user.uid, 'meta', 'settings'));
    if (!settingsSnap.exists()) {
      const source = fallbackWorkspace ?? createSeedWorkspace();
      await writeWorkspaceToCloud(user.uid, source);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, settingsPath);
  }
}

export async function cloudReplaceWorkspace(
  uid: string,
  workspace: WorkspaceData,
): Promise<void> {
  const subcollections = ['comments', 'blocks', 'dbRows', 'databases', 'pages'] as const;
  const deleteOps: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

  for (const colName of subcollections) {
    const colPath = `users/${uid}/${colName}`;
    try {
      const snap = await getDocs(collection(db, 'users', uid, colName));
      snap.forEach((docSnap) => {
        deleteOps.push((batch) => batch.delete(docSnap.ref));
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colPath);
    }
  }

  try {
    await commitOperationsInBatches(deleteOps);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
  }

  await writeWorkspaceToCloud(uid, workspace);
}

export function subscribeCloudWorkspace(
  uid: string,
  onData: (workspace: WorkspaceData) => void,
  onError?: (error: Error) => void,
): () => void {
  let settingsDoc: { name: string; icon: string; theme: ThemeMode } | null = null;
  let pagesList: Page[] | null = null;
  let blocksList: Block[] | null = null;
  let dbsList: Array<Omit<Database, 'rows'>> | null = null;
  let rowsList: DatabaseRow[] | null = null;
  let commentsList: PageComment[] | null = null;

  const emitIfReady = () => {
    if (
      !settingsDoc ||
      !pagesList ||
      !blocksList ||
      !dbsList ||
      !rowsList ||
      !commentsList
    ) {
      return;
    }

    const blocksByPage: Record<string, Block[]> = {};
    for (const blk of blocksList) {
      if (!blocksByPage[blk.pageId]) blocksByPage[blk.pageId] = [];
      blocksByPage[blk.pageId].push(blk);
    }
    for (const list of Object.values(blocksByPage)) {
      list.sort((a, b) => a.position - b.position);
    }

    const databases: Record<string, Database> = {};
    for (const dbItem of dbsList) {
      databases[dbItem.id] = { ...dbItem, rows: [] };
    }
    for (const row of rowsList) {
      if (databases[row.databaseId]) {
        databases[row.databaseId].rows.push(row);
      }
    }
    for (const dbItem of Object.values(databases)) {
      dbItem.rows.sort((a, b) => a.position - b.position);
    }

    const commentsByPage: Record<string, PageComment[]> = {};
    for (const c of commentsList) {
      if (!commentsByPage[c.pageId]) commentsByPage[c.pageId] = [];
      commentsByPage[c.pageId].push(c);
    }
    for (const list of Object.values(commentsByPage)) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    const sortedPages = [...pagesList].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    );

    onData({
      settings: {
        name: settingsDoc.name,
        icon: settingsDoc.icon,
        theme: settingsDoc.theme,
        passwordProtected: false,
      },
      pages: sortedPages,
      blocksByPage,
      databases,
      commentsByPage,
    });
  };

  const handleSubError = (path: string, err: unknown) => {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    onError?.(wrapped);
    handleFirestoreError(err, OperationType.GET, path);
  };

  const unsubSettings = onSnapshot(
    doc(db, 'users', uid, 'meta', 'settings'),
    (snap) => {
      const data = snap.data();
      if (data) {
        settingsDoc = {
          name: String(data.name || 'PLC Workspace'),
          icon: String(data.icon || '📐'),
          theme: data.theme === 'dark' ? 'dark' : 'light',
        };
        emitIfReady();
      }
    },
    (err) => handleSubError(`users/${uid}/meta/settings`, err),
  );

  const unsubPages = onSnapshot(
    collection(db, 'users', uid, 'pages'),
    (snap) => {
      pagesList = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: String(raw.id ?? d.id),
          parentId: raw.parentId ? String(raw.parentId) : null,
          title: String(raw.title ?? 'Untitled'),
          icon: String(raw.icon ?? '📄'),
          cover: raw.cover ? String(raw.cover) : null,
          coverPosition: Number(raw.coverPosition ?? 50),
          font: raw.font === 'serif' || raw.font === 'mono' ? raw.font : 'sans',
          smallText: Boolean(raw.smallText),
          fullWidth: Boolean(raw.fullWidth),
          isFavorite: Boolean(raw.isFavorite),
          isTrashed: Boolean(raw.isTrashed),
          isDatabase: Boolean(raw.isDatabase),
          databaseId: raw.databaseId ? String(raw.databaseId) : null,
          isRowPage: Boolean(raw.isRowPage),
          locked: Boolean(raw.locked),
          position: Number(raw.position ?? 0),
          createdAt: timestampToIso(raw.createdAt),
          updatedAt: timestampToIso(raw.updatedAt),
        } satisfies Page;
      });
      emitIfReady();
    },
    (err) => handleSubError(`users/${uid}/pages`, err),
  );

  const unsubBlocks = onSnapshot(
    collection(db, 'users', uid, 'blocks'),
    (snap) => {
      blocksList = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: String(raw.id ?? d.id),
          pageId: String(raw.pageId ?? ''),
          type: raw.type as Block['type'],
          content: String(raw.content ?? ''),
          checked: raw.checked !== undefined ? Boolean(raw.checked) : undefined,
          open: raw.open !== undefined ? Boolean(raw.open) : undefined,
          details: raw.details !== undefined ? String(raw.details) : undefined,
          icon: raw.icon !== undefined ? String(raw.icon) : undefined,
          language: raw.language !== undefined ? String(raw.language) : undefined,
          color: raw.color as Block['color'] | undefined,
          indent: raw.indent !== undefined ? Number(raw.indent) : undefined,
          rows: deserializeTableRows(raw.tableRows as FirestoreTableRow[] | undefined),
          hasHeaderRow: raw.hasHeaderRow !== undefined ? Boolean(raw.hasHeaderRow) : undefined,
          url: raw.url !== undefined ? String(raw.url) : undefined,
          caption: raw.caption !== undefined ? String(raw.caption) : undefined,
          databaseId: raw.databaseId ? String(raw.databaseId) : undefined,
          targetPageId: raw.targetPageId ? String(raw.targetPageId) : undefined,
          position: Number(raw.position ?? 0),
        } satisfies Block;
      });
      emitIfReady();
    },
    (err) => handleSubError(`users/${uid}/blocks`, err),
  );

  const unsubDatabases = onSnapshot(
    collection(db, 'users', uid, 'databases'),
    (snap) => {
      dbsList = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: String(raw.id ?? d.id),
          title: String(raw.title ?? 'Database'),
          icon: String(raw.icon ?? '🗂️'),
          activeView: (raw.activeView as DatabaseViewType) ?? 'table',
          groupByColumnId: String(raw.groupByColumnId ?? 'col_status'),
          columns: Array.isArray(raw.columns) ? (raw.columns as DatabaseColumn[]) : [],
        };
      });
      emitIfReady();
    },
    (err) => handleSubError(`users/${uid}/databases`, err),
  );

  const unsubRows = onSnapshot(
    collection(db, 'users', uid, 'dbRows'),
    (snap) => {
      rowsList = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: String(raw.id ?? d.id),
          databaseId: String(raw.databaseId ?? ''),
          pageId: String(raw.pageId ?? ''),
          cells: (raw.cells ?? {}) as Record<string, DatabaseCellValue>,
          position: Number(raw.position ?? 0),
          createdAt: timestampToIso(raw.createdAt),
          updatedAt: timestampToIso(raw.updatedAt),
        } satisfies DatabaseRow;
      });
      emitIfReady();
    },
    (err) => handleSubError(`users/${uid}/dbRows`, err),
  );

  const unsubComments = onSnapshot(
    collection(db, 'users', uid, 'comments'),
    (snap) => {
      commentsList = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: String(raw.id ?? d.id),
          pageId: String(raw.pageId ?? ''),
          author: String(raw.author ?? 'Workspace Member'),
          text: String(raw.text ?? ''),
          resolved: Boolean(raw.resolved),
          createdAt: timestampToIso(raw.createdAt),
        } satisfies PageComment;
      });
      emitIfReady();
    },
    (err) => handleSubError(`users/${uid}/comments`, err),
  );

  return () => {
    unsubSettings();
    unsubPages();
    unsubBlocks();
    unsubDatabases();
    unsubRows();
    unsubComments();
  };
}

export async function cloudUpdateSettings(
  uid: string,
  patch: Partial<{ name: string; icon: string; theme: ThemeMode }>,
): Promise<void> {
  const path = `users/${uid}/meta/settings`;
  const cleanPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) cleanPatch.name = clampString(patch.name, 120, 'PLC Workspace') || 'PLC Workspace';
  if (patch.icon !== undefined) cleanPatch.icon = clampString(patch.icon, 32, '📐') || '📐';
  if (patch.theme !== undefined) cleanPatch.theme = patch.theme === 'dark' ? 'dark' : 'light';
  try {
    await updateDoc(doc(db, 'users', uid, 'meta', 'settings'), cleanPatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cloudCreatePage(
  uid: string,
  page: Page,
  blocks: Block[],
  database?: Database,
): Promise<void> {
  const path = `users/${uid}/pages/${page.id}`;
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'pages', ensureValidFirestoreId(page.id, 'page')),
    sanitizePageForCloud(uid, page, serverTimestamp(), serverTimestamp()),
  );
  if (database) {
    batch.set(
      doc(db, 'users', uid, 'databases', ensureValidFirestoreId(database.id, 'db')),
      sanitizeDatabaseForCloud(uid, database, serverTimestamp()),
    );
  }
  for (const blk of blocks) {
    batch.set(
      doc(db, 'users', uid, 'blocks', ensureValidFirestoreId(blk.id, 'blk')),
      sanitizeBlockForCloud(uid, blk, serverTimestamp()),
    );
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function cloudUpdatePage(
  uid: string,
  pageId: string,
  patch: Partial<Page>,
): Promise<void> {
  const safePageId = ensureValidFirestoreId(pageId, 'page');
  const pageRef = doc(db, 'users', uid, 'pages', safePageId);
  const path = `users/${uid}/pages/${safePageId}`;

  const appearancePatch: Record<string, unknown> = {};
  if (patch.title !== undefined) appearancePatch.title = clampString(patch.title, 300, 'Untitled');
  if (patch.icon !== undefined) appearancePatch.icon = clampString(patch.icon, 32, '📄');
  if (patch.cover !== undefined) appearancePatch.cover = patch.cover ? clampString(patch.cover, 512) : null;
  if (patch.coverPosition !== undefined) appearancePatch.coverPosition = clampNumber(patch.coverPosition, 0, 100, 50);
  if (patch.font !== undefined) appearancePatch.font = patch.font === 'serif' || patch.font === 'mono' ? patch.font : 'sans';
  if (patch.smallText !== undefined) appearancePatch.smallText = Boolean(patch.smallText);
  if (patch.fullWidth !== undefined) appearancePatch.fullWidth = Boolean(patch.fullWidth);
  if (patch.parentId !== undefined) appearancePatch.parentId = patch.parentId ? ensureValidFirestoreId(patch.parentId, 'page') : null;
  if (patch.position !== undefined) appearancePatch.position = clampNumber(patch.position, 0, 100000, 0);
  if (patch.databaseId !== undefined) appearancePatch.databaseId = patch.databaseId ? ensureValidFirestoreId(patch.databaseId, 'db') : null;

  const statePatch: Record<string, unknown> = {};
  if (patch.isFavorite !== undefined) statePatch.isFavorite = Boolean(patch.isFavorite);
  if (patch.isTrashed !== undefined) statePatch.isTrashed = Boolean(patch.isTrashed);
  if (patch.locked !== undefined) statePatch.locked = Boolean(patch.locked);

  try {
    if (Object.keys(appearancePatch).length > 0) {
      await updateDoc(pageRef, { ...appearancePatch, updatedAt: serverTimestamp() });
    }
    if (Object.keys(statePatch).length > 0) {
      await updateDoc(pageRef, { ...statePatch, updatedAt: serverTimestamp() });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cloudSavePageBlocks(
  uid: string,
  pageId: string,
  blocks: Block[],
  newDatabases: Database[] = [],
): Promise<void> {
  const safePageId = ensureValidFirestoreId(pageId, 'page');
  const colPath = `users/${uid}/blocks`;
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'users', uid, 'blocks'), where('pageId', '==', safePageId)),
    );
    const keepIds = new Set(blocks.map((b) => ensureValidFirestoreId(b.id, 'blk')));
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    for (const dbItem of newDatabases) {
      const dbRef = doc(db, 'users', uid, 'databases', ensureValidFirestoreId(dbItem.id, 'db'));
      ops.push((batch) => {
        batch.set(dbRef, sanitizeDatabaseForCloud(uid, dbItem, serverTimestamp()));
      });
    }

    existingSnap.forEach((docSnap) => {
      if (!keepIds.has(docSnap.id)) {
        ops.push((batch) => batch.delete(docSnap.ref));
      }
    });

    for (const blk of blocks) {
      const blkId = ensureValidFirestoreId(blk.id, 'blk');
      const blkRef = doc(db, 'users', uid, 'blocks', blkId);
      ops.push((batch) => {
        batch.set(blkRef, sanitizeBlockForCloud(uid, { ...blk, id: blkId, pageId: safePageId }, serverTimestamp()));
      });
    }

    await commitOperationsInBatches(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, colPath);
  }
}

export async function cloudDeletePageTree(
  uid: string,
  pageIds: string[],
): Promise<void> {
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const safeIds = pageIds.map((id) => ensureValidFirestoreId(id, 'page'));

  try {
    for (const pid of safeIds) {
      ops.push((batch) => batch.delete(doc(db, 'users', uid, 'pages', pid)));
      const blkSnap = await getDocs(
        query(collection(db, 'users', uid, 'blocks'), where('pageId', '==', pid)),
      );
      blkSnap.forEach((d) => ops.push((batch) => batch.delete(d.ref)));

      const cmtSnap = await getDocs(
        query(collection(db, 'users', uid, 'comments'), where('pageId', '==', pid)),
      );
      cmtSnap.forEach((d) => ops.push((batch) => batch.delete(d.ref)));
    }
    await commitOperationsInBatches(ops);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/pages`);
  }
}

export async function cloudUpdateDatabase(
  uid: string,
  dbId: string,
  patch: Partial<{
    title: string;
    icon: string;
    activeView: DatabaseViewType;
    groupByColumnId: string;
    columns: DatabaseColumn[];
  }>,
): Promise<void> {
  const safeDbId = ensureValidFirestoreId(dbId, 'db');
  const dbRef = doc(db, 'users', uid, 'databases', safeDbId);
  const path = `users/${uid}/databases/${safeDbId}`;

  const viewPatch: Record<string, unknown> = {};
  if (patch.activeView !== undefined) viewPatch.activeView = patch.activeView;
  if (patch.groupByColumnId !== undefined) viewPatch.groupByColumnId = clampString(patch.groupByColumnId, 128, 'col_status');

  const schemaPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) schemaPatch.title = clampString(patch.title, 200, 'Database');
  if (patch.icon !== undefined) schemaPatch.icon = clampString(patch.icon, 32, '🗂️');
  if (patch.columns !== undefined) schemaPatch.columns = sanitizeColumnsForCloud(patch.columns);

  try {
    if (Object.keys(viewPatch).length > 0) {
      await updateDoc(dbRef, { ...viewPatch, updatedAt: serverTimestamp() });
    }
    if (Object.keys(schemaPatch).length > 0) {
      await updateDoc(dbRef, { ...schemaPatch, updatedAt: serverTimestamp() });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cloudAddDatabaseRow(
  uid: string,
  row: DatabaseRow,
  rowPage: Page,
): Promise<void> {
  const path = `users/${uid}/dbRows/${row.id}`;
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'pages', ensureValidFirestoreId(rowPage.id, 'rowp')),
    sanitizePageForCloud(uid, rowPage, serverTimestamp(), serverTimestamp()),
  );
  batch.set(
    doc(db, 'users', uid, 'dbRows', ensureValidFirestoreId(row.id, 'row')),
    sanitizeRowForCloud(uid, row, serverTimestamp(), serverTimestamp()),
  );
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function cloudUpdateDatabaseRow(
  uid: string,
  rowId: string,
  nextCells: Record<string, DatabaseCellValue>,
): Promise<void> {
  const safeRowId = ensureValidFirestoreId(rowId, 'row');
  const path = `users/${uid}/dbRows/${safeRowId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'dbRows', safeRowId), {
      cells: sanitizeCellsForCloud(nextCells),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cloudDeleteDatabaseRow(
  uid: string,
  rowId: string,
  rowPageId?: string,
): Promise<void> {
  const safeRowId = ensureValidFirestoreId(rowId, 'row');
  const path = `users/${uid}/dbRows/${safeRowId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'dbRows', safeRowId));
  if (rowPageId) {
    batch.delete(doc(db, 'users', uid, 'pages', ensureValidFirestoreId(rowPageId, 'rowp')));
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function cloudAddComment(
  uid: string,
  comment: PageComment,
): Promise<void> {
  const safeId = ensureValidFirestoreId(comment.id, 'cmt');
  const path = `users/${uid}/comments/${safeId}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'comments', safeId),
      sanitizeCommentForCloud(uid, comment, serverTimestamp(), serverTimestamp()),
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function cloudUpdateComment(
  uid: string,
  commentId: string,
  patch: { resolved?: boolean; text?: string },
): Promise<void> {
  const safeId = ensureValidFirestoreId(commentId, 'cmt');
  const path = `users/${uid}/comments/${safeId}`;
  const ref = doc(db, 'users', uid, 'comments', safeId);
  try {
    if (patch.resolved !== undefined) {
      await updateDoc(ref, { resolved: Boolean(patch.resolved), updatedAt: serverTimestamp() });
    }
    if (patch.text !== undefined) {
      await updateDoc(ref, {
        text: clampString(patch.text, 5000, 'Comment') || 'Comment',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cloudDeleteComment(
  uid: string,
  commentId: string,
): Promise<void> {
  const safeId = ensureValidFirestoreId(commentId, 'cmt');
  const path = `users/${uid}/comments/${safeId}`;
  try {
    await writeBatch(db).delete(doc(db, 'users', uid, 'comments', safeId)).commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
