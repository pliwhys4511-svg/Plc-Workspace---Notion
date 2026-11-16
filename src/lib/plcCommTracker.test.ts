import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorkspace } from './seedData';
import { parseNotionCsvToDatabaseImport, mergeImportIntoDatabase } from './templateTransfer';
import { createPlcCommTrackerColumns, normalizePlcCommDate, parsePlcCommMetric } from './plcCommTracker';

const header = 'Date,Campaign Name,Category,PIC,Status,Viewers,React,Comment,Poll';
const csv = [
  header,
  '11/25/2026,Can You Spot It?,Braincation,Sample Editor,In progress,"1,963",12,3,57',
  '11/2/2026,Tuesday Book Pick,Book Review,Sample Editor,Completed,2.069,8,,',
  '10/19/2026,Learning Bite,Event Training,Sample Editor,"In progress,Completed",,,3,',
].join('\n');

test('PLC Comm schema contains all nine original columns and category/status options', () => {
  const columns = createPlcCommTrackerColumns();
  assert.deepEqual(columns.map((c) => c.name),
    ['Campaign Name', 'Date', 'Category', 'PIC', 'Status', 'Viewers', 'React', 'Comment', 'Poll']);
  assert.equal(columns.find((c) => c.name === 'Category')?.options?.length, 13);
  assert.deepEqual(columns.find((c) => c.name === 'Status')?.options?.map((o) => o.label),
    ['Not started', 'In progress', 'Ready for review', 'Completed']);
});

test('PLC Comm import treats dates as US format and reads formatted integer counts', () => {
  const parsed = parseNotionCsvToDatabaseImport(csv, 'Progress tracker(Sheet1).csv');
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].cells.col_date, '2026-11-25');
  assert.equal(parsed.rows[1].cells.col_date, '2026-11-02');
  assert.equal(parsed.rows[0].cells.col_viewers, 1963);
  assert.equal(parsed.rows[1].cells.col_viewers, 2069);
  assert.equal(parsed.rows[1].cells.col_comment, null);
  const status = parsed.columns.find((c) => c.id === 'col_status');
  assert.ok(status?.options?.some((o) => o.label === 'In progress,Completed'));
});

test('PLC Comm rejects malformed date and metrics rather than inserting bad cells', () => {
  assert.throws(() => normalizePlcCommDate('02/30/2026', 2), /tanggal/);
  assert.throws(() => parsePlcCommMetric('1,23', 'Viewers', 2), /Viewers/);
  assert.throws(() => parseNotionCsvToDatabaseImport(
    [header, '15/16/2026,Invalid,Braincation,,Completed,,,,'].join('\n'),
    'Progress tracker.csv'
  ), /tanggal/);
});

test('reimporting PLC Comm CSV does not duplicate matching campaign/date entries', () => {
  const ws = createSeedWorkspace();
  const parsed = parseNotionCsvToDatabaseImport(csv, 'Progress tracker.csv');
  const first = mergeImportIntoDatabase(ws.databases.db_plc_comm, parsed, 'append', 'page_plc_comm');
  assert.equal(first.addedRows.length, 3);
  assert.equal(first.nextDatabase.rows.length, 3);
  const repeat = mergeImportIntoDatabase(first.nextDatabase, parsed, 'append', 'page_plc_comm');
  assert.equal(repeat.addedRows.length, 0);
  assert.equal(repeat.addedRowPages.length, 0);
  assert.equal(repeat.nextDatabase.rows.length, 3);
  assert.equal(repeat.updatedRows?.length, 0);
});

test('existing PLC Comm metrics survive blank import cells and changes update matched rows', () => {
  const ws = createSeedWorkspace();
  const parsed = parseNotionCsvToDatabaseImport(csv, 'Progress tracker.csv');
  const first = mergeImportIntoDatabase(ws.databases.db_plc_comm, parsed, 'append', 'page_plc_comm');
  const target = first.nextDatabase;
  target.rows[0].cells.col_viewers = 2500;
  target.rows[0].cells.col_comment = 11;
  const updateCsv = [header, '11/25/2026,Can You Spot It?,Braincation,,Completed,,15,,'].join('\n');
  const updated = mergeImportIntoDatabase(target, parseNotionCsvToDatabaseImport(updateCsv, 'Progress tracker.csv'), 'append', 'page_plc_comm');
  assert.equal(updated.addedRows.length, 0);
  assert.equal(updated.updatedRows?.length, 1);
  assert.equal(updated.nextDatabase.rows[0].cells.col_viewers, 2500);
  assert.equal(updated.nextDatabase.rows[0].cells.col_comment, 11);
  assert.equal(updated.nextDatabase.rows[0].cells.col_react, 15);
  const status = updated.nextDatabase.columns.find((c) => c.id === 'col_status');
  const option = status?.options?.find((o) => o.id === updated.nextDatabase.rows[0].cells.col_status);
  assert.equal(option?.label, 'Completed');
});
