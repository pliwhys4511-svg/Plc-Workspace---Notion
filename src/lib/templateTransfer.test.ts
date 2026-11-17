import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorkspace } from './seedData';
import { HIGH_IMPACT_TITLE, HIGH_IMPACT_HEADERS, HIGH_IMPACT_DB_ID, HIGH_IMPACT_PAGE_ID, planHighImpactTracker } from './highImpactTracker';
import {
  createProjectFromTemplateImport,
  exportDatabaseToCsv,
  exportDatabaseToMarkdown,
  exportPageToTemplatePackage,
  mergeImportIntoDatabase,
  parseCsvMatrix,
  parseNotionCsvToDatabaseImport,
  parseNotionMarkdownImport,
  parseUploadedTemplateFile,
} from './templateTransfer';

test('exportDatabaseToCsv formats Notion select labels, checkboxes, and RFC-4180 quotes accurately', () => {
  const ws = createSeedWorkspace();
  const db = ws.databases.db_roadmap;
  const csv = exportDatabaseToCsv(db);
  const matrix = parseCsvMatrix(csv);

  assert.equal(matrix.length, 6); // 1 header + 5 rows
  assert.deepEqual(matrix[0], [
    'Initiative',
    'Status',
    'Category',
    'Priority',
    'Owner',
    'Target Date',
    'Verified',
  ]);
  assert.equal(matrix[1][0], 'Slash Command Block Palette');
  assert.equal(matrix[1][1], 'Done');
  assert.equal(matrix[1][2], 'Editor');
  assert.equal(matrix[1][6], 'Yes');
  assert.equal(matrix[3][1], 'In Progress');
  assert.equal(matrix[3][6], 'No');
});

test('parseCsvMatrix handles quoted commas, escaped quotes, BOM, and semicolon delimiter', () => {
  const commaCsv = '\uFEFFName,Notes,Done\n"Build ""Alpha"", Phase 1","Line 1, Part A",Yes\n';
  const parsed = parseCsvMatrix(commaCsv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1][0], 'Build "Alpha", Phase 1');
  assert.equal(parsed[1][1], 'Line 1, Part A');

  const semiCsv = 'Task;Status;Owner\nDeploy App;Done;Raka\n';
  const parsedSemi = parseCsvMatrix(semiCsv);
  assert.deepEqual(parsedSemi[0], ['Task', 'Status', 'Owner']);
  assert.deepEqual(parsedSemi[1], ['Deploy App', 'Done', 'Raka']);
});

test('parseNotionCsvToDatabaseImport infers column types, dates, and tag colors', () => {
  const csv = [
    'Initiative,Status,Owner,Target Date,Verified',
    'New API Gateway,In Progress,Dian Kusuma,28/11/2026,No',
    'Auth Hardening,Done,Raka Pratama,2026-12-01,Yes',
  ].join('\n');

  const imported = parseNotionCsvToDatabaseImport(csv, 'Sprint Tracker abc1234567890abcdef12345678.csv');
  assert.equal(imported.name, 'Sprint Tracker');
  assert.equal(imported.isDatabase, true);
  assert.equal(imported.columns.length, 5);
  assert.equal(imported.columns[0].type, 'title');
  assert.equal(imported.columns[1].type, 'select');
  assert.equal(imported.columns[3].type, 'date');
  assert.equal(imported.columns[4].type, 'checkbox');

  assert.equal(imported.rows.length, 2);
  assert.equal(imported.rows[0].cells[imported.columns[3].id], '2026-11-28');
  assert.equal(imported.rows[0].cells[imported.columns[4].id], false);
  assert.equal(imported.rows[1].cells[imported.columns[4].id], true);
});

test('parseNotionCsvToDatabaseImport treats Campaign Name as the title column even when it is not first', () => {
  const csv = [
    'Date,Campaign Name,Category,PIC,Status,Viewers,React,Comment,Poll',
    '11/25/2026,Can You Spot It?,Braincation,,In progress,120,8,3,2',
    '11/23/2026,Tuesday Book Pick,Book Review,,To Do,,,,',
  ].join('\n');

  const imported = parseNotionCsvToDatabaseImport(csv, 'Progress tracker.csv');
  const title = imported.columns.find((c) => c.type === 'title');
  assert.equal(title?.name, 'Campaign Name');
  assert.equal(imported.columns.filter((c) => c.type === 'title').length, 1);
  assert.equal(imported.columns.find((c) => c.name === 'Date')?.type, 'date');
  assert.equal(imported.columns[0].name, 'Campaign Name');
  assert.equal(imported.rows[0].cells.col_title, 'Can You Spot It?');
  assert.equal(imported.rows[1].cells.col_title, 'Tuesday Book Pick');
});

test('mergeImportIntoDatabase appends new rows, maps existing columns/options, and adds missing tags', () => {
  const ws = createSeedWorkspace();
  const db = ws.databases.db_roadmap;
  const csv = [
    'Initiative,Status,Category,Priority,Owner,Target Date,Verified,Sprint',
    'Realtime Collaboration,Blocked,Editor,High,Dian Kusuma,2026-12-05,No,Sprint 9',
  ].join('\n');

  const imported = parseNotionCsvToDatabaseImport(csv, 'extra.csv');
  const merged = mergeImportIntoDatabase(db, imported, 'append', 'page_roadmap');

  assert.equal(merged.nextDatabase.rows.length, 6);
  assert.equal(merged.addedRows.length, 1);
  assert.equal(merged.addedRowPages.length, 1);

  const statusCol = merged.nextDatabase.columns.find((c) => c.id === 'col_status');
  assert.ok(statusCol?.options?.some((o) => o.label === 'Blocked'));
  assert.ok(merged.nextDatabase.columns.some((c) => c.name === 'Sprint'));
  assert.equal(merged.addedRows[0].cells.col_title, 'Realtime Collaboration');
  assert.equal(merged.addedRows[0].cells.col_category, 'editor');
  assert.equal(merged.addedRows[0].cells.col_priority, 'high');
  assert.equal(merged.addedRows[0].cells.col_owner, 'Dian Kusuma');
});

