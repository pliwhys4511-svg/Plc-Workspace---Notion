import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageTree,
  canMovePage,
  deleteBlockAt,
  extractHeadingsForToc,
  filterAndSortRows,
  formatNumberedMarker,
  getBreadcrumbs,
  getDescendantIds,
  getNumberedListIndex,
  groupRowsByColumn,
  insertBlockAfter,
  moveBlockByOffset,
  parseMarkdownShortcut,
  renderPageToMarkdown,
  reorderBlock,
  searchWorkspace,
} from './workspaceOps';
import { createSeedWorkspace } from './seedData';
import {
  deserializeTableRows,
  sanitizeBlockForCloud,
  sanitizePageForCloud,
  serializeTableRows,
} from './firestoreSerializer';
import type { Block } from './types';

test('buildPageTree orders pages hierarchically and excludes trashed and row pages', () => {
  const seed = createSeedWorkspace();
  const tree = buildPageTree(seed.pages, null);
  assert.equal(tree.length, 4);
  assert.equal(tree[0].page.id, 'page_home');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].page.id, 'page_shortcuts');
  assert.equal(tree[1].children.length, 0);
});

test('getBreadcrumbs returns ordered ancestor chain and prevents cycles', () => {
  const seed = createSeedWorkspace();
  const trail = getBreadcrumbs(seed.pages, 'page_shortcuts');
  assert.deepEqual(
    trail.map((p) => p.id),
    ['page_home', 'page_shortcuts'],
  );
});

test('canMovePage prevents circular parent assignment', () => {
  const seed = createSeedWorkspace();
  assert.equal(canMovePage(seed.pages, 'page_home', 'page_shortcuts'), false);
  assert.equal(canMovePage(seed.pages, 'page_home', 'page_home'), false);
  assert.equal(canMovePage(seed.pages, 'page_meeting', 'page_home'), true);
  assert.deepEqual(getDescendantIds(seed.pages, 'page_home'), ['page_shortcuts']);
});

test('parseMarkdownShortcut recognizes Notion markdown triggers', () => {
  assert.deepEqual(parseMarkdownShortcut('# Heading'), { type: 'h1', content: 'Heading' });
  assert.deepEqual(parseMarkdownShortcut('## Subheading'), { type: 'h2', content: 'Subheading' });
  assert.deepEqual(parseMarkdownShortcut('### Section'), { type: 'h3', content: 'Section' });
  assert.deepEqual(parseMarkdownShortcut('- Bullet item'), { type: 'bullet', content: 'Bullet item' });
  assert.deepEqual(parseMarkdownShortcut('1. First'), { type: 'numbered', content: 'First' });
  assert.deepEqual(parseMarkdownShortcut('[] Task'), { type: 'todo', content: 'Task', checked: false });
  assert.deepEqual(parseMarkdownShortcut('[x] Done'), { type: 'todo', content: 'Done', checked: true });
  assert.deepEqual(parseMarkdownShortcut('> Quote'), { type: 'quote', content: 'Quote' });
  assert.deepEqual(parseMarkdownShortcut('---'), { type: 'divider', content: '' });
  assert.deepEqual(parseMarkdownShortcut('```'), { type: 'code', content: '' });
  assert.deepEqual(parseMarkdownShortcut('$$'), { type: 'equation', content: '' });
  assert.equal(parseMarkdownShortcut('Normal text'), null);
});

test('block insert, move, reorder, delete, and nested numbered markers work accurately', () => {
  const makeBlock = (id: string, type: Block['type'], pos: number, indent = 0): Block => ({
    id,
    pageId: 'p1',
    type,
    content: id,
    indent,
    position: pos,
  });

  let blocks: Block[] = [
    makeBlock('b1', 'numbered', 0, 0),
    makeBlock('b2', 'numbered', 1, 1),
    makeBlock('b3', 'numbered', 2, 0),
  ];

  assert.equal(getNumberedListIndex(blocks, 0), 1);
  assert.equal(getNumberedListIndex(blocks, 1), 1);
  assert.equal(formatNumberedMarker(1, 1), 'a.');
  assert.equal(getNumberedListIndex(blocks, 2), 2);

  blocks = insertBlockAfter(blocks, 'b2', makeBlock('b2b', 'numbered', 0, 1));
  assert.deepEqual(blocks.map((b) => b.id), ['b1', 'b2', 'b2b', 'b3']);
  assert.equal(formatNumberedMarker(getNumberedListIndex(blocks, 2), 1), 'b.');

  blocks = moveBlockByOffset(blocks, 'b3', -1);
  assert.deepEqual(blocks.map((b) => b.id), ['b1', 'b2', 'b3', 'b2b']);

  blocks = reorderBlock(blocks, 'b2b', 'b1', 'before');
  assert.deepEqual(blocks.map((b) => b.id), ['b2b', 'b1', 'b2', 'b3']);

  blocks = deleteBlockAt(blocks, 'b2');
  assert.deepEqual(blocks.map((b) => b.id), ['b2b', 'b1', 'b3']);
});

