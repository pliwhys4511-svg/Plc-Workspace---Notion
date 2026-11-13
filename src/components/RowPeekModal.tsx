import React from 'react';
import { Trash2, X } from 'lucide-react';
import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseRow,
  Page,
} from '../lib/types';
import { TAG_COLOR_CLASSES } from '../data/covers';

interface RowPeekModalProps {
  database: Database;
  row: DatabaseRow;
  rowPage: Page | undefined;
  blocks: Block[];
  onClose: () => void;
  onUpdateRow: (cells: Record<string, DatabaseCellValue>) => void;
  onDeleteRow: () => void;
  onUpdateRowBlocks: (blocks: Block[]) => void;
}

export const RowPeekModal: React.FC<RowPeekModalProps> = ({
  database,
  row,
  rowPage,
  blocks,
  onClose,
  onUpdateRow,
  onDeleteRow,
  onUpdateRowBlocks,
}) => {
  const titleCol = database.columns.find((c) => c.type === 'title') ?? database.columns[0];
  const rowTitle = String((titleCol ? row.cells[titleCol.id] : rowPage?.title) ?? '');
  const propCols = database.columns.filter((c) => c.id !== titleCol?.id);

  const notesText = blocks.map((b) => b.content).join('\n');

  const handleNotesChange = (text: string) => {
    const lines = text.split('\n');
    const nextBlocks: Block[] = lines.map((line, idx) => ({
      id: blocks[idx]?.id || `blk_peek_${row.id}_${idx}`,
      pageId: row.pageId,
      type: 'paragraph',
      content: line,
      position: idx,
    }));
    onUpdateRowBlocks(nextBlocks);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${rowTitle || 'Untitled'}`}
    >
      <div
        className="w-full max-w-xl h-full bg-[var(--notion-bg)] border-l border-[var(--notion-border-strong)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-4 flex items-center justify-between border-b border-[var(--notion-border)] shrink-0">
          <span className="text-xs text-[var(--notion-text-muted)]">
            {database.icon} {database.title}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Delete database item"
              onClick={() => {
                onDeleteRow();
                onClose();
              }}
              className="p-1.5 rounded hover:bg-red-500/10 text-[var(--notion-text-muted)] hover:text-red-500"
              title="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Close side peek"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="space-y-2">
            <div className="text-3xl">{rowPage?.icon || '📄'}</div>
            {titleCol && (
              <input
                type="text"
                value={rowTitle}
                onChange={(e) => onUpdateRow({ [titleCol.id]: e.target.value })}
                placeholder="Untitled"
                aria-label="Item title"
                className="w-full text-2xl font-bold bg-transparent text-[var(--notion-text)] focus:outline-none"
              />
            )}
          </div>

          <div className="space-y-2.5 border-y border-[var(--notion-border)] py-4">
            {propCols.map((col) => {
              const val = row.cells[col.id];
              return (
                <div key={col.id} className="grid grid-cols-[140px_1fr] items-center gap-3 text-xs">
                  <div className="text-[var(--notion-text-muted)] truncate">{col.name}</div>
                  <div>
                    {col.type === 'select' ? (
                      <select
                        value={String(val ?? '')}
                        onChange={(e) => onUpdateRow({ [col.id]: e.target.value || null })}
                        aria-label={col.name}
                        className="px-2 py-1 rounded bg-[var(--notion-surface-muted)] text-[var(--notion-text)] focus:outline-none"
                      >
                        <option value="">Empty</option>
                        {(col.options ?? []).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : col.type === 'multi_select' ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(col.options ?? []).map((opt) => {
                          const arr = Array.isArray(val) ? val : [];
                          const active = arr.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? arr.filter((x) => x !== opt.id)
                                  : [...arr, opt.id];
                                onUpdateRow({ [col.id]: next });
                              }}
                              className={`px-2 py-0.5 rounded-[4px] text-xs font-medium transition-opacity ${
                                active
                                  ? TAG_COLOR_CLASSES[opt.color] || TAG_COLOR_CLASSES.gray
                                  : 'bg-[var(--notion-surface-muted)] text-[var(--notion-text-muted)] opacity-60 hover:opacity-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : col.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={(e) => onUpdateRow({ [col.id]: e.target.checked })}
                        aria-label={col.name}
                        className="w-4 h-4 accent-[var(--notion-accent)]"
                      />
                    ) : col.type === 'date' ? (
                      <input
                        type="date"
                        value={String(val ?? '')}
                        onChange={(e) => onUpdateRow({ [col.id]: e.target.value })}
                        aria-label={col.name}
                        className="px-2 py-1 rounded bg-transparent hover:bg-[var(--notion-hover)] text-[var(--notion-text)] focus:outline-none tabular-nums"
                      />
                    ) : col.type === 'number' ? (
                      <input
                        type="number"
                        value={val === null || val === undefined ? '' : String(val)}
                        onChange={(e) =>
                          onUpdateRow({
                            [col.id]: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        aria-label={col.name}
                        placeholder="Empty"
                        className="w-full px-2 py-1 rounded bg-transparent hover:bg-[var(--notion-hover)] text-[var(--notion-text)] focus:outline-none tabular-nums"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(val ?? '')}
                        onChange={(e) => onUpdateRow({ [col.id]: e.target.value })}
                        aria-label={col.name}
                        placeholder="Empty"
                        className="w-full px-2 py-1 rounded bg-transparent hover:bg-[var(--notion-hover)] text-[var(--notion-text)] focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="row-peek-notes"
              className="block text-xs font-medium text-[var(--notion-text-muted)]"
            >
              Notes
            </label>
            <textarea
              id="row-peek-notes"
              value={notesText}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Write notes, acceptance criteria, or context..."
              rows={8}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
