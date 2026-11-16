import type { DatabaseColumn } from './types';
import type { NotionTemplate } from './templates';
import {
  createProjectFromTemplateImport,
  type CreatedProjectBundle,
  type ParsedTemplateImport,
} from './templateTransfer';

export type WorkspaceKind = 'page' | 'database';

export interface WorkspaceProjectSelection {
  title: string;
  icon: string;
  parentId: string | null;
  kind: WorkspaceKind;
  columns?: DatabaseColumn[];
}

export function defaultWorkspaceColumns(): DatabaseColumn[] {
  return [
    { id: 'col_title', name: 'Name', type: 'title', width: 260 },
    {
      id: 'col_status', name: 'Status', type: 'select', width: 155,
      options: [
        { id: 'not_started', label: 'Not Started', color: 'gray' },
        { id: 'in_progress', label: 'In Progress', color: 'blue' },
        { id: 'completed', label: 'Completed', color: 'green' },
      ],
    },
    { id: 'col_pic', name: 'PIC', type: 'person', width: 165 },
    { id: 'col_due', name: 'Due Date', type: 'date', width: 135 },
  ];
}

export function templateColumns(template: NotionTemplate | null, kind: WorkspaceKind): DatabaseColumn[] {
  if (kind === 'page') return [];
  const source = template?.database?.columns ?? defaultWorkspaceColumns();
  return source.map((col) => ({
    ...col,
    options: col.options?.map((o) => ({ ...o })),
  }));
}

/** Reuses the established import bundle builder with fresh document and row IDs. */
export function buildWorkspaceProject(
  template: NotionTemplate | null,
  selection: WorkspaceProjectSelection,
  position: number,
): CreatedProjectBundle {
  const name = selection.title.trim();
  if (!name) throw new Error('Masukkan nama workspace.');
  const icon = selection.icon.trim().slice(0, 12) || (selection.kind === 'database' ? '🗂️' : '📄');
  const isDatabase = selection.kind === 'database';
  const columns = templateColumns(template, selection.kind);
  if (isDatabase && selection.columns) {
    columns.splice(0, columns.length, ...selection.columns.map((column) => ({
      ...column,
      options: column.options?.map((option) => ({ ...option })),
    })));
  }
  if (isDatabase && (!columns.length || columns[0].type !== 'title')) {
    throw new Error('Database harus memiliki kolom judul di posisi pertama.');
  }
  if (isDatabase && columns.some((col) => !col.name.trim())) {
    throw new Error('Nama kolom tidak boleh kosong.');
  }
  if (isDatabase && new Set(columns.map((col) => col.id)).size !== columns.length) {
    throw new Error('ID kolom tidak boleh sama.');
  }

  const parsed: ParsedTemplateImport = {
    sourceFormat: 'template-json',
    name,
    icon,
    cover: template?.cover ?? null,
    category: template?.category ?? 'My Workspace',
    description: template?.description ?? '',
    isDatabase,
    fullWidth: isDatabase,
    activeView: template?.database?.activeView ?? 'table',
    groupByColumnId: template?.database?.groupByColumnId ?? 'col_status',
    columns,
    rows: isDatabase ? template?.database?.rows ?? [] : [],
    blocks: isDatabase ? [] : template?.blocks ?? [],
    summary: template?.description ?? '',
  };
  return createProjectFromTemplateImport(parsed, position, selection.parentId);
}
