import type {
  Block,
  BlockType,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseColumnType,
  DatabaseRow,
  DatabaseViewType,
  Page,
  PageFont,
  SelectOption,
  TagColor,
  WorkspaceData,
} from './types';
import { createId, stripHtmlToText } from './workspaceOps';

export interface TemplateBlockInput {
  type: BlockType;
  content: string;
  checked?: boolean;
  open?: boolean;
  details?: string;
  icon?: string;
  language?: string;
  color?: Block['color'];
  indent?: number;
  rows?: string[][];
  hasHeaderRow?: boolean;
  url?: string;
  caption?: string;
}

export interface ProjectTemplateRowInput {
  cells: Record<string, DatabaseCellValue>;
  blocks?: TemplateBlockInput[];
}

export interface ProjectTemplatePackage {
  format: 'plc-notion-template-v1';
  id?: string;
  exportedAt: string;
  name: string;
  icon: string;
  cover: string | null;
  category: string;
  description: string;
  isDatabase: boolean;
  font?: PageFont;
  fullWidth?: boolean;
  smallText?: boolean;
  database?: {
    title: string;
    icon: string;
    activeView: DatabaseViewType;
    groupByColumnId: string;
    columns: DatabaseColumn[];
    rows: ProjectTemplateRowInput[];
  };
  blocks: TemplateBlockInput[];
}

export interface ParsedTemplateImport {
  sourceFormat: 'template-json' | 'notion-csv' | 'notion-markdown' | 'workspace-json';
  name: string;
  icon: string;
  cover: string | null;
  category: string;
  description: string;
  isDatabase: boolean;
  font?: PageFont;
  fullWidth?: boolean;
  smallText?: boolean;
  activeView?: DatabaseViewType;
  groupByColumnId?: string;
  columns: DatabaseColumn[];
  rows: ProjectTemplateRowInput[];
  blocks: TemplateBlockInput[];
  summary: string;
}

const TAG_COLOR_PALETTE: TagColor[] = [
  'blue',
  'green',
  'purple',
  'orange',
  'pink',
  'yellow',
  'red',
  'brown',
  'gray',
];

function inferOptionColor(label: string, index: number): TagColor {
  const lower = label.trim().toLowerCase();
  if (/^(done|complete|completed|selesai|shipped|verified|approved|success|yes)$/.test(lower)) {
    return 'green';
  }
  if (/^(in progress|progress|doing|active|working|ongoing|sedang)$/.test(lower)) {
    return 'blue';
  }
  if (/^(in review|review|pending|waiting|qa|testing)$/.test(lower)) {
    return 'yellow';
  }
  if (/^(high|urgent|critical|blocker|blocked|p0|tinggi)$/.test(lower)) {
    return 'red';
  }
  if (/^(medium|normal|p1|sedang)$/.test(lower)) {
    return 'orange';
  }
  if (/^(backlog|todo|to do|draft|low|p2|none|belum)$/.test(lower)) {
    return 'gray';
  }
  return TAG_COLOR_PALETTE[index % TAG_COLOR_PALETTE.length];
}

function slugifyOptionId(label: string, fallbackIdx: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || `opt_${fallbackIdx + 1}`;
}

export function cleanNotionFilenameTitle(fileName?: string): string {
  if (!fileName) return 'Imported Template';
  const withoutExt = fileName.replace(/\.(csv|md|markdown|json|txt)$/i, '');
  // Notion appends a 32-char hex UUID at the end of exported file names (e.g. "Product Roadmap 1a2b3c4d...")
  const withoutNotionUuid = withoutExt.replace(/\s+[0-9a-f]{20,36}$/i, '').trim();
  return withoutNotionUuid || 'Imported Template';
}

