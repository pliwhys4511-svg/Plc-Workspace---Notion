import type { NotionTemplate } from './templates';
import type { ParsedTemplateImport, ProjectTemplatePackage } from './templateTransfer';
import { createId } from './workspaceOps';

const STORAGE_KEY = 'plc.notion.customTemplates.v1';

export function loadCustomTemplates(): NotionTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NotionTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeCustomTemplates(list: NotionTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export function packageToNotionTemplate(
  pkg: ProjectTemplatePackage | ParsedTemplateImport,
  idOverride?: string,
): NotionTemplate {
  const db =
    'database' in pkg && pkg.database
      ? pkg.database
      : 'columns' in pkg && pkg.columns.length > 0
      ? {
          title: pkg.name,
          icon: pkg.icon,
          activeView: pkg.activeView ?? 'table',
          groupByColumnId: pkg.groupByColumnId ?? 'col_status',
          columns: pkg.columns,
          rows: pkg.rows,
        }
      : undefined;

  return {
    id: idOverride || ('id' in pkg && pkg.id ? pkg.id : createId('tpl')),
    name: pkg.name,
    icon: pkg.icon || (pkg.isDatabase ? '🗂️' : '📄'),
    cover: pkg.cover ?? null,
    category: pkg.category || 'My Templates',
    description: pkg.description || 'Saved project template',
    isDatabase: pkg.isDatabase,
    isCustom: true,
    blocks: pkg.blocks ?? [],
    ...(db ? { database: db } : {}),
  };
}

export function saveCustomTemplate(template: NotionTemplate): NotionTemplate[] {
  const existing = loadCustomTemplates();
  const normalized: NotionTemplate = {
    ...template,
    id: template.id || createId('tpl'),
    isCustom: true,
  };
  const next = [normalized, ...existing.filter((t) => t.id !== normalized.id)].slice(0, 40);
  writeCustomTemplates(next);
  return next;
}

export function deleteCustomTemplate(templateId: string): NotionTemplate[] {
  const existing = loadCustomTemplates();
  const next = existing.filter((t) => t.id !== templateId);
  writeCustomTemplates(next);
  return next;
}
