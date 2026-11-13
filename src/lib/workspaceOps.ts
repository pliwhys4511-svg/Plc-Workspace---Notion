import type {
  Block,
  BlockType,
  Database,
  DatabaseColumn,
  DatabaseRow,
  Page,
  PageTreeNode,
  SearchHit,
} from './types';

export function createId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36).slice(-5);
  return `${prefix}_${time}${rand}`;
}

export function buildPageTree(
  pages: Page[],
  parentId: string | null = null,
): PageTreeNode[] {
  return pages
    .filter((p) => !p.isTrashed && !p.isRowPage && p.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map((page) => ({
      page,
      children: buildPageTree(pages, page.id),
    }));
}

export function getBreadcrumbs(pages: Page[], pageId: string): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail: Page[] = [];
  const visited = new Set<string>();
  let curr = byId.get(pageId);
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    trail.unshift(curr);
    curr = curr.parentId ? byId.get(curr.parentId) : undefined;
  }
  return trail;
}

export function getDescendantIds(pages: Page[], rootId: string): string[] {
  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>([rootId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const p of pages) {
      if (p.parentId === current && !seen.has(p.id)) {
        seen.add(p.id);
        result.push(p.id);
        queue.push(p.id);
      }
    }
  }
  return result;
}

export function canMovePage(
  pages: Page[],
  pageId: string,
  targetParentId: string | null,
): boolean {
  if (targetParentId === null) return true;
  if (targetParentId === pageId) return false;
  const descendants = new Set(getDescendantIds(pages, pageId));
  return !descendants.has(targetParentId);
}

export interface MarkdownShortcutResult {
  type: BlockType;
  content: string;
  checked?: boolean;
}

export function parseMarkdownShortcut(rawText: string): MarkdownShortcutResult | null {
  if (rawText === '---' || rawText === '***') {
    return { type: 'divider', content: '' };
  }
  if (rawText === '```') {
    return { type: 'code', content: '' };
  }
  if (rawText === '$$') {
    return { type: 'equation', content: '' };
  }
  if (rawText === '/toc') {
    return { type: 'toc', content: '' };
  }
  if (rawText.startsWith('### ')) {
    return { type: 'h3', content: rawText.slice(4) };
  }
  if (rawText.startsWith('## ')) {
    return { type: 'h2', content: rawText.slice(3) };
  }
  if (rawText.startsWith('# ')) {
    return { type: 'h1', content: rawText.slice(2) };
  }
  if (rawText.startsWith('[] ') || rawText.startsWith('[ ] ')) {
    const offset = rawText.startsWith('[] ') ? 3 : 4;
    return { type: 'todo', content: rawText.slice(offset), checked: false };
  }
  if (rawText.startsWith('[x] ') || rawText.startsWith('[X] ')) {
    return { type: 'todo', content: rawText.slice(4), checked: true };
  }
  if (rawText.startsWith('- ') || rawText.startsWith('* ')) {
    return { type: 'bullet', content: rawText.slice(2) };
  }
  if (/^\d+\.\s/.test(rawText)) {
    return { type: 'numbered', content: rawText.replace(/^\d+\.\s/, '') };
  }
  if (rawText.startsWith('> ')) {
    return { type: 'quote', content: rawText.slice(2) };
  }
  return null;
}

export function normalizePositions(blocks: Block[]): Block[] {
  return blocks.map((b, idx) => ({ ...b, position: idx }));
}

export function insertBlockAfter(
  blocks: Block[],
  afterBlockId: string | null,
  newBlock: Block,
): Block[] {
  if (!afterBlockId) {
    return normalizePositions([...blocks, newBlock]);
  }
  const idx = blocks.findIndex((b) => b.id === afterBlockId);
  if (idx === -1) {
    return normalizePositions([...blocks, newBlock]);
  }
  const next = [...blocks];
  next.splice(idx + 1, 0, newBlock);
  return normalizePositions(next);
}

export function deleteBlockAt(blocks: Block[], blockId: string): Block[] {
  const filtered = blocks.filter((b) => b.id !== blockId);
  return normalizePositions(filtered);
}

