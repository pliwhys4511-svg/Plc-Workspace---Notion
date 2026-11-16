import test from 'node:test';
import assert from 'node:assert/strict';
import { planMissingCloudImportTargets } from './cloudImportPlan';

test('missing PLC Comm database is created before attempting schema updates', () => {
  assert.deepEqual(planMissingCloudImportTargets(false, true), {
    databaseCreated: true,
    pageCreated: false,
  });
});

test('missing PLC Comm page and database are created together', () => {
  assert.deepEqual(planMissingCloudImportTargets(false, false), {
    databaseCreated: true,
    pageCreated: true,
  });
});

test('already existing cloud database and page must never be recreated or overwritten', () => {
  assert.deepEqual(planMissingCloudImportTargets(true, true), {
    databaseCreated: false,
    pageCreated: false,
  });
});

test('existing database can be re-linked to a newly created page', () => {
  assert.deepEqual(planMissingCloudImportTargets(true, false), {
    databaseCreated: false,
    pageCreated: true,
  });
});

test('imports without target page only create the missing database', () => {
  assert.deepEqual(planMissingCloudImportTargets(false, null), {
    databaseCreated: true,
    pageCreated: false,
  });
});