test('extractHeadingsForToc and Markdown export handle tables and equations', () => {
  const seed = createSeedWorkspace();
  const homePage = seed.pages.find((p) => p.id === 'page_home')!;
  const extraBlocks: Block[] = [
    ...seed.blocksByPage.page_home,
    {
      id: 'blk_tbl',
      pageId: 'page_home',
      type: 'table',
      content: '',
      rows: [
        ['Feature', 'Status'],
        ['Offline PWA', 'Ready'],
      ],
      position: 99,
    },
    {
      id: 'blk_eq',
      pageId: 'page_home',
      type: 'equation',
      content: 'E = mc^2',
      position: 100,
    },
  ];
  const toc = extractHeadingsForToc(extraBlocks);
  assert.ok(toc.some((h) => h.text === 'Core Editing Workflows' && h.level === 2));

  const md = renderPageToMarkdown(homePage, extraBlocks, seed.databases);
  assert.ok(md.includes('| Feature | Status |'));
  assert.ok(md.includes('E = mc^2'));
});

test('filterAndSortRows and groupRowsByColumn support Table and Kanban Board views', () => {
  const seed = createSeedWorkspace();
  const db = seed.databases.db_roadmap;

  const doneOnly = filterAndSortRows(db, {
    filterColumnId: 'col_status',
    filterValue: 'done',
  });
  assert.equal(doneOnly.length, 2);

  const searched = filterAndSortRows(db, { search: 'docker' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 'row_2');

  const sortedDesc = filterAndSortRows(db, {
    sortColumnId: 'col_title',
    sortDirection: 'desc',
  });
  assert.equal(sortedDesc[0].id, 'row_2');

  const groups = groupRowsByColumn(db.rows, db.columns, 'col_status');
  assert.equal(groups.length, 4);
  const doneGroup = groups.find((g) => g.key === 'done');
  assert.equal(doneGroup?.rows.length, 2);

  const categoryGroups = groupRowsByColumn(db.rows, db.columns, 'col_category');
  assert.equal(categoryGroups.length, 5);
  assert.equal(categoryGroups.find((g) => g.key === 'editor')?.rows.length, 1);
  assert.equal(categoryGroups.find((g) => g.key === 'infra')?.rows.length, 1);

  const multiSelectGroups = groupRowsByColumn(
    [
      {
        id: 'r_ms1',
        databaseId: 'db_ms',
        pageId: 'rp_1',
        position: 0,
        createdAt: '',
        updatedAt: '',
        cells: { col_tags: ['work', 'ideas'] },
      },
      {
        id: 'r_ms2',
        databaseId: 'db_ms',
        pageId: 'rp_2',
        position: 1,
        createdAt: '',
        updatedAt: '',
        cells: { col_tags: [] },
      },
    ],
    [
      {
        id: 'col_tags',
        name: 'Category',
        type: 'multi_select',
        options: [
          { id: 'work', label: 'Work', color: 'blue' },
          { id: 'ideas', label: 'Ideas', color: 'purple' },
        ],
      },
    ],
    'col_tags',
  );
  assert.equal(multiSelectGroups.find((g) => g.key === 'work')?.rows.length, 1);
  assert.equal(multiSelectGroups.find((g) => g.key === 'ideas')?.rows.length, 1);
  assert.equal(multiSelectGroups.find((g) => g.key === '__none__')?.label, 'Uncategorized');
  assert.equal(multiSelectGroups.find((g) => g.key === '__none__')?.rows.length, 1);
});

test('renderPageToMarkdown and searchWorkspace produce accurate output', () => {
  const seed = createSeedWorkspace();
  const homePage = seed.pages.find((p) => p.id === 'page_home')!;
  const md = renderPageToMarkdown(homePage, seed.blocksByPage.page_home, seed.databases);
  assert.ok(md.includes('# Getting Started'));
  assert.ok(md.includes('- [x] Explore nested pages'));

  const hits = searchWorkspace(seed.pages, seed.blocksByPage, seed.databases, 'Docker');
  assert.ok(hits.length >= 2);
});

test('Firestore serializer converts nested table rows and enforces payload bounds', () => {
  const rows = [
    ['Col A', 'Col B'],
    ['Val 1', 'Val 2'],
  ];
  const serialized = serializeTableRows(rows);
  assert.deepEqual(serialized, [{ cells: ['Col A', 'Col B'] }, { cells: ['Val 1', 'Val 2'] }]);
  assert.deepEqual(deserializeTableRows(serialized), rows);

  const sanitizedBlk = sanitizeBlockForCloud(
    'user_123',
    {
      id: 'blk_1',
      pageId: 'page_1',
      type: 'table',
      content: '',
      rows,
      position: 999999,
    },
    'ts',
  );
  assert.equal(sanitizedBlk.position, 100000);
  assert.equal(sanitizedBlk.ownerId, 'user_123');
  assert.ok(!('rows' in sanitizedBlk));
  assert.deepEqual(sanitizedBlk.tableRows, serialized);

  const sanitizedPage = sanitizePageForCloud(
    'user_123',
    {
      id: 'page/bad id',
      parentId: null,
      title: 'A'.repeat(400),
      icon: '📄',
      cover: null,
      coverPosition: 150,
      font: 'sans',
      smallText: false,
      fullWidth: false,
      isFavorite: false,
      isTrashed: false,
      isDatabase: false,
      locked: false,
      position: -5,
      createdAt: '',
      updatedAt: '',
    },
    'ts',
    'ts',
  );
  assert.equal(sanitizedPage.id, 'page_bad_id');
  assert.equal(String(sanitizedPage.title).length, 300);
  assert.equal(sanitizedPage.coverPosition, 100);
  assert.equal(sanitizedPage.position, 0);
});