export function moveBlockByOffset(
  blocks: Block[],
  blockId: string,
  offset: -1 | 1,
): Block[] {
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx === -1) return blocks;
  const target = idx + offset;
  if (target < 0 || target >= blocks.length) return blocks;
  const copy = [...blocks];
  const [item] = copy.splice(idx, 1);
  copy.splice(target, 0, item);
  return normalizePositions(copy);
}

export function reorderBlock(
  blocks: Block[],
  draggedId: string,
  targetId: string,
  placement: 'before' | 'after',
): Block[] {
  if (draggedId === targetId) return blocks;
  const fromIdx = blocks.findIndex((b) => b.id === draggedId);
  const toIdx = blocks.findIndex((b) => b.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return blocks;

  const copy = [...blocks];
  const [dragged] = copy.splice(fromIdx, 1);
  const adjustedTargetIdx = copy.findIndex((b) => b.id === targetId);
  const insertAt = placement === 'before' ? adjustedTargetIdx : adjustedTargetIdx + 1;
  copy.splice(insertAt, 0, dragged);
  return normalizePositions(copy);
}

export function getNumberedListIndex(blocks: Block[], index: number): number {
  const targetIndent = blocks[index]?.indent ?? 0;
  let count = 1;
  for (let i = index - 1; i >= 0; i--) {
    const prev = blocks[i];
    if (!prev || prev.type !== 'numbered') break;
    const prevIndent = prev.indent ?? 0;
    if (prevIndent < targetIndent) break;
    if (prevIndent === targetIndent) count += 1;
  }
  return count;
}

export function formatNumberedMarker(count: number, indent = 0): string {
  const level = indent % 3;
  if (level === 1) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return `${letters[(count - 1) % 26]}.`;
  }
  if (level === 2) {
    const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
    return `${romans[(count - 1) % romans.length]}.`;
  }
  return `${count}.`;
}

export interface TocHeading {
  blockId: string;
  level: 1 | 2 | 3;
  text: string;
}

export function extractHeadingsForToc(blocks: Block[]): TocHeading[] {
  const headings: TocHeading[] = [];
  for (const b of blocks) {
    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
      const text = stripHtmlToText(b.content);
      if (text) {
        headings.push({
          blockId: b.id,
          level: b.type === 'h1' ? 1 : b.type === 'h2' ? 2 : 3,
          text,
        });
      }
    }
  }
  return headings;
}

export interface RowFilterSortOptions {
  search?: string;
  filterColumnId?: string;
  filterValue?: string;
  sortColumnId?: string;
  sortDirection?: 'asc' | 'desc';
}

export function filterAndSortRows(
  database: Database,
  options: RowFilterSortOptions = {},
): DatabaseRow[] {
  const {
    search = '',
    filterColumnId = '',
    filterValue = '',
    sortColumnId = '',
    sortDirection = 'asc',
  } = options;

  const query = search.trim().toLowerCase();

  let rows = database.rows.filter((row) => {
    if (filterColumnId && filterValue) {
      const cell = row.cells[filterColumnId];
      if (Array.isArray(cell)) {
        if (!cell.includes(filterValue)) return false;
      } else if (typeof cell === 'boolean') {
        if (String(cell) !== filterValue) return false;
      } else if (String(cell ?? '') !== filterValue) {
        return false;
      }
    }

    if (query) {
      const matchesAnyCell = Object.values(row.cells).some((val) => {
        if (val === null || val === undefined) return false;
        if (Array.isArray(val)) return val.some((v) => v.toLowerCase().includes(query));
        return String(val).toLowerCase().includes(query);
      });
      if (!matchesAnyCell) return false;
    }

    return true;
  });

  if (sortColumnId) {
    const col = database.columns.find((c) => c.id === sortColumnId);
    const dir = sortDirection === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = a.cells[sortColumnId];
      const bv = b.cells[sortColumnId];
      if (col?.type === 'number') {
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      }
      if (col?.type === 'checkbox') {
        return (Number(Boolean(av)) - Number(Boolean(bv))) * dir;
      }
      const as = Array.isArray(av) ? av.join(', ') : String(av ?? '');
      const bs = Array.isArray(bv) ? bv.join(', ') : String(bv ?? '');
      return as.localeCompare(bs) * dir;
    });
  } else {
    rows = [...rows].sort((a, b) => a.position - b.position);
  }

  return rows;
}

