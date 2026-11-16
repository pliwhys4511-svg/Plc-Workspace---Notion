/**
 * Determines which cloud import targets must be created. Never replace
 * already-existing documents while recovering a missing PLC Comm database.
 */
export function planMissingCloudImportTargets(
  databaseExists: boolean,
  pageExists: boolean | null,
): { databaseCreated: boolean; pageCreated: boolean } {
  return {
    databaseCreated: !databaseExists,
    pageCreated: pageExists === false,
  };
}