test('exportPageToTemplatePackage round-trips full database project JSON cleanly', () => {
  const ws = createSeedWorkspace();
  const roadmapPage = ws.pages.find((p) => p.id === 'page_roadmap')!;
  const pkg = exportPageToTemplatePackage(roadmapPage, [], ws.databases, ws.blocksByPage);

  assert.equal(pkg.format, 'plc-notion-template-v1');
  assert.equal(pkg.isDatabase, true);
  assert.equal(pkg.database?.columns.length, 7);
  assert.equal(pkg.database?.rows.length, 5);

  const parsed = parseUploadedTemplateFile('product-roadmap.json', JSON.stringify(pkg));
  assert.equal(parsed.sourceFormat, 'template-json');
  assert.equal(parsed.name, 'Product Roadmap');
  assert.equal(parsed.columns.length, 7);
  assert.equal(parsed.rows.length, 5);

  const bundle = createProjectFromTemplateImport(parsed, 10);
  assert.equal(bundle.page.isDatabase, true);
  assert.ok(bundle.database);
  assert.equal(bundle.database?.rows.length, 5);
  assert.equal(bundle.rowPages.length, 5);
});

test('exportDatabaseToMarkdown & parseNotionMarkdownImport convert Notion Markdown tables & headings', () => {
  const ws = createSeedWorkspace();
  const roadmapPage = ws.pages.find((p) => p.id === 'page_roadmap')!;
  const md = exportDatabaseToMarkdown(roadmapPage, ws.databases.db_roadmap);
  assert.ok(md.includes('# Product Roadmap'));
  assert.ok(md.includes('| Initiative | Status |'));

  const parsedTableMd = parseNotionMarkdownImport(md, 'Product Roadmap.md');
  assert.equal(parsedTableMd.isDatabase, true);
  assert.equal(parsedTableMd.rows.length, 5);
  assert.equal(parsedTableMd.columns.length, 7);

  const docMd = [
    '# Project Brief Template',
    '',
    '## Goals',
    '- Launch Notion template importer',
    '- [x] Verify CSV roundtrip',
    '1. First milestone',
    '',
    '```ts',
    'console.log("ready");',
    '```',
  ].join('\n');

  const parsedDoc = parseNotionMarkdownImport(docMd, 'Brief.md');
  assert.equal(parsedDoc.isDatabase, false);
  assert.equal(parsedDoc.name, 'Project Brief Template');
  assert.ok(parsedDoc.blocks.some((b) => b.type === 'h2' && b.content === 'Goals'));
  assert.ok(parsedDoc.blocks.some((b) => b.type === 'todo' && b.checked === true));
  assert.ok(parsedDoc.blocks.some((b) => b.type === 'code' && b.language === 'ts'));
});

test('High Impact learning CSV preserves all ten typed columns even with empty metrics', () => {
  const csv = [
    HIGH_IMPACT_HEADERS.join(','),
    '"Example course, module one",Learning Team,Video Learning,Example vendor,Live,,,,,',
    'Example course two,Learning Team,Video Learning,Example vendor,Storyboard Vendor,2026-11-01,2026-11-20,https://example.invalid/course,"1,200",800',
  ].join('\n');
  const imported = parseUploadedTemplateFile('untitled.csv', csv);
  assert.equal(imported.name, HIGH_IMPACT_TITLE);
  assert.deepEqual(imported.columns.map(c => c.name), [...HIGH_IMPACT_HEADERS]);
  assert.deepEqual(imported.columns.map(c => c.type), ['title','person','select','select','select','date','date','url','number','number']);
  assert.equal(imported.rows.length, 2);
  assert.equal(imported.rows[0].cells.col_title, 'Example course, module one');
  assert.equal(imported.rows[0].cells.col_access, null);
  assert.equal(imported.rows[0].cells.col_status, 'live');
  assert.equal(imported.rows[1].cells.col_access, 1200);
  assert.equal(imported.rows[1].cells.col_completion, 800);
  assert.equal(imported.rows[1].cells.col_end, '2026-11-20');
  const initial = planHighImpactTracker(createSeedWorkspace());
  const merged = mergeImportIntoDatabase(initial.database, imported, 'append', initial.page.id);
  assert.equal(merged.nextDatabase.rows.length, 2);
  assert.equal(merged.nextDatabase.columns.length, 10);
});

test('High Impact tracker uses fixed shared IDs and never replaces existing rows or unrelated projects', () => {
  const original = createSeedWorkspace();
  const planned = planHighImpactTracker(original);
  assert.equal(planned.action, 'create');
  assert.equal(planned.page.id, HIGH_IMPACT_PAGE_ID);
  assert.equal(planned.database.id, HIGH_IMPACT_DB_ID);
  assert.equal(planned.workspace.pages.length, original.pages.length+1);
  assert.equal(planned.workspace.databases.db_roadmap, original.databases.db_roadmap);
  const reopened = planHighImpactTracker(planned.workspace);
  assert.equal(reopened.action, 'open');
  assert.equal(reopened.database, planned.database);
  assert.equal(reopened.workspace, planned.workspace);
});