export interface BoardColumnGroup {
  key: string;
  label: string;
  color: string;
  rows: DatabaseRow[];
}

export function groupRowsByColumn(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  groupColId: string,
): BoardColumnGroup[] {
  const groupCol = columns.find((c) => c.id === groupColId);
  const options = groupCol?.options ?? [];

  const groups: BoardColumnGroup[] = options.map((opt) => ({
    key: opt.id,
    label: opt.label,
    color: opt.color,
    rows: [],
  }));

  const uncategorized: DatabaseRow[] = [];

  for (const row of rows) {
    const raw = row.cells[groupColId];
    if (Array.isArray(raw)) {
      const matched = groups.filter((g) => raw.includes(g.key) || raw.includes(g.label));
      if (matched.length > 0) {
        for (const m of matched) m.rows.push(row);
      } else {
        uncategorized.push(row);
      }
    } else {
      const match = groups.find((g) => g.key === raw || g.label === raw);
      if (match) {
        match.rows.push(row);
      } else {
        uncategorized.push(row);
      }
    }
  }

  if (uncategorized.length > 0 || groups.length === 0) {
    groups.push({
      key: '__none__',
      label: 'Uncategorized',
      color: 'gray',
      rows: uncategorized,
    });
  }

  return groups;
}

export function stripHtmlToText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function sanitizeInlineHtml(html: string): string {
  // Preserve safe inline Notion formatting tags (b, strong, i, em, u, s, strike, code, a, span, br)
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export function renderPageToMarkdown(
  page: Page,
  blocks: Block[],
  databases: Record<string, Database>,
): string {
  const lines: string[] = [`# ${page.title || 'Untitled'}`, ''];
  let numberedCounter = 0;

  for (const block of blocks) {
    const text = stripHtmlToText(block.content);
    const pad = '  '.repeat(block.indent ?? 0);
    if (block.type !== 'numbered') {
      numberedCounter = 0;
    }

    switch (block.type) {
      case 'h1':
        lines.push(`# ${text}`, '');
        break;
      case 'h2':
        lines.push(`## ${text}`, '');
        break;
      case 'h3':
        lines.push(`### ${text}`, '');
        break;
      case 'todo':
        lines.push(`${pad}- [${block.checked ? 'x' : ' '}] ${text}`);
        break;
      case 'bullet':
        lines.push(`${pad}- ${text}`);
        break;
      case 'numbered':
        numberedCounter += 1;
        lines.push(`${pad}${numberedCounter}. ${text}`);
        break;
      case 'toggle':
        lines.push(`> **${text}**`);
        if (block.details) lines.push(`> ${stripHtmlToText(block.details)}`);
        lines.push('');
        break;
      case 'callout':
        lines.push(`> ${block.icon || '💡'} ${text}`, '');
        break;
      case 'quote':
        lines.push(`> ${text}`, '');
        break;
      case 'equation':
        lines.push('$$', text, '$$', '');
        break;
      case 'code':
        lines.push(`\`\`\`${block.language || ''}`, block.content, '```', '');
        break;
      case 'divider':
        lines.push('---', '');
        break;
      case 'image':
        lines.push(`![${block.caption || 'image'}](${block.url || ''})`, '');
        break;
      case 'bookmark':
        lines.push(`[${text || block.url || 'Bookmark'}](${block.url || ''})`, '');
        break;
      case 'toc':
        lines.push('[[TOC]]', '');
        break;
      case 'table': {
        const rows = block.rows ?? [['Column 1', 'Column 2'], ['', '']];
        if (rows.length > 0) {
          lines.push(`| ${rows[0].join(' | ')} |`);
          lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
          for (let i = 1; i < rows.length; i++) {
            lines.push(`| ${rows[i].join(' | ')} |`);
          }
          lines.push('');
        }
        break;
      }
      case 'database': {
        const db = block.databaseId ? databases[block.databaseId] : undefined;
        if (db) {
          lines.push(`### ${db.title}`, '');
          const headers = db.columns.map((c) => c.name);
          lines.push(`| ${headers.join(' | ')} |`);
          lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
          for (const row of db.rows) {
            const vals = db.columns.map((col) => {
              const v = row.cells[col.id];
              if (Array.isArray(v)) return v.join(', ');
              if (typeof v === 'boolean') return v ? 'Yes' : 'No';
              return String(v ?? '');
            });
            lines.push(`| ${vals.join(' | ')} |`);
          }
          lines.push('');
        }
        break;
      }
      case 'page_link':
        lines.push(`- [[${text || 'Linked Page'}]]`);
        break;
      default:
        lines.push(text, '');
        break;
    }
  }

  return lines.join('\n').trim() + '\n';
}

export function searchWorkspace(
  pages: Page[],
  blocksByPage: Record<string, Block[]>,
  databases: Record<string, Database>,
  query: string,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  const activePages = pages.filter((p) => !p.isTrashed && !p.isRowPage);

  if (!q) {
    return activePages.slice(0, 12).map((p) => ({
      pageId: p.id,
      title: p.title || 'Untitled',
      icon: p.icon,
      snippet: p.isDatabase ? 'Database' : 'Page',
      matchType: 'title',
      breadcrumb: getBreadcrumbs(pages, p.id)
        .slice(0, -1)
        .map((b) => b.title || 'Untitled')
        .join(' / '),
    }));
  }

  const hits: SearchHit[] = [];
  const seenPageIds = new Set<string>();

  for (const page of activePages) {
    const breadcrumb = getBreadcrumbs(pages, page.id)
      .slice(0, -1)
      .map((b) => b.title || 'Untitled')
      .join(' / ');

    if (page.title.toLowerCase().includes(q)) {
      seenPageIds.add(page.id);
      hits.push({
        pageId: page.id,
        title: page.title || 'Untitled',
        icon: page.icon,
        snippet: page.isDatabase ? 'Database match' : 'Page title match',
        matchType: 'title',
        breadcrumb,
      });
    }
  }

  for (const page of activePages) {
    if (seenPageIds.has(page.id)) continue;
    const blocks = blocksByPage[page.id] ?? [];
    for (const block of blocks) {
      const text = stripHtmlToText(block.content);
      const details = block.details ? stripHtmlToText(block.details) : '';
      const tableText = block.rows ? block.rows.flat().join(' ') : '';
      const combined = `${text} ${details} ${tableText}`.trim();
      if (combined.toLowerCase().includes(q)) {
        seenPageIds.add(page.id);
        const breadcrumb = getBreadcrumbs(pages, page.id)
          .slice(0, -1)
          .map((b) => b.title || 'Untitled')
          .join(' / ');
        hits.push({
          pageId: page.id,
          title: page.title || 'Untitled',
          icon: page.icon,
          snippet: combined.slice(0, 120),
          matchType: 'block',
          breadcrumb,
        });
        break;
      }
    }
  }

  for (const page of activePages) {
    if (seenPageIds.has(page.id) || !page.databaseId) continue;
    const db = databases[page.databaseId];
    if (!db) continue;
    for (const row of db.rows) {
      const text = Object.values(row.cells)
        .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
        .join(' ');
      if (text.toLowerCase().includes(q)) {
        seenPageIds.add(page.id);
        const breadcrumb = getBreadcrumbs(pages, page.id)
          .slice(0, -1)
          .map((b) => b.title || 'Untitled')
          .join(' / ');
        hits.push({
          pageId: page.id,
          title: page.title || 'Untitled',
          icon: page.icon,
          snippet: text.slice(0, 120),
          matchType: 'database',
          breadcrumb,
        });
        break;
      }
    }
  }

  return hits;
}
