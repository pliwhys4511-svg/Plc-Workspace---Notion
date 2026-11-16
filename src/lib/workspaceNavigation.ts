import type { Page } from './types';

/** The PLC Comm tracker belongs to the Workspace page tree, not Quick Actions. */
export function isPlcCommPage(page: Page): boolean {
  return page.isDatabase && (
    page.id === 'page_plc_comm' ||
    page.databaseId === 'db_plc_comm' ||
    page.title.trim().toLocaleLowerCase('en') === 'plc comm'
  );
}

/** Keep just one dedicated, always-visible PLC Comm navigation entry. */
export function findVisiblePlcCommPage(pages: Page[]): Page | undefined {
  return pages.find((page) => isPlcCommPage(page) && !page.isTrashed);
}

export function otherWorkspacePages(pages: Page[]): Page[] {
  return pages.filter((page) => !isPlcCommPage(page));
}
