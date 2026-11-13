import React, { useMemo, useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  LayoutTemplate,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { NOTION_TEMPLATES, type NotionTemplate } from '../lib/templates';
import { resolveCover } from '../data/covers';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseTemplate: (template: NotionTemplate) => void;
  customTemplates?: NotionTemplate[];
  onOpenUploadTemplate?: () => void;
  onExportTemplate?: (template: NotionTemplate) => void;
  onDeleteCustomTemplate?: (templateId: string) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  onUseTemplate,
  customTemplates = [],
  onOpenUploadTemplate,
  onExportTemplate,
  onDeleteCustomTemplate,
}) => {
  const allTemplates = useMemo(
    () => [...customTemplates, ...NOTION_TEMPLATES],
    [customTemplates],
  );
  const [selectedId, setSelectedId] = useState<string>(allTemplates[0]?.id ?? NOTION_TEMPLATES[0].id);
  const [category, setCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(allTemplates.map((t) => t.category)));
    return ['All', ...unique];
  }, [allTemplates]);

  const filtered = useMemo(
    () =>
      category === 'All'
        ? allTemplates
        : allTemplates.filter((t) => t.category === category),
    [allTemplates, category],
  );

  const selected = useMemo(
    () => filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? allTemplates[0] ?? NOTION_TEMPLATES[0],
    [filtered, selectedId, allTemplates],
  );

  if (!isOpen) return null;

  const cover = resolveCover(selected.cover);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Template gallery"
    >
      <div
        className="w-full max-w-3xl max-h-[82vh] rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[var(--notion-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-[var(--notion-text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--notion-text)]">Templates</h2>
            {customTemplates.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[var(--notion-surface-muted)] text-[10px] font-medium text-[var(--notion-text-muted)]">
                {customTemplates.length} custom
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onOpenUploadTemplate && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenUploadTemplate();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[var(--notion-text)] hover:bg-[var(--notion-hover)] transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload template</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Close templates"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[240px_1fr]">
          {/* Left: Categories + List */}
          <div className="border-b md:border-b-0 md:border-r border-[var(--notion-border)] p-3 overflow-y-auto space-y-3 bg-[var(--notion-sidebar)]">
            <div className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1.5 rounded-md text-xs text-left whitespace-nowrap transition-colors ${
                    category === cat
                      ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-medium'
                      : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="border-t border-[var(--notion-border)] pt-2 space-y-1">
              {filtered.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`group flex items-center gap-1 rounded-md transition-colors ${
                    selected.id === tpl.id
                      ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-medium'
                      : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(tpl.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-xs"
                  >
                    <span className="text-base leading-none shrink-0">{tpl.icon}</span>
                    <span className="truncate">{tpl.name}</span>
                  </button>
                  {tpl.isCustom && onDeleteCustomTemplate && (
                    <button
                      type="button"
                      aria-label={`Delete template ${tpl.name}`}
                      onClick={() => onDeleteCustomTemplate(tpl.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 mr-1 rounded hover:bg-red-500/10 text-[var(--notion-text-muted)] hover:text-red-500"
                      title="Delete custom template"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex flex-col min-h-0 overflow-y-auto bg-[var(--notion-bg)]">
            {cover && (
              <div className="h-28 w-full shrink-0 overflow-hidden bg-[var(--notion-surface-muted)]">
                {cover.kind === 'image' || cover.kind === 'url' ? (
                  <img
                    src={cover.src}
                    alt={`${selected.name} cover`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: cover.gradient }} />
                )}
              </div>
            )}

            <div className="p-6 space-y-4 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-3xl mb-1">{selected.icon}</div>
                  <h3 className="text-xl font-bold text-[var(--notion-text)]">{selected.name}</h3>
                  <p className="text-xs text-[var(--notion-text-muted)] mt-1">
                    {selected.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {onExportTemplate && (
                    <button
                      type="button"
                      onClick={() => onExportTemplate(selected)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[var(--notion-text)] hover:bg-[var(--notion-hover)] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export .json</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onUseTemplate(selected);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)] transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Use template</span>
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--notion-border)] bg-[var(--notion-surface-muted)]/35 p-4 space-y-2">
                <div className="text-[11px] font-semibold text-[var(--notion-text-muted)]">
                  Preview structure
                </div>
                {selected.isDatabase ? (
                  selected.database ? (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--notion-text-secondary)]">
                        Includes a full-page database with{' '}
                        <strong>{selected.database.columns.length} properties</strong> and{' '}
                        <strong>{selected.database.rows.length} rows</strong>.
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.database.columns.map((col) => (
                          <span
                            key={col.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--notion-bg)] border border-[var(--notion-border)] text-[11px] text-[var(--notion-text-secondary)]"
                          >
                            <FileSpreadsheet className="w-3 h-3 opacity-70" />
                            <span>{col.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--notion-text-secondary)]">
                      Includes a full-page multi-view database with Name, Status, Category, and Due Date
                      columns across Overview, Status, Calendar, and Category views.
                    </div>
                  )
                ) : (
                  <div className="space-y-1.5">
                    {selected.blocks.map((blk, i) => (
                      <div
                        key={i}
                        className="text-xs text-[var(--notion-text-secondary)] flex items-start gap-2"
                      >
                        <span className="text-[10px] font-mono text-[var(--notion-text-faint)] w-14 shrink-0 uppercase">
                          {blk.type}
                        </span>
                        <span className="truncate">
                          {blk.type === 'todo' && <Check className="inline w-3 h-3 mr-1" />}
                          {blk.type === 'table'
                            ? `${blk.rows?.length ?? 2}×${blk.rows?.[0]?.length ?? 2} table`
                            : blk.type === 'toc'
                            ? 'Auto-updating Table of Contents'
                            : blk.type === 'divider'
                            ? 'Horizontal divider'
                            : blk.content || blk.type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
