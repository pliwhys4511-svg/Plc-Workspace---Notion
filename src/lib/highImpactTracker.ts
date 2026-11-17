import type { Database, DatabaseColumn, Page, WorkspaceData } from './types';
import type { NotionTemplate } from './templates';

export const HIGH_IMPACT_TITLE = 'Production High Impact Modules E-Learning 2026';
export const HIGH_IMPACT_PAGE_ID = 'page_high_impact_elearning_2026';
export const HIGH_IMPACT_DB_ID = 'db_high_impact_elearning_2026';
export const HIGH_IMPACT_HEADERS = ['Course Name', 'PIC Directorate', 'Category', 'Production', 'Status', 'Start Date', 'End Date', 'Course URL', 'Total Access', 'Total Completion'] as const;

export function createHighImpactColumns(): DatabaseColumn[] {
  return [
    { id: 'col_title', name: 'Course Name', type: 'title', width: 365 },
    { id: 'col_pic', name: 'PIC Directorate', type: 'person', width: 245 },
    { id: 'col_category', name: 'Category', type: 'select', width: 150, options: [{id:'video_learning',label:'Video Learning',color:'blue'}] },
    { id: 'col_production', name: 'Production', type: 'select', width: 150, options: [] },
    { id: 'col_status', name: 'Status', type: 'select', width: 185, options: [
      {id:'storyboard_vendor',label:'Storyboard Vendor',color:'orange'},
      {id:'live',label:'Live',color:'green'},
    ] },
    { id: 'col_start', name: 'Start Date', type: 'date', width: 130 },
    { id: 'col_end', name: 'End Date', type: 'date', width: 130 },
    { id: 'col_url', name: 'Course URL', type: 'url', width: 205 },
    { id: 'col_access', name: 'Total Access', type: 'number', width: 125 },
    { id: 'col_completion', name: 'Total Completion', type: 'number', width: 145 },
  ];
}

export const HIGH_IMPACT_TEMPLATE: NotionTemplate = {
  id: 'tpl_high_impact_elearning_2026', name: HIGH_IMPACT_TITLE,
  icon: '🎓', cover: 'grad_sage', category: 'Learning & Development',
  description: 'Monitor produksi modul e-learning, PIC, vendor, status, jadwal, akses dan completion.',
  isDatabase: true, blocks: [],
  database: {
    title: HIGH_IMPACT_TITLE, icon: '🎓', activeView: 'table',
    groupByColumnId: 'col_status', columns: createHighImpactColumns(), rows: [],
  },
};

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
export function isHighImpactHeaders(headers: string[]): boolean {
  const names = headers.map(normalize);
  return names.length === HIGH_IMPACT_HEADERS.length &&
    new Set(names).size === names.length &&
    HIGH_IMPACT_HEADERS.every(header => names.includes(normalize(header)));
}

export function findHighImpactPage(pages: Page[]): Page | undefined {
  return pages.find(p => p.id === HIGH_IMPACT_PAGE_ID || p.databaseId === HIGH_IMPACT_DB_ID ||
    normalize(p.title) === normalize(HIGH_IMPACT_TITLE));
}

/** Provision only missing documents; preserve any existing page, database and rows. */
export function planHighImpactTracker(workspace: WorkspaceData): {page: Page; database: Database; workspace: WorkspaceData; action: 'open' | 'create' | 'repair'} {
  const previous = findHighImpactPage(workspace.pages);
  if (previous && (!previous.isDatabase || previous.isTrashed || !previous.databaseId)) {
    throw new Error('Halaman tracker sudah ada. Periksa halaman atau Trash sebelum membuat database baru.');
  }
  const dbId = previous?.databaseId ?? HIGH_IMPACT_DB_ID;
  const linked = workspace.databases[dbId];
  if (previous && linked) return { page: previous, database: linked, workspace, action: 'open' };
  const now = new Date().toISOString();
  const page: Page = previous ?? {
    id: HIGH_IMPACT_PAGE_ID, parentId: null, title: HIGH_IMPACT_TITLE, icon: '🎓',
    cover: 'grad_sage', coverPosition: 50, font: 'sans', smallText: false, fullWidth: true,
    isFavorite: false, isTrashed: false, isDatabase: true, databaseId: dbId, locked: false,
    position: Math.max(0, ...workspace.pages.filter(p => p.parentId === null).map(p => p.position)) + 1,
    createdAt: now, updatedAt: now,
  };
  const database: Database = linked ?? {
    id: dbId, title: page.title, icon: page.icon, activeView: 'table',
    groupByColumnId: 'col_status', columns: createHighImpactColumns(), rows: [],
  };
  return {
    page, database, action: previous ? 'repair' : 'create',
    workspace: {
      ...workspace,
      pages: previous ? workspace.pages : [...workspace.pages, page],
      databases: {...workspace.databases, [dbId]: database},
      blocksByPage: {...workspace.blocksByPage, [page.id]: workspace.blocksByPage[page.id] ?? []},
    },
  };
}
