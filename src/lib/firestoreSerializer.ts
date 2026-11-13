import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  Page,
  PageComment,
  WorkspaceSettings,
} from './types';

export interface FirestoreTableRow {
  cells: string[];
}

const VALID_ID_RE = /^[a-zA-Z0-9_\-]+$/;

export function ensureValidFirestoreId(raw: string, prefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  if (cleaned && VALID_ID_RE.test(cleaned)) return cleaned;
  return `${prefix}_${Date.now().toString(36)}`;
}

export function serializeTableRows(rows?: string[][]): FirestoreTableRow[] | undefined {
  if (!rows) return undefined;
  return rows.slice(0, 100).map((r) => ({
    cells: (Array.isArray(r) ? r : []).slice(0, 30).map((cell) => String(cell ?? '').slice(0, 2000)),
  }));
}

export function deserializeTableRows(tableRows?: FirestoreTableRow[]): string[][] | undefined {
  if (!tableRows) return undefined;
  return tableRows.map((row) => (Array.isArray(row?.cells) ? row.cells.map((c) => String(c ?? '')) : []));
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function timestampToIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function clampString(val: unknown, max: number, fallback = ''): string {
  const s = typeof val === 'string' ? val : val == null ? fallback : String(val);
  return s.slice(0, max);
}

export function clampNumber(val: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSettingsForCloud(
  ownerId: string,
  settings: Partial<WorkspaceSettings>,
  timestampToken: unknown,
): Record<string, unknown> {
  return {
    ownerId,
    name: clampString(settings.name, 120, 'PLC Workspace') || 'PLC Workspace',
    icon: clampString(settings.icon, 32, '📐') || '📐',
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    updatedAt: timestampToken,
  };
}

export function sanitizePageForCloud(
  ownerId: string,
  page: Page,
  createdAtToken: unknown,
  updatedAtToken: unknown,
): Record<string, unknown> {
  return stripUndefined({
    ownerId,
    id: ensureValidFirestoreId(page.id, 'page'),
    parentId: page.parentId ? ensureValidFirestoreId(page.parentId, 'page') : null,
    title: clampString(page.title, 300, 'Untitled'),
    icon: clampString(page.icon, 32, '📄'),
    cover: page.cover ? clampString(page.cover, 512) : null,
    coverPosition: clampNumber(page.coverPosition, 0, 100, 50),
    font: page.font === 'serif' || page.font === 'mono' ? page.font : 'sans',
    smallText: Boolean(page.smallText),
    fullWidth: Boolean(page.fullWidth),
    isFavorite: Boolean(page.isFavorite),
    isTrashed: Boolean(page.isTrashed),
    isDatabase: Boolean(page.isDatabase),
    databaseId: page.databaseId ? ensureValidFirestoreId(page.databaseId, 'db') : null,
    isRowPage: Boolean(page.isRowPage),
    locked: Boolean(page.locked),
    position: clampNumber(page.position, 0, 100000, 0),
    createdAt: createdAtToken,
    updatedAt: updatedAtToken,
  });
}

export function sanitizeBlockForCloud(
  ownerId: string,
  block: Block,
  updatedAtToken: unknown,
): Record<string, unknown> {
  const tableRows = serializeTableRows(block.rows);
  return stripUndefined({
    ownerId,
    id: ensureValidFirestoreId(block.id, 'blk'),
    pageId: ensureValidFirestoreId(block.pageId, 'page'),
    type: block.type,
    content: clampString(block.content, 50000, ''),
    checked: block.checked !== undefined ? Boolean(block.checked) : undefined,
    open: block.open !== undefined ? Boolean(block.open) : undefined,
    details: block.details !== undefined ? clampString(block.details, 20000, '') : undefined,
    icon: block.icon !== undefined ? clampString(block.icon, 32, '') : undefined,
    language: block.language !== undefined ? clampString(block.language, 40, '') : undefined,
    color: block.color !== undefined ? clampString(block.color, 32, 'default') : undefined,
    indent: block.indent !== undefined ? clampNumber(block.indent, 0, 10, 0) : undefined,
    tableRows,
    hasHeaderRow: block.hasHeaderRow !== undefined ? Boolean(block.hasHeaderRow) : undefined,
    url: block.url !== undefined ? clampString(block.url, 1000, '') : undefined,
    caption: block.caption !== undefined ? clampString(block.caption, 500, '') : undefined,
    databaseId: block.databaseId ? ensureValidFirestoreId(block.databaseId, 'db') : undefined,
    targetPageId: block.targetPageId ? ensureValidFirestoreId(block.targetPageId, 'page') : undefined,
    position: clampNumber(block.position, 0, 100000, 0),
    updatedAt: updatedAtToken,
  });
}

export function sanitizeColumnsForCloud(columns: DatabaseColumn[]): DatabaseColumn[] {
  const safe = columns.slice(0, 40).map((col) =>
    stripUndefined({
      id: ensureValidFirestoreId(col.id, 'col'),
      name: clampString(col.name, 120, 'Column') || 'Column',
      type: col.type,
      width: col.width !== undefined ? clampNumber(col.width, 60, 800, 140) : undefined,
      options: col.options
        ? col.options.slice(0, 60).map((o) => ({
            id: ensureValidFirestoreId(o.id, 'opt'),
            label: clampString(o.label, 80, 'Option'),
            color: o.color,
          }))
        : undefined,
    }) as unknown as DatabaseColumn,
  );
  if (safe.length === 0) {
    return [{ id: 'col_title', name: 'Name', type: 'title', width: 220 }];
  }
  return safe;
}

export function sanitizeDatabaseForCloud(
  ownerId: string,
  database: Database,
  updatedAtToken: unknown,
): Record<string, unknown> {
  return {
    ownerId,
    id: ensureValidFirestoreId(database.id, 'db'),
    title: clampString(database.title, 200, 'Database'),
    icon: clampString(database.icon, 32, '🗂️'),
    activeView: database.activeView,
    groupByColumnId: clampString(database.groupByColumnId, 128, 'col_status'),
    columns: sanitizeColumnsForCloud(database.columns),
    updatedAt: updatedAtToken,
  };
}

export function sanitizeCellsForCloud(
  cells: Record<string, DatabaseCellValue>,
): Record<string, DatabaseCellValue> {
  const out: Record<string, DatabaseCellValue> = {};
  const entries = Object.entries(cells).slice(0, 50);
  for (const [k, v] of entries) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v.slice(0, 30).map((item) => clampString(item, 120, ''));
    } else if (typeof v === 'string') {
      out[k] = clampString(v, 2000, '');
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function sanitizeRowForCloud(
  ownerId: string,
  row: DatabaseRow,
  createdAtToken: unknown,
  updatedAtToken: unknown,
): Record<string, unknown> {
  return {
    ownerId,
    id: ensureValidFirestoreId(row.id, 'row'),
    databaseId: ensureValidFirestoreId(row.databaseId, 'db'),
    pageId: ensureValidFirestoreId(row.pageId, 'rowp'),
    cells: sanitizeCellsForCloud(row.cells),
    position: clampNumber(row.position, 0, 100000, 0),
    createdAt: createdAtToken,
    updatedAt: updatedAtToken,
  };
}

export function sanitizeCommentForCloud(
  ownerId: string,
  comment: PageComment,
  createdAtToken: unknown,
  updatedAtToken: unknown,
): Record<string, unknown> {
  return {
    ownerId,
    id: ensureValidFirestoreId(comment.id, 'cmt'),
    pageId: ensureValidFirestoreId(comment.pageId, 'page'),
    author: clampString(comment.author, 120, 'Workspace Member') || 'Workspace Member',
    text: clampString(comment.text, 5000, 'Comment') || 'Comment',
    resolved: Boolean(comment.resolved),
    createdAt: createdAtToken,
    updatedAt: updatedAtToken,
  };
}