function escapeCsvField(raw: string): string {
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function formatCellValueForExport(
  col: DatabaseColumn,
  val: DatabaseCellValue | undefined,
): string {
  if (val === null || val === undefined) return '';
  if (col.type === 'checkbox') {
    return val ? 'Yes' : 'No';
  }
  if (col.type === 'select') {
    const strVal = String(val);
    const opt = col.options?.find((o) => o.id === strVal || o.label === strVal);
    return opt ? opt.label : strVal;
  }
  if (col.type === 'multi_select') {
    const arr = Array.isArray(val) ? val : [String(val)];
    return arr
      .map((item) => {
        const opt = col.options?.find((o) => o.id === item || o.label === item);
        return opt ? opt.label : item;
      })
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(val)) {
    return val.join(', ');
  }
  return String(val);
}

export function exportDatabaseToCsv(database: Database): string {
  const headers = database.columns.map((c) => escapeCsvField(c.name));
  const lines = [headers.join(',')];
  const sortedRows = [...database.rows].sort((a, b) => a.position - b.position);
  for (const row of sortedRows) {
    const fields = database.columns.map((col) =>
      escapeCsvField(formatCellValueForExport(col, row.cells[col.id])),
    );
    lines.push(fields.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function exportDatabaseToMarkdown(page: Page, database: Database): string {
  const lines: string[] = [`# ${page.title || database.title || 'Untitled Project'}`, ''];
  if (database.columns.length > 0) {
    const headers = database.columns.map((c) => c.name.replace(/\|/g, '\\|'));
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    const sortedRows = [...database.rows].sort((a, b) => a.position - b.position);
    for (const row of sortedRows) {
      const vals = database.columns.map((col) =>
        formatCellValueForExport(col, row.cells[col.id])
          .replace(/\|/g, '\\|')
          .replace(/\r?\n/g, ' '),
      );
      lines.push(`| ${vals.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function serializeBlocksToTemplate(blocks: Block[]): TemplateBlockInput[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((b) => {
      const entry: TemplateBlockInput = {
        type: b.type,
        content: b.content,
      };
      if (b.checked !== undefined) entry.checked = b.checked;
      if (b.open !== undefined) entry.open = b.open;
      if (b.details !== undefined) entry.details = b.details;
      if (b.icon !== undefined) entry.icon = b.icon;
      if (b.language !== undefined) entry.language = b.language;
      if (b.color !== undefined) entry.color = b.color;
      if (b.indent !== undefined) entry.indent = b.indent;
      if (b.rows !== undefined) entry.rows = b.rows.map((r) => [...r]);
      if (b.hasHeaderRow !== undefined) entry.hasHeaderRow = b.hasHeaderRow;
      if (b.url !== undefined) entry.url = b.url;
      if (b.caption !== undefined) entry.caption = b.caption;
      return entry;
    });
}

export function exportPageToTemplatePackage(
  page: Page,
  blocks: Block[],
  databases: Record<string, Database>,
  blocksByPage?: Record<string, Block[]>,
): ProjectTemplatePackage {
  const pageDb = page.isDatabase && page.databaseId ? databases[page.databaseId] : undefined;
  const inlineDbBlock = !pageDb
    ? blocks.find((b) => b.type === 'database' && b.databaseId && databases[b.databaseId])
    : undefined;
  const embeddedDb =
    pageDb ?? (inlineDbBlock?.databaseId ? databases[inlineDbBlock.databaseId] : undefined);

  return {
    format: 'plc-notion-template-v1',
    id: `tpl_${page.id}`,
    exportedAt: new Date().toISOString(),
    name: page.title || 'Untitled Project',
    icon: page.icon || (page.isDatabase ? '🗂️' : '📄'),
    cover: page.cover ?? null,
    category: page.isDatabase || embeddedDb ? 'Projects & Databases' : 'Custom Templates',
    description: pageDb
      ? `Database template with ${pageDb.columns.length} properties and ${pageDb.rows.length} rows.`
      : `Page template with ${blocks.length} content blocks${embeddedDb ? ` and ${embeddedDb.rows.length} database items` : ''}.`,
    isDatabase: Boolean(page.isDatabase && pageDb),
    font: page.font,
    fullWidth: page.fullWidth,
    smallText: page.smallText,
    ...(embeddedDb
      ? {
          database: {
            title: embeddedDb.title,
            icon: embeddedDb.icon,
            activeView: embeddedDb.activeView,
            groupByColumnId: embeddedDb.groupByColumnId,
            columns: embeddedDb.columns.map((c) => ({
              ...c,
              options: c.options ? c.options.map((o) => ({ ...o })) : undefined,
            })),
            rows: [...embeddedDb.rows]
              .sort((a, b) => a.position - b.position)
              .map((r) => ({
                cells: { ...r.cells },
                blocks:
                  blocksByPage && blocksByPage[r.pageId]
                    ? serializeBlocksToTemplate(blocksByPage[r.pageId])
                    : undefined,
              })),
          },
        }
      : {}),
    blocks: serializeBlocksToTemplate(blocks),
  };
}

export function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  // Auto-detect semicolon delimiter (common in Indonesian/European Excel exports) when first line has ';' and no ','
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function tryNormalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or MM/DD/YYYY (match project screenshot format like 10/11/2026)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = slashMatch[3];
    // Assume DD/MM/YYYY if first > 12 or second <= 12 (Indonesian / Notion locale convention)
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /[a-zA-Z]/.test(s)) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function isBooleanString(raw: string): boolean | null {
  const lower = raw.trim().toLowerCase();
  if (['yes', 'true', 'ya', '✓', '☑', '[x]', 'x'].includes(lower)) return true;
  if (['no', 'false', 'tidak', '☐', '[ ]'].includes(lower)) return false;
  return null;
}

export function buildDatabaseFromTableMatrix(
  headers: string[],
  dataRows: string[][],
): { columns: DatabaseColumn[]; rows: ProjectTemplateRowInput[]; groupByColumnId: string } {
  const cleanHeaders = headers.map((h, i) => h.trim() || `Column ${i + 1}`);
  const columns: DatabaseColumn[] = [];

  for (let colIdx = 0; colIdx < cleanHeaders.length; colIdx++) {
    const header = cleanHeaders[colIdx];
    const colValues = dataRows.map((r) => (r[colIdx] ?? '').trim()).filter((v) => v !== '');

    if (colIdx === 0) {
      columns.push({
        id: 'col_title',
        name: header,
        type: 'title',
        width: 240,
      });
      continue;
    }

    let type: DatabaseColumnType = 'person';
    if (
      colValues.length > 0 &&
      colValues.every((v) => isBooleanString(v) !== null)
    ) {
      type = 'checkbox';
    } else if (
      colValues.length > 0 &&
      colValues.every((v) => tryNormalizeDate(v) !== null)
    ) {
      type = 'date';
    } else if (
      colValues.length > 0 &&
      colValues.every((v) => /^-?\d+(\.\d+)?$/.test(v)) &&
      !/phone|zip|id/i.test(header)
    ) {
      type = 'number';
    } else if (/owner|assignee|pic|person|member|author|lead/i.test(header)) {
      type = 'person';
    } else if (/url|link|website/i.test(header)) {
      type = 'url';
    } else if (
      /^(status|category|kategori|priority|prioritas|stage|phase|type|tags?|label)$/i.test(header) ||
      (colValues.length > 0 &&
        new Set(colValues.map((v) => v.toLowerCase())).size <= Math.max(4, Math.floor(colValues.length * 0.7)) &&
        colValues.every((v) => v.length <= 36 && !/@/.test(v)))
    ) {
      type = 'select';
    }

    const colId = `col_${slugifyOptionId(header, colIdx)}_${colIdx}`;
    if (type === 'select') {
      const seen = new Map<string, SelectOption>();
      for (const val of colValues) {
        const key = val.toLowerCase();
        if (!seen.has(key)) {
          const idx = seen.size;
          seen.set(key, {
            id: slugifyOptionId(val, idx),
            label: val,
            color: inferOptionColor(val, idx),
          });
        }
      }
      columns.push({
        id: colId,
        name: header,
        type: 'select',
        width: 140,
        options: Array.from(seen.values()),
      });
    } else {
      columns.push({
        id: colId,
        name: header,
        type,
        width: type === 'checkbox' ? 95 : type === 'date' ? 130 : 145,
      });
    }
  }

  const rows: ProjectTemplateRowInput[] = dataRows.map((rawRow) => {
    const cells: Record<string, DatabaseCellValue> = {};
    columns.forEach((col, colIdx) => {
      const rawCell = (rawRow[colIdx] ?? '').trim();
      if (col.type === 'title') {
        cells[col.id] = rawCell || 'Untitled';
      } else if (col.type === 'checkbox') {
        cells[col.id] = isBooleanString(rawCell) ?? false;
      } else if (col.type === 'number') {
        cells[col.id] = rawCell === '' ? null : Number(rawCell);
      } else if (col.type === 'date') {
        cells[col.id] = tryNormalizeDate(rawCell) ?? rawCell;
      } else if (col.type === 'select') {
        if (!rawCell) {
          cells[col.id] = null;
        } else {
          const opt = col.options?.find(
            (o) => o.label.toLowerCase() === rawCell.toLowerCase() || o.id === rawCell,
          );
          cells[col.id] = opt ? opt.id : rawCell;
        }
      } else {
        cells[col.id] = rawCell;
      }
    });
    return { cells };
  });

  const statusCol =
    columns.find((c) => /status/i.test(c.name) && c.type === 'select') ??
    columns.find((c) => c.type === 'select');

  return {
    columns,
    rows,
    groupByColumnId: statusCol?.id ?? columns[0]?.id ?? 'col_title',
  };
}

export function parseNotionCsvToDatabaseImport(
  csvText: string,
  fileName?: string,
): ParsedTemplateImport {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) {
    throw new Error('File CSV kosong atau tidak memiliki header kolom.');
  }

  const headers = matrix[0];
  const dataRows = matrix.slice(1);
  const { columns, rows, groupByColumnId } = buildDatabaseFromTableMatrix(headers, dataRows);
  const name = cleanNotionFilenameTitle(fileName);

  return {
    sourceFormat: 'notion-csv',
    name,
    icon: '🗂️',
    cover: 'nordic',
    category: 'Notion CSV Import',
    description: `Imported from CSV (${columns.length} properties, ${rows.length} rows).`,
    isDatabase: true,
    fullWidth: true,
    activeView: 'table',
    groupByColumnId,
    columns,
    rows,
    blocks: [],
    summary: `${columns.length} kolom, ${rows.length} baris dari CSV`,
  };
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function parseNotionMarkdownImport(
  mdText: string,
  fileName?: string,
): ParsedTemplateImport {
  const lines = mdText.replace(/^\uFEFF/, '').split(/\r?\n/);
  let title = cleanNotionFilenameTitle(fileName);
  let consumedTitle = false;
  const blocks: TemplateBlockInput[] = [];
  let firstTable: string[][] | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'plaintext';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', language: lang, content: codeLines.join('\n') });
      continue;
    }

    // Equation block $$ ... $$
    if (trimmed === '$$') {
      const eqLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') {
        eqLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'equation', content: eqLines.join('\n') });
      continue;
    }

    // Markdown table
    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      const tableRows: string[][] = [splitMarkdownTableRow(line)];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableRows.push(splitMarkdownTableRow(lines[i]));
        i++;
      }
      if (!firstTable) firstTable = tableRows;
      blocks.push({
        type: 'table',
        content: '',
        hasHeaderRow: true,
        rows: tableRows,
      });
      continue;
    }

    // First H1 becomes page title if we haven't consumed it yet
    if (trimmed.startsWith('# ') && !consumedTitle) {
      title = trimmed.slice(2).trim() || title;
      consumedTitle = true;
      i++;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'divider', content: '' });
    } else if (/^\[\[toc\]\]$/i.test(trimmed)) {
      blocks.push({ type: 'toc', content: '' });
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', content: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', content: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', content: trimmed.slice(2).trim() });
    } else if (/^-\s+\[(x|X| )\]\s+/.test(trimmed)) {
      const checked = /^-\s+\[(x|X)\]/.test(trimmed);
      blocks.push({
        type: 'todo',
        checked,
        content: trimmed.replace(/^-\s+\[(x|X| )\]\s+/, ''),
      });
    } else if (/^[-*]\s+/.test(trimmed)) {
      blocks.push({
        type: 'bullet',
        content: trimmed.replace(/^[-*]\s+/, ''),
      });
    } else if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({
        type: 'numbered',
        content: trimmed.replace(/^\d+\.\s+/, ''),
      });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({
        type: 'quote',
        content: trimmed.slice(2).trim(),
      });
    } else {
      blocks.push({
        type: 'paragraph',
        content: trimmed,
      });
    }
    i++;
  }

  // If Markdown is primarily a table (Notion database exported as Markdown), extract database columns/rows too
  let columns: DatabaseColumn[] = [];
  let rows: ProjectTemplateRowInput[] = [];
  let groupByColumnId: string | undefined;
  let isDatabase = false;

  if (firstTable && firstTable.length >= 1) {
    const dbBuilt = buildDatabaseFromTableMatrix(firstTable[0], firstTable.slice(1));
    columns = dbBuilt.columns;
    rows = dbBuilt.rows;
    groupByColumnId = dbBuilt.groupByColumnId;
    // Treat as database page if the markdown file basically only has the table (or single table)
    const nonTableBlocks = blocks.filter((b) => b.type !== 'table');
    isDatabase = nonTableBlocks.length === 0;
  }

  return {
    sourceFormat: 'notion-markdown',
    name: title,
    icon: isDatabase ? '🗂️' : '📝',
    cover: null,
    category: 'Notion Markdown',
    description: isDatabase
      ? `Markdown database table (${columns.length} properties, ${rows.length} rows).`
      : `Markdown template (${blocks.length} blocks${rows.length > 0 ? `, ${rows.length} table rows` : ''}).`,
    isDatabase,
    fullWidth: isDatabase,
    groupByColumnId,
    columns,
    rows,
    blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: '' }],
    summary: isDatabase
      ? `${columns.length} kolom, ${rows.length} baris dari tabel Markdown`
      : `${blocks.length} blok konten${rows.length > 0 ? ` + tabel ${rows.length} baris` : ''}`,
  };
}

export function parseUploadedTemplateFile(
  fileName: string,
  content: string,
): ParsedTemplateImport {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('File yang diupload kosong.');
  }

  const isCsvExt = /\.csv$/i.test(fileName);
  const isMdExt = /\.(md|markdown|txt)$/i.test(fileName);
  const isJsonExt = /\.json$/i.test(fileName);

  if (isJsonExt || (!isCsvExt && !isMdExt && (trimmed.startsWith('{') || trimmed.startsWith('[')))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Format JSON tidak valid. Pastikan file tidak terpotong.');
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      // Case A: plc-notion-template-v1 or single NotionTemplate JSON
      if (obj.format === 'plc-notion-template-v1' || (typeof obj.name === 'string' && ('blocks' in obj || 'database' in obj))) {
        const dbRaw = obj.database as ProjectTemplatePackage['database'] | undefined;
        const blocksRaw = Array.isArray(obj.blocks) ? (obj.blocks as TemplateBlockInput[]) : [];
        const columns = dbRaw?.columns ?? [];
        const rows = dbRaw?.rows ?? [];
        const isDb = Boolean(obj.isDatabase && dbRaw);
        return {
          sourceFormat: 'template-json',
          name: String(obj.name || dbRaw?.title || cleanNotionFilenameTitle(fileName)),
          icon: String(obj.icon || dbRaw?.icon || (isDb ? '🗂️' : '📄')),
          cover: typeof obj.cover === 'string' ? obj.cover : null,
          category: String(obj.category || 'Custom Templates'),
          description: String(obj.description || 'Imported template package'),
          isDatabase: isDb,
          font: obj.font === 'serif' || obj.font === 'mono' ? obj.font : 'sans',
          fullWidth: Boolean(obj.fullWidth ?? isDb),
          smallText: Boolean(obj.smallText),
          activeView: dbRaw?.activeView,
          groupByColumnId: dbRaw?.groupByColumnId,
          columns,
          rows,
          blocks: blocksRaw,
          summary: dbRaw
            ? `Template "${String(obj.name || dbRaw.title)}" (${columns.length} kolom, ${rows.length} baris)`
            : `Template "${String(obj.name || 'Page')}" (${blocksRaw.length} blok)`,
        };
      }

      // Case B: Full WorkspaceData backup JSON -> extract primary database/project page
      if (Array.isArray(obj.pages) && obj.databases && typeof obj.databases === 'object') {
        const ws = obj as unknown as WorkspaceData;
        const dbList = Object.values(ws.databases);
        const firstDbPage = ws.pages.find((p) => !p.isTrashed && p.isDatabase && p.databaseId && ws.databases[p.databaseId]);
        const targetDb =
          (firstDbPage?.databaseId ? ws.databases[firstDbPage.databaseId] : undefined) ?? dbList[0];
        if (targetDb) {
          return {
            sourceFormat: 'workspace-json',
            name: firstDbPage?.title || targetDb.title || cleanNotionFilenameTitle(fileName),
            icon: firstDbPage?.icon || targetDb.icon || '🗂️',
            cover: firstDbPage?.cover ?? null,
            category: 'Workspace Import',
            description: `Extracted database "${targetDb.title}" from workspace backup.`,
            isDatabase: true,
            fullWidth: true,
            activeView: targetDb.activeView,
            groupByColumnId: targetDb.groupByColumnId,
            columns: targetDb.columns,
            rows: targetDb.rows.map((r) => ({
              cells: r.cells,
              blocks: ws.blocksByPage?.[r.pageId]
                ? serializeBlocksToTemplate(ws.blocksByPage[r.pageId])
                : undefined,
            })),
            blocks: [],
            summary: `Database "${targetDb.title}" (${targetDb.columns.length} kolom, ${targetDb.rows.length} baris)`,
          };
        }
        const firstPage = ws.pages.find((p) => !p.isTrashed && !p.isRowPage);
        if (firstPage) {
          const blocks = serializeBlocksToTemplate(ws.blocksByPage?.[firstPage.id] ?? []);
          return {
            sourceFormat: 'workspace-json',
            name: firstPage.title || 'Imported Page',
            icon: firstPage.icon || '📄',
            cover: firstPage.cover ?? null,
            category: 'Workspace Import',
            description: `Extracted page "${firstPage.title}" from workspace backup.`,
            isDatabase: false,
            columns: [],
            rows: [],
            blocks,
            summary: `Halaman "${firstPage.title}" (${blocks.length} blok)`,
          };
        }
      }
    }

    throw new Error('Struktur JSON template tidak dikenali. Gunakan file hasil Export Template (.json) atau backup workspace.');
  }

  if (isCsvExt) {
    return parseNotionCsvToDatabaseImport(content, fileName);
  }

  return parseNotionMarkdownImport(content, fileName);
}

export interface MergedDatabaseResult {
  nextDatabase: Database;
  addedRows: DatabaseRow[];
  addedRowPages: Page[];
  addedBlocksByPage: Record<string, Block[]>;
  removedRowIds: string[];
  removedRowPageIds: string[];
}

export function mergeImportIntoDatabase(
  targetDb: Database,
  imported: ParsedTemplateImport,
  mode: 'append' | 'replace',
  parentPageId: string,
): MergedDatabaseResult {
  const now = new Date().toISOString();

  if (imported.columns.length === 0 && imported.rows.length === 0) {
    throw new Error('File yang diupload tidak berisi data tabel/database untuk digabungkan ke project.');
  }

  if (mode === 'replace') {
    const nextColumns: DatabaseColumn[] = imported.columns.map((c) => ({
      ...c,
      options: c.options ? c.options.map((o) => ({ ...o })) : undefined,
    }));
    const titleCol = nextColumns.find((c) => c.type === 'title') ?? nextColumns[0];
    const addedRows: DatabaseRow[] = [];
    const addedRowPages: Page[] = [];
    const addedBlocksByPage: Record<string, Block[]> = {};

    imported.rows.forEach((rowInput, idx) => {
      const rowId = createId('row');
      const rowPageId = createId('rowp');
      const rowTitle = String((titleCol ? rowInput.cells[titleCol.id] : '') || `Item ${idx + 1}`);
      addedRowPages.push({
        id: rowPageId,
        parentId: parentPageId,
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
        isRowPage: true,
        locked: false,
        position: idx,
        createdAt: now,
        updatedAt: now,
      });
      addedBlocksByPage[rowPageId] = (rowInput.blocks ?? []).map((b, bIdx) => ({
        id: createId('blk'),
        pageId: rowPageId,
        type: b.type,
        content: b.content,
        checked: b.checked,
        open: b.open,
        details: b.details,
        icon: b.icon,
        language: b.language,
        color: b.color,
        indent: b.indent,
        rows: b.rows,
        hasHeaderRow: b.hasHeaderRow,
        url: b.url,
        caption: b.caption,
        position: bIdx,
      }));
      addedRows.push({
        id: rowId,
        databaseId: targetDb.id,
        pageId: rowPageId,
        cells: { ...rowInput.cells },
        position: idx,
        createdAt: now,
        updatedAt: now,
      });
    });

    const removedRowIds = targetDb.rows.map((r) => r.id);
    const removedRowPageIds = targetDb.rows.map((r) => r.pageId);
    const nextGroupBy =
      imported.groupByColumnId && nextColumns.some((c) => c.id === imported.groupByColumnId)
        ? imported.groupByColumnId
        : nextColumns.find((c) => c.type === 'select')?.id ?? nextColumns[0]?.id ?? 'col_title';

    return {
      nextDatabase: {
        ...targetDb,
        columns: nextColumns,
        groupByColumnId: nextGroupBy,
        rows: addedRows,
      },
      addedRows,
      addedRowPages,
      addedBlocksByPage,
      removedRowIds,
      removedRowPageIds,
    };
  }

  // APPEND mode: align columns by name or title type, auto-add missing columns & select options
  const nextColumns: DatabaseColumn[] = targetDb.columns.map((c) => ({
    ...c,
    options: c.options ? c.options.map((o) => ({ ...o })) : undefined,
  }));

  const targetTitleCol = nextColumns.find((c) => c.type === 'title') ?? nextColumns[0];
  const colMapping = new Map<string, DatabaseColumn>();

  for (const impCol of imported.columns) {
    if (impCol.type === 'title' && targetTitleCol) {
      colMapping.set(impCol.id, targetTitleCol);
      continue;
    }
    const existingByName = nextColumns.find(
      (c) => c.name.trim().toLowerCase() === impCol.name.trim().toLowerCase(),
    );
    if (existingByName) {
      colMapping.set(impCol.id, existingByName);
    } else {
      const cloned: DatabaseColumn = {
        ...impCol,
        id: nextColumns.some((c) => c.id === impCol.id) ? createId('col') : impCol.id,
        options: impCol.options ? impCol.options.map((o) => ({ ...o })) : undefined,
      };
      nextColumns.push(cloned);
      colMapping.set(impCol.id, cloned);
    }
  }

  const basePos = targetDb.rows.length;
  const addedRows: DatabaseRow[] = [];
  const addedRowPages: Page[] = [];
  const addedBlocksByPage: Record<string, Block[]> = {};

  imported.rows.forEach((rowInput, idx) => {
    const mappedCells: Record<string, DatabaseCellValue> = {};

    for (const impCol of imported.columns) {
      const targetCol = colMapping.get(impCol.id);
      if (!targetCol) continue;
      let val = rowInput.cells[impCol.id];
      if (val === undefined) continue;

      if (targetCol.type === 'select' && typeof val === 'string' && val.trim()) {
        // Resolve human label from impCol.options if present
        const impOpt = impCol.options?.find((o) => o.id === val || o.label === val);
        const label = impOpt ? impOpt.label : val.trim();
        if (!targetCol.options) targetCol.options = [];
        let matched = targetCol.options.find(
          (o) => o.id === val || o.label.toLowerCase() === label.toLowerCase(),
        );
        if (!matched) {
          const optIdx = targetCol.options.length;
          let newId = slugifyOptionId(label, optIdx);
          if (targetCol.options.some((o) => o.id === newId)) {
            newId = `${newId}_${optIdx + 1}`;
          }
          matched = {
            id: newId,
            label,
            color: impOpt?.color ?? inferOptionColor(label, optIdx),
          };
          targetCol.options.push(matched);
        }
        val = matched.id;
      } else if (targetCol.type === 'multi_select') {
        const items = Array.isArray(val) ? val : String(val).split(',').map((s) => s.trim()).filter(Boolean);
        if (!targetCol.options) targetCol.options = [];
        val = items.map((item) => {
          const impOpt = impCol.options?.find((o) => o.id === item || o.label === item);
          const label = impOpt ? impOpt.label : item;
          let matched = targetCol.options!.find(
            (o) => o.id === item || o.label.toLowerCase() === label.toLowerCase(),
          );
          if (!matched) {
            const optIdx = targetCol.options!.length;
            matched = {
              id: slugifyOptionId(label, optIdx),
              label,
              color: impOpt?.color ?? inferOptionColor(label, optIdx),
            };
            targetCol.options!.push(matched);
          }
          return matched.id;
        });
      } else if (impCol.options && typeof val === 'string') {
        const impOpt = impCol.options.find((o) => o.id === val);
        if (impOpt) {
          val = impOpt.label;
        }
      }

      mappedCells[targetCol.id] = val;
    }

    const rowId = createId('row');
    const rowPageId = createId('rowp');
    const rowTitle = String((targetTitleCol ? mappedCells[targetTitleCol.id] : '') || `Item ${basePos + idx + 1}`);

    addedRowPages.push({
      id: rowPageId,
      parentId: parentPageId,
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
      isRowPage: true,
      locked: false,
      position: basePos + idx,
      createdAt: now,
      updatedAt: now,
    });

    addedBlocksByPage[rowPageId] = (rowInput.blocks ?? []).map((b, bIdx) => ({
      id: createId('blk'),
      pageId: rowPageId,
      type: b.type,
      content: b.content,
      checked: b.checked,
      open: b.open,
      details: b.details,
      icon: b.icon,
      language: b.language,
      color: b.color,
      indent: b.indent,
      rows: b.rows,
      hasHeaderRow: b.hasHeaderRow,
      url: b.url,
      caption: b.caption,
      position: bIdx,
    }));

    addedRows.push({
      id: rowId,
      databaseId: targetDb.id,
      pageId: rowPageId,
      cells: mappedCells,
      position: basePos + idx,
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    nextDatabase: {
      ...targetDb,
      columns: nextColumns,
      rows: [...targetDb.rows, ...addedRows],
    },
    addedRows,
    addedRowPages,
    addedBlocksByPage,
    removedRowIds: [],
    removedRowPageIds: [],
  };
}

export interface CreatedProjectBundle {
  page: Page;
  blocks: Block[];
  database?: Database;
  rowPages: Page[];
  rowBlocksByPage: Record<string, Block[]>;
}

export function createProjectFromTemplateImport(
  imported: ParsedTemplateImport,
  position: number,
  parentId: string | null = null,
): CreatedProjectBundle {
  const now = new Date().toISOString();
  const pageId = createId('page');
  const hasDb = imported.isDatabase || (imported.columns.length > 0 && imported.rows.length > 0 && imported.blocks.length === 0);
  const dbId = hasDb ? createId('db') : null;

  const page: Page = {
    id: pageId,
    parentId,
    title: imported.name || 'Imported Project',
    icon: imported.icon || (hasDb ? '🗂️' : '📄'),
    cover: imported.cover ?? null,
    coverPosition: 50,
    font: imported.font ?? 'sans',
    smallText: Boolean(imported.smallText),
    fullWidth: imported.fullWidth ?? hasDb,
    isFavorite: false,
    isTrashed: false,
    isDatabase: hasDb,
    databaseId: dbId,
    isRowPage: false,
    locked: false,
    position,
    createdAt: now,
    updatedAt: now,
  };

  if (hasDb && dbId) {
    const columns: DatabaseColumn[] =
      imported.columns.length > 0
        ? imported.columns.map((c) => ({
            ...c,
            options: c.options ? c.options.map((o) => ({ ...o })) : undefined,
          }))
        : [{ id: 'col_title', name: 'Name', type: 'title', width: 220 }];
    const titleCol = columns.find((c) => c.type === 'title') ?? columns[0];
    const rowPages: Page[] = [];
    const rowBlocksByPage: Record<string, Block[]> = {};
    const rows: DatabaseRow[] = imported.rows.map((r, idx) => {
      const rowId = createId('row');
      const rowPageId = createId('rowp');
      const rowTitle = String((titleCol ? r.cells[titleCol.id] : '') || `Item ${idx + 1}`);
      rowPages.push({
        id: rowPageId,
        parentId: pageId,
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
        isRowPage: true,
        locked: false,
        position: idx,
        createdAt: now,
        updatedAt: now,
      });
      rowBlocksByPage[rowPageId] = (r.blocks ?? []).map((b, bIdx) => ({
        id: createId('blk'),
        pageId: rowPageId,
        type: b.type,
        content: b.content,
        checked: b.checked,
        open: b.open,
        details: b.details,
        icon: b.icon,
        language: b.language,
        color: b.color,
        indent: b.indent,
        rows: b.rows,
        hasHeaderRow: b.hasHeaderRow,
        url: b.url,
        caption: b.caption,
        position: bIdx,
      }));
      return {
        id: rowId,
        databaseId: dbId,
        pageId: rowPageId,
        cells: { ...r.cells },
        position: idx,
        createdAt: now,
        updatedAt: now,
      };
    });

    const database: Database = {
      id: dbId,
      title: page.title,
      icon: page.icon,
      activeView: imported.activeView ?? 'table',
      groupByColumnId:
        imported.groupByColumnId && columns.some((c) => c.id === imported.groupByColumnId)
          ? imported.groupByColumnId
          : columns.find((c) => c.type === 'select')?.id ?? columns[0].id,
      columns,
      rows,
    };

    return {
      page,
      blocks: [],
      database,
      rowPages,
      rowBlocksByPage,
    };
  }

  const blocks: Block[] =
    imported.blocks.length > 0
      ? imported.blocks.map((b, idx) => ({
          id: createId('blk'),
          pageId,
          type: b.type,
          content: b.content,
          checked: b.checked,
          open: b.open,
          details: b.details,
          icon: b.icon,
          language: b.language,
          color: b.color,
          indent: b.indent,
          rows: b.rows,
          hasHeaderRow: b.hasHeaderRow,
          url: b.url,
          caption: b.caption,
          position: idx,
        }))
      : [
          {
            id: createId('blk'),
            pageId,
            type: 'paragraph',
            content: '',
            position: 0,
          },
        ];

  return {
    page,
    blocks,
    rowPages: [],
    rowBlocksByPage: {},
  };
}

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType: string,
  addUtf8Bom = false,
): void {
  const payload = addUtf8Bom ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFileSlug(title: string, fallback = 'project-template'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function describeBlocksSummary(blocks: Block[]): string {
  const firstText = blocks.map((b) => stripHtmlToText(b.content)).find((t) => t.length > 0);
  return firstText ? firstText.slice(0, 100) : `${blocks.length} content blocks`;
}
