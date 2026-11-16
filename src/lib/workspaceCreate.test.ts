import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTION_TEMPLATES } from './templates';
import { buildWorkspaceProject, defaultWorkspaceColumns, templateColumns } from './workspaceCreate';

test('project templates provide ready-to-customize database schemas', () => {
  for (const id of ['tpl_ld_projects', 'tpl_ld_training', 'tpl_ld_events', 'tpl_ld_content', 'tpl_plc_comm']) {
    const template = NOTION_TEMPLATES.find((t) => t.id === id);
    assert.ok(template?.isDatabase, `${id} should be a database template`);
    assert.ok(template.database?.columns.length && template.database.columns.length >= 5);
    assert.equal(template.database?.columns[0].type, 'title');
  }
});

test('creating a customized database keeps user title and edits columns', () => {
  const template = NOTION_TEMPLATES.find((t) => t.id === 'tpl_ld_projects')!;
  const columns = templateColumns(template, 'database');
  columns[0].name = 'Project / Task';
  columns.push({ id: 'col_learning_hours', name: 'Learning Hours', type: 'number', width: 130 });
  const bundle = buildWorkspaceProject(template, {
    title: 'My Learning Program', icon: '🎓', parentId: null,
    kind: 'database', columns,
  }, 20);
  assert.equal(bundle.page.title, 'My Learning Program');
  assert.equal(bundle.page.parentId, null);
  assert.equal(bundle.page.icon, '🎓');
  assert.equal(bundle.page.isDatabase, true);
  assert.equal(bundle.database?.title, 'My Learning Program');
  assert.ok(bundle.database?.columns.some((c) => c.id === 'col_learning_hours'));
  assert.equal(bundle.database?.rows.length, 0);
  assert.equal(template.database?.columns[0].name, 'Task / Deliverable');
});

test('template bundles receive independent generated page and database IDs', () => {
  const template = NOTION_TEMPLATES.find((t) => t.id === 'tpl_plc_comm')!;
  const opts = { title: 'Campaign 2027', icon: '📣', parentId: null, kind: 'database' as const };
  const a = buildWorkspaceProject(template, opts, 1);
  const b = buildWorkspaceProject(template, opts, 2);
  assert.notEqual(a.page.id, b.page.id);
  assert.notEqual(a.database?.id, b.database?.id);
  assert.notEqual(a.page.databaseId, 'db_plc_comm');
});

test('blank database supports a user-defined table structure', () => {
  const cols = defaultWorkspaceColumns().slice(0, 2);
  const bundle = buildWorkspaceProject(null, {
    title: 'My Tracker', icon: '🗂️', kind: 'database', parentId: null, columns: cols,
  }, 1);
  assert.equal(bundle.database?.columns.length, 2);
  assert.equal(bundle.page.isDatabase, true);
});

test('blank page and project brief work inside a parent workspace', () => {
  const blank = buildWorkspaceProject(null, {
    title: 'Quick Notes', icon: '📄', kind: 'page', parentId: 'page_home',
  }, 5);
  assert.equal(blank.page.parentId, 'page_home');
  assert.equal(blank.page.isDatabase, false);
  const brief = NOTION_TEMPLATES.find((t) => t.id === 'tpl_ld_brief')!;
  const project = buildWorkspaceProject(brief, {
    title: 'Project Brief 2027', icon: '📘', kind: 'page', parentId: 'page_home',
  }, 6);
  assert.equal(project.page.parentId, 'page_home');
  assert.ok(project.blocks.some((b) => b.type === 'h2'));
});

test('invalid database structure is blocked before saving', () => {
  assert.throws(() => buildWorkspaceProject(null, {
    title: 'Broken tracker', icon: '🗂️', kind: 'database', parentId: null,
    columns: [{ id: 'col_a', name: 'Status', type: 'select' }],
  }, 1), /kolom judul/);
  assert.throws(() => buildWorkspaceProject(null, {
    title: '   ', icon: '📄', kind: 'page', parentId: null,
  }, 1), /nama workspace/);
});
