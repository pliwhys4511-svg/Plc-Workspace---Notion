import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  Page,
  PageComment,
  ThemeMode,
  WorkspaceData,
  WorkspaceSettings,
} from '../src/lib/types.ts';
import { createSeedWorkspace } from '../src/lib/seedData.ts';

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export class WorkspaceStore {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'workspace.db');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
    this.seedIfEmpty();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_meta (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        theme TEXT NOT NULL DEFAULT 'light',
        password_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '📄',
        cover TEXT,
        cover_position INTEGER NOT NULL DEFAULT 50,
        font TEXT NOT NULL DEFAULT 'sans',
        small_text INTEGER NOT NULL DEFAULT 0,
        full_width INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_trashed INTEGER NOT NULL DEFAULT 0,
        is_database INTEGER NOT NULL DEFAULT 0,
        database_id TEXT,
        is_row_page INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        checked INTEGER DEFAULT 0,
        open INTEGER DEFAULT 0,
        details TEXT DEFAULT '',
        icon TEXT,
        language TEXT,
        color TEXT DEFAULT 'default',
        indent INTEGER DEFAULT 0,
        meta_json TEXT,
        database_id TEXT,
        target_page_id TEXT,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id, position);

      CREATE TABLE IF NOT EXISTS databases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🗂️',
        active_view TEXT NOT NULL DEFAULT 'table',
        group_by_column_id TEXT NOT NULL,
        columns_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS db_rows (
        id TEXT PRIMARY KEY,
        database_id TEXT NOT NULL,
        page_id TEXT NOT NULL,
        cells_json TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_db_rows_db ON db_rows(database_id, position);

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id, created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
    `);

    // Safe additive migrations for existing DBs
    const blockCols = this.db
      .prepare('PRAGMA table_info(blocks)')
      .all() as Array<{ name: string }>;
    const colNames = new Set(blockCols.map((c) => c.name));
    if (!colNames.has('indent')) {
      this.db.exec('ALTER TABLE blocks ADD COLUMN indent INTEGER DEFAULT 0;');
    }
    if (!colNames.has('meta_json')) {
      this.db.exec('ALTER TABLE blocks ADD COLUMN meta_json TEXT;');
    }
  }

  private seedIfEmpty(): void {
    const row = this.db
      .prepare('SELECT id FROM workspace_meta WHERE id = ?')
      .get('default') as { id: string } | undefined;

    if (!row) {
      const seed = createSeedWorkspace();
      this.importWorkspaceData(seed);
    }

    const envPassword = (process.env.PLC_WORKSPACE_PASSWORD || '').trim();
    if (envPassword) {
      const meta = this.db
        .prepare('SELECT password_hash FROM workspace_meta WHERE id = ?')
        .get('default') as { password_hash: string | null } | undefined;
      if (meta && !meta.password_hash) {
        this.db
          .prepare('UPDATE workspace_meta SET password_hash = ? WHERE id = ?')
          .run(hashPassword(envPassword), 'default');
      }
    }
  }

  private runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public getSettings(): WorkspaceSettings {
    const row = this.db
      .prepare('SELECT name, icon, theme, password_hash FROM workspace_meta WHERE id = ?')
      .get('default') as
      | {
          name: string;
          icon: string;
          theme: ThemeMode;
          password_hash: string | null;
        }
      | undefined;

    if (!row) {
      return {
        name: 'PLC Workspace',
        icon: '📐',
        theme: 'light',
        passwordProtected: false,
      };
    }

    return {
      name: row.name,
      icon: row.icon,
      theme: row.theme === 'dark' ? 'dark' : 'light',
      passwordProtected: Boolean(row.password_hash),
    };
  }

  public updateSettings(
    patch: Partial<{ name: string; icon: string; theme: ThemeMode }>,
  ): WorkspaceSettings {
    const curr = this.getSettings();
    const nextName =
      typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : curr.name;
    const nextIcon =
      typeof patch.icon === 'string' && patch.icon.trim() ? patch.icon.trim() : curr.icon;
    const nextTheme =
      patch.theme === 'dark' || patch.theme === 'light' ? patch.theme : curr.theme;

    this.db
      .prepare('UPDATE workspace_meta SET name = ?, icon = ?, theme = ? WHERE id = ?')
      .run(nextName, nextIcon, nextTheme, 'default');

    return this.getSettings();
  }

  public verifyPassword(password: string): boolean {
    const row = this.db
      .prepare('SELECT password_hash FROM workspace_meta WHERE id = ?')
      .get('default') as { password_hash: string | null } | undefined;
    if (!row?.password_hash) return true;
    return checkPasswordHash(password, row.password_hash);
  }

  public setPassword(
    newPassword: string,
    currentPassword?: string,
  ): { ok: boolean; error?: string } {
    const settings = this.getSettings();
    if (settings.passwordProtected) {
      if (!currentPassword || !this.verifyPassword(currentPassword)) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
    }
    const trimmed = newPassword.trim();
    const nextHash = trimmed ? hashPassword(trimmed) : null;
    this.db
      .prepare('UPDATE workspace_meta SET password_hash = ? WHERE id = ?')
      .run(nextHash, 'default');
    return { ok: true };
  }

  public createSession(): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.db
      .prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)')
      .run(token, new Date().toISOString());
    return token;
  }

  public hasSession(token: string | undefined): boolean {
    if (!token) return false;
    const row = this.db
      .prepare('SELECT token FROM sessions WHERE token = ?')
      .get(token) as { token: string } | undefined;
    return Boolean(row);
  }

  public deleteSession(token: string | undefined): void {
    if (!token) return;
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  public getWorkspaceData(): WorkspaceData {
    const settings = this.getSettings();
    const pageRows = this.db
      .prepare('SELECT * FROM pages ORDER BY position ASC, created_at ASC')
      .all() as Array<Record<string, unknown>>;

    const pages: Page[] = pageRows.map((r) => ({
      id: String(r.id),
      parentId: r.parent_id ? String(r.parent_id) : null,
      title: String(r.title ?? ''),
      icon: String(r.icon ?? '📄'),
      cover: r.cover ? String(r.cover) : null,
      coverPosition: Number(r.cover_position ?? 50),
      font: (r.font as Page['font']) || 'sans',
      smallText: Boolean(r.small_text),
      fullWidth: Boolean(r.full_width),
      isFavorite: Boolean(r.is_favorite),
      isTrashed: Boolean(r.is_trashed),
      isDatabase: Boolean(r.is_database),
      databaseId: r.database_id ? String(r.database_id) : null,
      isRowPage: Boolean(r.is_row_page),
      locked: Boolean(r.locked),
      position: Number(r.position ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const blockRows = this.db
      .prepare('SELECT * FROM blocks ORDER BY position ASC')
      .all() as Array<Record<string, unknown>>;

    const blocksByPage: Record<string, Block[]> = {};
    for (const p of pages) {
      blocksByPage[p.id] = [];
    }

    for (const r of blockRows) {
      const pageId = String(r.page_id);
      if (!blocksByPage[pageId]) blocksByPage[pageId] = [];
      let meta: Record<string, unknown> = {};
      if (r.meta_json) {
        try {
          meta = JSON.parse(String(r.meta_json));
        } catch {
          meta = {};
        }
      }
      blocksByPage[pageId].push({
        id: String(r.id),
        pageId,
        type: String(r.type) as Block['type'],
        content: String(r.content ?? ''),
        checked: Boolean(r.checked),
        open: Boolean(r.open),
        details: r.details ? String(r.details) : '',
        icon: r.icon ? String(r.icon) : undefined,
        language: r.language ? String(r.language) : undefined,
        color: (r.color as Block['color']) || 'default',
        indent: Number(r.indent ?? 0),
        rows: Array.isArray(meta.rows) ? (meta.rows as string[][]) : undefined,
        hasHeaderRow: meta.hasHeaderRow !== undefined ? Boolean(meta.hasHeaderRow) : undefined,
        url: typeof meta.url === 'string' ? meta.url : undefined,
        caption: typeof meta.caption === 'string' ? meta.caption : undefined,
        databaseId: r.database_id ? String(r.database_id) : undefined,
        targetPageId: r.target_page_id ? String(r.target_page_id) : undefined,
        position: Number(r.position ?? 0),
      });
    }

    const dbDefs = this.db
      .prepare('SELECT * FROM databases')
      .all() as Array<Record<string, unknown>>;
    const allDbRows = this.db
      .prepare('SELECT * FROM db_rows ORDER BY position ASC, created_at ASC')
      .all() as Array<Record<string, unknown>>;

    const rowsByDb: Record<string, DatabaseRow[]> = {};
    for (const r of allDbRows) {
      const databaseId = String(r.database_id);
      if (!rowsByDb[databaseId]) rowsByDb[databaseId] = [];
      let cells: Record<string, DatabaseCellValue> = {};
      try {
        cells = JSON.parse(String(r.cells_json || '{}'));
      } catch {
        cells = {};
      }
      rowsByDb[databaseId].push({
        id: String(r.id),
        databaseId,
        pageId: String(r.page_id),
        cells,
        position: Number(r.position ?? 0),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      });
    }

    const databases: Record<string, Database> = {};
    for (const d of dbDefs) {
      const id = String(d.id);
      let columns: DatabaseColumn[] = [];
      try {
        columns = JSON.parse(String(d.columns_json || '[]'));
      } catch {
        columns = [];
      }
      databases[id] = {
        id,
        title: String(d.title ?? 'Untitled Database'),
        icon: String(d.icon ?? '🗂️'),
        activeView: (d.active_view as Database['activeView']) || 'table',
        groupByColumnId: String(d.group_by_column_id ?? ''),
        columns,
        rows: rowsByDb[id] ?? [],
      };
    }

    const commentRows = this.db
      .prepare('SELECT * FROM comments ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const commentsByPage: Record<string, PageComment[]> = {};
    for (const c of commentRows) {
      const pageId = String(c.page_id);
      if (!commentsByPage[pageId]) commentsByPage[pageId] = [];
      commentsByPage[pageId].push({
        id: String(c.id),
        pageId,
        author: String(c.author),
        text: String(c.text),
        resolved: Boolean(c.resolved),
        createdAt: String(c.created_at),
      });
    }

    return { settings, pages, blocksByPage, databases, commentsByPage };
  }

  public createDefaultDatabase(title = 'Untitled Database', icon = '🗂️'): Database {
    const dbId = genId('db');
    const colTitleId = 'col_title';
    const colStatusId = 'col_status';
    const colCategoryId = 'col_category';
    const colOwnerId = 'col_owner';
    const colDueId = 'col_due';

    const columns: DatabaseColumn[] = [
      { id: colTitleId, name: 'Name', type: 'title', width: 260 },
      {
        id: colStatusId,
        name: 'Status',
        type: 'select',
        width: 135,
        options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
          { id: 'in_progress', label: 'In Progress', color: 'blue' },
          { id: 'done', label: 'Done', color: 'green' },
        ],
      },
      {
        id: colCategoryId,
        name: 'Category',
        type: 'select',
        width: 135,
        options: [
          { id: 'general', label: 'General', color: 'purple' },
          { id: 'work', label: 'Work', color: 'blue' },
          { id: 'personal', label: 'Personal', color: 'green' },
          { id: 'ideas', label: 'Ideas', color: 'orange' },
        ],
      },
      { id: colOwnerId, name: 'Owner', type: 'person', width: 130 },
      { id: colDueId, name: 'Due Date', type: 'date', width: 130 },
    ];

    this.db
      .prepare(
        'INSERT INTO databases (id, title, icon, active_view, group_by_column_id, columns_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(dbId, title, icon, 'table', colStatusId, JSON.stringify(columns));

    return {
      id: dbId,
      title,
      icon,
      activeView: 'table',
      groupByColumnId: colStatusId,
      columns,
      rows: [],
    };
  }

  public createPage(input: {
    parentId?: string | null;
    title?: string;
    icon?: string;
    isDatabase?: boolean;
    cover?: string | null;
    blocks?: Array<Partial<Block>>;
  }): { page: Page; blocks: Block[]; database?: Database } {
    const now = new Date().toISOString();
    const id = genId('page');
    const parentId = input.parentId ?? null;
    const isDatabase = Boolean(input.isDatabase);
    const title = input.title ?? (isDatabase ? 'Untitled Database' : 'Untitled');
    const icon = input.icon ?? (isDatabase ? '🗂️' : '📄');

    const maxPosRow = this.db
      .prepare(
        'SELECT COALESCE(MAX(position), -1) as max_pos FROM pages WHERE parent_id IS ? AND is_trashed = 0',
      )
      .get(parentId) as { max_pos: number } | undefined;
    const position = (maxPosRow?.max_pos ?? -1) + 1;

    return this.runInTransaction(() => {
      let database: Database | undefined;
      if (isDatabase) {
        database = this.createDefaultDatabase(title, icon);
      }

      const page: Page = {
        id,
        parentId,
        title,
        icon,
        cover: input.cover ?? null,
        coverPosition: 50,
        font: 'sans',
        smallText: false,
        fullWidth: isDatabase,
        isFavorite: false,
        isTrashed: false,
        isDatabase,
        databaseId: database?.id ?? null,
        isRowPage: false,
        locked: false,
        position,
        createdAt: now,
        updatedAt: now,
      };

      this.db
        .prepare(
          `INSERT INTO pages (
            id, parent_id, title, icon, cover, cover_position, font, small_text, full_width,
            is_favorite, is_trashed, is_database, database_id, is_row_page, locked, position, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          page.id,
          page.parentId,
          page.title,
          page.icon,
          page.cover,
          page.coverPosition,
          page.font,
          page.smallText ? 1 : 0,
          page.fullWidth ? 1 : 0,
          page.isFavorite ? 1 : 0,
          page.isTrashed ? 1 : 0,
          page.isDatabase ? 1 : 0,
          page.databaseId ?? null,
          0,
          0,
          page.position,
          page.createdAt,
          page.updatedAt,
        );

      const initialBlocks: Block[] = isDatabase
        ? []
        : Array.isArray(input.blocks) && input.blocks.length > 0
        ? input.blocks.map((b, idx) => ({
            id: genId('blk'),
            pageId: page.id,
            type: b.type || 'paragraph',
            content: b.content ?? '',
            checked: b.checked,
            open: b.open,
            details: b.details,
            icon: b.icon,
            language: b.language,
            color: b.color,
            indent: b.indent ?? 0,
            rows: b.rows,
            hasHeaderRow: b.hasHeaderRow,
            url: b.url,
            caption: b.caption,
            position: idx,
          }))
        : [
            {
              id: genId('blk'),
              pageId: page.id,
              type: 'paragraph',
              content: '',
              position: 0,
            },
          ];

      for (const blk of initialBlocks) {
        this.insertBlockStmt(blk);
      }

      if (database) {
        this.addDatabaseRowInternal(database.id, {
          col_title: 'First item',
          col_status: 'todo',
          col_due: new Date().toISOString().slice(0, 10),
        });
        const fresh = this.getWorkspaceData().databases[database.id];
        if (fresh) database = fresh;
      }

      return { page, blocks: initialBlocks, database };
    });
  }

  public updatePage(id: string, patch: Partial<Page>): Page | null {
    const existing = this.db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = patch.title !== undefined ? patch.title : String(existing.title);
    const icon = patch.icon !== undefined ? patch.icon : String(existing.icon);
    const cover =
      patch.cover !== undefined ? patch.cover : existing.cover ? String(existing.cover) : null;
    const coverPosition =
      patch.coverPosition !== undefined
        ? patch.coverPosition
        : Number(existing.cover_position ?? 50);
    const font = patch.font !== undefined ? patch.font : String(existing.font);
    const smallText =
      patch.smallText !== undefined ? (patch.smallText ? 1 : 0) : Number(existing.small_text);
    const fullWidth =
      patch.fullWidth !== undefined ? (patch.fullWidth ? 1 : 0) : Number(existing.full_width);
    const isFavorite =
      patch.isFavorite !== undefined ? (patch.isFavorite ? 1 : 0) : Number(existing.is_favorite);
    const isTrashed =
      patch.isTrashed !== undefined ? (patch.isTrashed ? 1 : 0) : Number(existing.is_trashed);
    const parentId =
      patch.parentId !== undefined
        ? patch.parentId
        : existing.parent_id
        ? String(existing.parent_id)
        : null;
    const locked = patch.locked !== undefined ? (patch.locked ? 1 : 0) : Number(existing.locked);
    const position = patch.position !== undefined ? patch.position : Number(existing.position);

    this.runInTransaction(() => {
      this.db
        .prepare(
          `UPDATE pages SET
            parent_id = ?, title = ?, icon = ?, cover = ?, cover_position = ?, font = ?,
            small_text = ?, full_width = ?, is_favorite = ?, is_trashed = ?, locked = ?,
            position = ?, updated_at = ?
          WHERE id = ?`,
        )
        .run(
          parentId,
          title,
          icon,
          cover,
          coverPosition,
          font,
          smallText,
          fullWidth,
          isFavorite,
          isTrashed,
          locked,
          position,
          now,
          id,
        );

      if (existing.database_id && patch.title !== undefined) {
        this.db
          .prepare('UPDATE databases SET title = ? WHERE id = ?')
          .run(title, String(existing.database_id));
      }
    });

    return this.getWorkspaceData().pages.find((p) => p.id === id) ?? null;
  }

  public duplicatePage(id: string): { page: Page; blocks: Block[] } | null {
    const data = this.getWorkspaceData();
    const source = data.pages.find((p) => p.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const newId = genId('page');

    return this.runInTransaction(() => {
      const page: Page = {
        ...source,
        id: newId,
        title: `${source.title || 'Untitled'} (Copy)`,
        isFavorite: false,
        isTrashed: false,
        position: source.position + 1,
        createdAt: now,
        updatedAt: now,
      };

      this.db
        .prepare(
          `INSERT INTO pages (
            id, parent_id, title, icon, cover, cover_position, font, small_text, full_width,
            is_favorite, is_trashed, is_database, database_id, is_row_page, locked, position, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          page.id,
          page.parentId,
          page.title,
          page.icon,
          page.cover,
          page.coverPosition,
          page.font,
          page.smallText ? 1 : 0,
          page.fullWidth ? 1 : 0,
          0,
          0,
          0,
          null,
          0,
          0,
          page.position,
          page.createdAt,
          page.updatedAt,
        );

      const srcBlocks = data.blocksByPage[id] ?? [];
      const clonedBlocks: Block[] = srcBlocks.map((b, idx) => ({
        ...b,
        id: genId('blk'),
        pageId: newId,
        position: idx,
      }));
      for (const blk of clonedBlocks) {
        this.insertBlockStmt(blk);
      }

      return { page, blocks: clonedBlocks };
    });
  }

  public deletePagePermanently(id: string): string[] {
    const data = this.getWorkspaceData();
    const toDelete = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const p of data.pages) {
        if (p.parentId === curr && !toDelete.has(p.id)) {
          toDelete.add(p.id);
          queue.push(p.id);
        }
      }
    }

    this.runInTransaction(() => {
      for (const targetId of toDelete) {
        const page = data.pages.find((p) => p.id === targetId);
        if (page?.databaseId) {
          this.db.prepare('DELETE FROM db_rows WHERE database_id = ?').run(page.databaseId);
          this.db.prepare('DELETE FROM databases WHERE id = ?').run(page.databaseId);
        }
        this.db.prepare('DELETE FROM comments WHERE page_id = ?').run(targetId);
        this.db.prepare('DELETE FROM blocks WHERE page_id = ?').run(targetId);
        this.db.prepare('DELETE FROM pages WHERE id = ?').run(targetId);
      }
    });

    return Array.from(toDelete);
  }

  private insertBlockStmt(b: Block): void {
    const meta: Record<string, unknown> = {};
    if (b.rows !== undefined) meta.rows = b.rows;
    if (b.hasHeaderRow !== undefined) meta.hasHeaderRow = b.hasHeaderRow;
    if (b.url !== undefined) meta.url = b.url;
    if (b.caption !== undefined) meta.caption = b.caption;
    const metaJson = Object.keys(meta).length > 0 ? JSON.stringify(meta) : null;

    this.db
      .prepare(
        `INSERT INTO blocks (
          id, page_id, type, content, checked, open, details, icon, language, color, indent, meta_json, database_id, target_page_id, position
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        b.id,
        b.pageId,
        b.type,
        b.content ?? '',
        b.checked ? 1 : 0,
        b.open ? 1 : 0,
        b.details ?? '',
        b.icon ?? null,
        b.language ?? null,
        b.color ?? 'default',
        b.indent ?? 0,
        metaJson,
        b.databaseId ?? null,
        b.targetPageId ?? null,
        b.position,
      );
  }

  public replacePageBlocks(
    pageId: string,
    blocks: Block[],
  ): { blocks: Block[]; createdDatabases: Database[] } {
    const now = new Date().toISOString();
    const createdDatabases: Database[] = [];

    const normalized = this.runInTransaction(() => {
      this.db.prepare('DELETE FROM blocks WHERE page_id = ?').run(pageId);

      const finalBlocks: Block[] = blocks.map((b, idx) => {
        let databaseId = b.databaseId;
        if (b.type === 'database') {
          const exists = databaseId
            ? this.db.prepare('SELECT id FROM databases WHERE id = ?').get(databaseId)
            : undefined;
          if (!exists) {
            const created = this.createDefaultDatabase(b.content || 'Inline Database', '🗂️');
            databaseId = created.id;
            createdDatabases.push(created);
          }
        }
        return {
          ...b,
          pageId,
          databaseId,
          position: idx,
        };
      });

      for (const b of finalBlocks) {
        this.insertBlockStmt(b);
      }

      this.db.prepare('UPDATE pages SET updated_at = ? WHERE id = ?').run(now, pageId);
      return finalBlocks;
    });

    return { blocks: normalized, createdDatabases };
  }

  public addComment(pageId: string, text: string, author = 'Workspace Member'): PageComment {
    const comment: PageComment = {
      id: genId('cmt'),
      pageId,
      author,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        'INSERT INTO comments (id, page_id, author, text, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(comment.id, comment.pageId, comment.author, comment.text, 0, comment.createdAt);
    return comment;
  }

  public updateComment(id: string, patch: { resolved?: boolean; text?: string }): PageComment | null {
    const existing = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return null;
    const resolved =
      patch.resolved !== undefined ? (patch.resolved ? 1 : 0) : Number(existing.resolved);
    const text = patch.text !== undefined ? patch.text : String(existing.text);
    this.db
      .prepare('UPDATE comments SET resolved = ?, text = ? WHERE id = ?')
      .run(resolved, text, id);
    return {
      id: String(existing.id),
      pageId: String(existing.page_id),
      author: String(existing.author),
      text,
      resolved: Boolean(resolved),
      createdAt: String(existing.created_at),
    };
  }

  public deleteComment(id: string): boolean {
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return true;
  }

  public updateDatabase(
    id: string,
    patch: Partial<{
      title: string;
      icon: string;
      activeView: Database['activeView'];
      groupByColumnId: string;
      columns: DatabaseColumn[];
    }>,
  ): Database | null {
    const existing = this.getWorkspaceData().databases[id];
    if (!existing) return null;

    const title = patch.title ?? existing.title;
    const icon = patch.icon ?? existing.icon;
    const activeView = patch.activeView ?? existing.activeView;
    const groupByColumnId = patch.groupByColumnId ?? existing.groupByColumnId;
    const columns = patch.columns ?? existing.columns;

    this.db
      .prepare(
        'UPDATE databases SET title = ?, icon = ?, active_view = ?, group_by_column_id = ?, columns_json = ? WHERE id = ?',
      )
      .run(title, icon, activeView, groupByColumnId, JSON.stringify(columns), id);

    return this.getWorkspaceData().databases[id] ?? null;
  }

  private addDatabaseRowInternal(
    databaseId: string,
    initialCells: Record<string, DatabaseCellValue> = {},
  ): { row: DatabaseRow; rowPage: Page } {
    const now = new Date().toISOString();
    const rowId = genId('row');
    const rowPageId = genId('rowpage');

    const dbMeta = this.db
      .prepare('SELECT columns_json FROM databases WHERE id = ?')
      .get(databaseId) as { columns_json: string } | undefined;
    const columns: DatabaseColumn[] = dbMeta ? JSON.parse(dbMeta.columns_json) : [];
    const titleCol = columns.find((c) => c.type === 'title') ?? columns[0];
    const titleKey = titleCol?.id ?? 'col_title';
    const rowTitle = String(initialCells[titleKey] ?? 'Untitled');

    const maxPosRow = this.db
      .prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM db_rows WHERE database_id = ?')
      .get(databaseId) as { max_pos: number } | undefined;
    const position = (maxPosRow?.max_pos ?? -1) + 1;

    const ownerPage = this.db
      .prepare('SELECT id FROM pages WHERE database_id = ?')
      .get(databaseId) as { id: string } | undefined;

    const rowPage: Page = {
      id: rowPageId,
      parentId: ownerPage?.id ?? null,
      title: rowTitle,
      icon: '📄',
      cover: null,
      coverPosition: 50,
      font: 'sans',
      smallText: false,
      fullWidth: false,
      isFavorite: false,
      isTrashed: false,
      isDatabase: false,
      databaseId: null,
      isRowPage: true,
      locked: false,
      position,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO pages (
          id, parent_id, title, icon, cover, cover_position, font, small_text, full_width,
          is_favorite, is_trashed, is_database, database_id, is_row_page, locked, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rowPage.id,
        rowPage.parentId,
        rowPage.title,
        rowPage.icon,
        null,
        50,
        'sans',
        0,
        0,
        0,
        0,
        0,
        null,
        1,
        0,
        rowPage.position,
        now,
        now,
      );

    const cells: Record<string, DatabaseCellValue> = {
      [titleKey]: rowTitle,
      ...initialCells,
    };

    const row: DatabaseRow = {
      id: rowId,
      databaseId,
      pageId: rowPageId,
      cells,
      position,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        'INSERT INTO db_rows (id, database_id, page_id, cells_json, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(row.id, row.databaseId, row.pageId, JSON.stringify(row.cells), row.position, now, now);

    return { row, rowPage };
  }

  public addDatabaseRow(
    databaseId: string,
    initialCells: Record<string, DatabaseCellValue> = {},
  ): { row: DatabaseRow; rowPage: Page } {
    return this.runInTransaction(() => this.addDatabaseRowInternal(databaseId, initialCells));
  }

  public updateDatabaseRow(
    databaseId: string,
    rowId: string,
    cellsPatch: Record<string, DatabaseCellValue>,
  ): DatabaseRow | null {
    const existing = this.db
      .prepare('SELECT * FROM db_rows WHERE id = ? AND database_id = ?')
      .get(rowId, databaseId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const now = new Date().toISOString();
    const prevCells: Record<string, DatabaseCellValue> = JSON.parse(
      String(existing.cells_json || '{}'),
    );
    const nextCells = { ...prevCells, ...cellsPatch };

    const dbMeta = this.db
      .prepare('SELECT columns_json FROM databases WHERE id = ?')
      .get(databaseId) as { columns_json: string } | undefined;
    const columns: DatabaseColumn[] = dbMeta ? JSON.parse(dbMeta.columns_json) : [];
    const titleCol = columns.find((c) => c.type === 'title');

    this.runInTransaction(() => {
      this.db
        .prepare('UPDATE db_rows SET cells_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(nextCells), now, rowId);

      if (titleCol && cellsPatch[titleCol.id] !== undefined) {
        this.db
          .prepare('UPDATE pages SET title = ?, updated_at = ? WHERE id = ?')
          .run(String(cellsPatch[titleCol.id] ?? 'Untitled'), now, String(existing.page_id));
      }
    });

    return {
      id: String(existing.id),
      databaseId,
      pageId: String(existing.page_id),
      cells: nextCells,
      position: Number(existing.position),
      createdAt: String(existing.created_at),
      updatedAt: now,
    };
  }

  public deleteDatabaseRow(databaseId: string, rowId: string): boolean {
    const existing = this.db
      .prepare('SELECT page_id FROM db_rows WHERE id = ? AND database_id = ?')
      .get(rowId, databaseId) as { page_id: string } | undefined;
    if (!existing) return false;

    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM db_rows WHERE id = ?').run(rowId);
      this.db.prepare('DELETE FROM blocks WHERE page_id = ?').run(existing.page_id);
      this.db.prepare('DELETE FROM pages WHERE id = ?').run(existing.page_id);
    });
    return true;
  }

  public importWorkspaceData(data: WorkspaceData): void {
    this.runInTransaction(() => {
      const prevMeta = this.db
        .prepare('SELECT password_hash FROM workspace_meta WHERE id = ?')
        .get('default') as { password_hash: string | null } | undefined;

      this.db.exec(`
        DELETE FROM comments;
        DELETE FROM db_rows;
        DELETE FROM databases;
        DELETE FROM blocks;
        DELETE FROM pages;
        DELETE FROM workspace_meta;
      `);

      this.db
        .prepare(
          'INSERT INTO workspace_meta (id, name, icon, theme, password_hash) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          'default',
          data.settings?.name || 'PLC Workspace',
          data.settings?.icon || '📐',
          data.settings?.theme === 'dark' ? 'dark' : 'light',
          prevMeta?.password_hash ?? null,
        );

      for (const p of data.pages || []) {
        this.db
          .prepare(
            `INSERT INTO pages (
              id, parent_id, title, icon, cover, cover_position, font, small_text, full_width,
              is_favorite, is_trashed, is_database, database_id, is_row_page, locked, position, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            p.id,
            p.parentId ?? null,
            p.title ?? 'Untitled',
            p.icon ?? '📄',
            p.cover ?? null,
            p.coverPosition ?? 50,
            p.font ?? 'sans',
            p.smallText ? 1 : 0,
            p.fullWidth ? 1 : 0,
            p.isFavorite ? 1 : 0,
            p.isTrashed ? 1 : 0,
            p.isDatabase ? 1 : 0,
            p.databaseId ?? null,
            p.isRowPage ? 1 : 0,
            p.locked ? 1 : 0,
            p.position ?? 0,
            p.createdAt || new Date().toISOString(),
            p.updatedAt || new Date().toISOString(),
          );
      }

      for (const [pageId, blocks] of Object.entries(data.blocksByPage || {})) {
        for (let i = 0; i < blocks.length; i++) {
          this.insertBlockStmt({ ...blocks[i], pageId, position: i });
        }
      }

      for (const db of Object.values(data.databases || {})) {
        this.db
          .prepare(
            'INSERT INTO databases (id, title, icon, active_view, group_by_column_id, columns_json) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            db.id,
            db.title,
            db.icon,
            db.activeView,
            db.groupByColumnId,
            JSON.stringify(db.columns || []),
          );

        for (let i = 0; i < (db.rows || []).length; i++) {
          const r = db.rows[i];
          this.db
            .prepare(
              'INSERT INTO db_rows (id, database_id, page_id, cells_json, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              r.id,
              db.id,
              r.pageId,
              JSON.stringify(r.cells || {}),
              r.position ?? i,
              r.createdAt || new Date().toISOString(),
              r.updatedAt || new Date().toISOString(),
            );
        }
      }

      for (const [pageId, comments] of Object.entries(data.commentsByPage || {})) {
        for (const c of comments) {
          this.db
            .prepare(
              'INSERT INTO comments (id, page_id, author, text, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              c.id,
              pageId,
              c.author,
              c.text,
              c.resolved ? 1 : 0,
              c.createdAt || new Date().toISOString(),
            );
        }
      }
    });
  }
}
