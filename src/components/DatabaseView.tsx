import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  BookmarkPlus,
  Calendar,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Columns3,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  Hash,
  ListFilter,
  Plus,
  Search,
  Table2,
  Tag,
  Trash2,
  Type,
  Upload,
  User,
} from 'lucide-react';
import type {
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseColumnType,
  DatabaseRow,
  DatabaseViewType,
  TagColor,
} from '../lib/types';
import { createId, filterAndSortRows, groupRowsByColumn } from '../lib/workspaceOps';
import { TAG_COLOR_CLASSES } from '../data/covers';

interface DatabaseViewProps {
  database: Database;
  compact?: boolean;
  onUpdateDatabase: (
    patch: Partial<{
      title: string;
      icon: string;
      activeView: DatabaseViewType;
      groupByColumnId: string;
      columns: DatabaseColumn[];
    }>,
  ) => void;
  onAddRow: (initialCells?: Record<string, DatabaseCellValue>) => void;
  onUpdateRow: (rowId: string, cells: Record<string, DatabaseCellValue>) => void;
  onDeleteRow: (rowId: string) => void;
  onOpenRowPage: (row: DatabaseRow) => void;
  onOpenUploadTemplate?: () => void;
  onExportProjectTemplate?: () => void;
  onExportProjectCsv?: () => void;
  onExportProjectMarkdown?: () => void;
  onSaveAsTemplate?: () => void;
}

function columnIcon(type: DatabaseColumnType) {
  switch (type) {
    case 'title':
      return <Type className="w-3.5 h-3.5" />;
    case 'select':
    case 'multi_select':
      return <Tag className="w-3.5 h-3.5" />;
    case 'date':
      return <Calendar className="w-3.5 h-3.5" />;
    case 'checkbox':
      return <CheckSquare className="w-3.5 h-3.5" />;
    case 'number':
      return <Hash className="w-3.5 h-3.5" />;
    case 'person':
      return <User className="w-3.5 h-3.5" />;
    default:
      return <Type className="w-3.5 h-3.5" />;
  }
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  database,
  compact = false,
  onUpdateDatabase,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onOpenRowPage,
  onOpenUploadTemplate,
  onExportProjectTemplate,
  onExportProjectCsv,
  onExportProjectMarkdown,
  onSaveAsTemplate,
}) => {
  const [search, setSearch] = useState('');
  const [filterVal, setFilterVal] = useState('');
  const [sortColId, setSortColId] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openCell, setOpenCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [addPropOpen, setAddPropOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<DatabaseColumnType>('select');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const hasExportActions = Boolean(
    onExportProjectTemplate || onExportProjectCsv || onExportProjectMarkdown || onSaveAsTemplate,
  );

  const normalizedView: 'table' | 'status' | 'calendar' | 'category' =
    database.activeView === 'board' || database.activeView === 'status'
      ? 'status'
      : database.activeView === 'calendar'
      ? 'calendar'
      : database.activeView === 'category'
      ? 'category'
      : 'table';

  const dateCol = useMemo(
    () => database.columns.find((c) => c.type === 'date'),
    [database.columns],
  );

  const statusCol = useMemo(
    () =>
      database.columns.find((c) => /status/i.test(c.name) && (c.type === 'select' || c.type === 'multi_select')) ??
      database.columns.find((c) => c.id === database.groupByColumnId) ??
      database.columns.find((c) => c.type === 'select'),
    [database.columns, database.groupByColumnId],
  );

  const categoryCol = useMemo(
    () =>
      database.columns.find((c) => /category|kategori/i.test(c.name) && (c.type === 'select' || c.type === 'multi_select')) ??
      database.columns.find((c) => c.id === 'col_category' || c.id === 'col_act_category') ??
      database.columns.find((c) => c.id !== statusCol?.id && (c.type === 'select' || c.type === 'multi_select')),
    [database.columns, statusCol],
  );

  const activeGroupCol = useMemo(() => {
    if (normalizedView === 'category') return categoryCol ?? statusCol;
    return statusCol ?? categoryCol;
  }, [normalizedView, categoryCol, statusCol]);

  const filterCol = normalizedView === 'category' ? categoryCol ?? statusCol : statusCol ?? categoryCol;

  const visibleRows = useMemo(
    () =>
      filterAndSortRows(database, {
        search,
        filterColumnId: filterVal && filterCol ? filterCol.id : '',
        filterValue: filterVal,
        sortColumnId: sortColId,
        sortDirection: sortDir,
      }),
    [database, search, filterVal, filterCol, sortColId, sortDir],
  );

  const boardGroups = useMemo(() => {
    if (!activeGroupCol) return [];
    return groupRowsByColumn(visibleRows, database.columns, activeGroupCol.id);
  }, [visibleRows, database.columns, activeGroupCol]);

  const titleCol = database.columns.find((c) => c.type === 'title') ?? database.columns[0];

  const handleEnsureCategoryColumn = () => {
    if (categoryCol) return;
    const newCol: DatabaseColumn = {
      id: createId('col'),
      name: 'Category',
      type: 'select',
      width: 140,
      options: [
        { id: 'general', label: 'General', color: 'gray' },
        { id: 'work', label: 'Work', color: 'blue' },
        { id: 'personal', label: 'Personal', color: 'green' },
        { id: 'ideas', label: 'Ideas', color: 'purple' },
      ],
    };
    onUpdateDatabase({ columns: [...database.columns, newCol] });
  };

  const handleEnsureDateColumn = () => {
    if (dateCol) return;
    const newCol: DatabaseColumn = {
      id: createId('col'),
      name: 'Due Date',
      type: 'date',
      width: 130,
    };
    onUpdateDatabase({ columns: [...database.columns, newCol] });
  };

  const handleAddProperty = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPropName.trim();
    if (!trimmed) return;
    const newCol: DatabaseColumn = {
      id: createId('col'),
      name: trimmed,
      type: newPropType,
      width: 140,
      ...(newPropType === 'select' || newPropType === 'multi_select'
        ? {
            options: [
              { id: 'opt_1', label: 'Option A', color: 'blue' as TagColor },
              { id: 'opt_2', label: 'Option B', color: 'green' as TagColor },
              { id: 'opt_3', label: 'Option C', color: 'orange' as TagColor },
            ],
          }
        : {}),
    };
    onUpdateDatabase({ columns: [...database.columns, newCol] });
    setNewPropName('');
    setAddPropOpen(false);
  };

  const renderSelectOptionTag = (col: DatabaseColumn, val: unknown) => {
    const opt = col.options?.find((o) => o.id === val || o.label === val);
    if (!opt) {
      return val ? (
        <span className="inline-block px-2 py-0.5 rounded-[4px] text-xs bg-[var(--notion-surface-muted)] text-[var(--notion-text)]">
          {String(val)}
        </span>
      ) : (
        <span className="text-xs text-[var(--notion-text-faint)]">—</span>
      );
    }
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-xs font-medium whitespace-nowrap ${
          TAG_COLOR_CLASSES[opt.color] || TAG_COLOR_CLASSES.gray
        }`}
      >
        {opt.label}
      </span>
    );
  };

  const renderTableCell = (row: DatabaseRow, col: DatabaseColumn) => {
    const val = row.cells[col.id];
    const isCellOpen = openCell?.rowId === row.id && openCell?.colId === col.id;

    if (col.type === 'title') {
      return (
        <div className="group/title relative flex items-center min-w-0">
          <input
            type="text"
            value={String(val ?? '')}
            onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.value })}
            aria-label={`${col.name} for row`}
            placeholder="Untitled"
            className="w-full min-w-0 bg-transparent text-[13.5px] font-medium text-[var(--notion-text)] focus:outline-none pr-1"
          />
          <button
            type="button"
            onClick={() => onOpenRowPage(row)}
            className="hidden group-hover/title:inline-flex focus:inline-flex absolute right-0 items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[11px] font-medium text-[var(--notion-text-secondary)] hover:text-[var(--notion-text)] shadow-xs shrink-0"
            title="Open in side peek"
          >
            <ExternalLink className="w-3 h-3" />
            <span>OPEN</span>
          </button>
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.checked })}
            aria-label={`${col.name} checkbox`}
            className="w-4 h-4 rounded accent-[var(--notion-accent)] cursor-pointer"
          />
        </div>
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={String(val ?? '')}
          onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.value })}
          aria-label={col.name}
          className="w-full bg-transparent text-xs tabular-nums text-[var(--notion-text-secondary)] focus:outline-none"
        />
      );
    }

    if (col.type === 'number') {
      return (
        <input
          type="number"
          value={val === null || val === undefined ? '' : String(val)}
          onChange={(e) =>
            onUpdateRow(row.id, { [col.id]: e.target.value === '' ? null : Number(e.target.value) })
          }
          aria-label={col.name}
          placeholder="0"
          className="w-full bg-transparent text-xs text-right tabular-nums font-mono text-[var(--notion-text)] focus:outline-none"
        />
      );
    }

    if (col.type === 'select') {
      return (
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenCell(isCellOpen ? null : { rowId: row.id, colId: col.id })
            }
            className="w-full text-left py-0.5 rounded hover:bg-[var(--notion-hover)] px-1 -mx-1"
          >
            {renderSelectOptionTag(col, val)}
          </button>
          {isCellOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-44 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-1 space-y-0.5">
              {(col.options ?? []).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onUpdateRow(row.id, { [col.id]: opt.id });
                    setOpenCell(null);
                  }}
                  className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--notion-hover)] text-left"
                >
                  <span
                    className={`px-2 py-0.5 rounded-[4px] text-xs font-medium ${
                      TAG_COLOR_CLASSES[opt.color] || TAG_COLOR_CLASSES.gray
                    }`}
                  >
                    {opt.label}
                  </span>
                  {val === opt.id && <Check className="w-3.5 h-3.5 text-[var(--notion-accent)]" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onUpdateRow(row.id, { [col.id]: null });
                  setOpenCell(null);
                }}
                className="w-full text-left px-2 py-1 text-xs text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] rounded"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'multi_select') {
      const selectedIds = Array.isArray(val) ? val : [];
      return (
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenCell(isCellOpen ? null : { rowId: row.id, colId: col.id })
            }
            className="w-full flex flex-wrap items-center gap-1 text-left py-0.5 rounded hover:bg-[var(--notion-hover)] px-1 -mx-1 min-h-[24px]"
          >
            {selectedIds.length === 0 ? (
              <span className="text-xs text-[var(--notion-text-faint)]">—</span>
            ) : (
              selectedIds.map((id) => (
                <React.Fragment key={id}>{renderSelectOptionTag(col, id)}</React.Fragment>
              ))
            )}
          </button>
          {isCellOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-48 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-1 space-y-0.5">
              {(col.options ?? []).map((opt) => {
                const active = selectedIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? selectedIds.filter((s) => s !== opt.id)
                        : [...selectedIds, opt.id];
                      onUpdateRow(row.id, { [col.id]: next });
                    }}
                    className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[var(--notion-hover)] text-left"
                  >
                    <span
                      className={`px-2 py-0.5 rounded-[4px] text-xs font-medium ${
                        TAG_COLOR_CLASSES[opt.color] || TAG_COLOR_CLASSES.gray
                      }`}
                    >
                      {opt.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-[var(--notion-accent)]" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setOpenCell(null)}
                className="w-full text-center py-1 text-xs text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] rounded border-t border-[var(--notion-border)] mt-1"
              >
                Done
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={String(val ?? '')}
        onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.value })}
        aria-label={col.name}
        placeholder="Empty"
        className="w-full bg-transparent text-xs text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
      />
    );
  };

  return (
    <div className={`w-full ${compact ? 'my-3' : 'mt-2'}`} data-testid="database-view">
      {/* Database Header (for inline databases) */}
      {compact && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">{database.icon}</span>
          <input
            type="text"
            value={database.title}
            onChange={(e) => onUpdateDatabase({ title: e.target.value })}
            aria-label="Database title"
            className="text-base font-semibold bg-transparent text-[var(--notion-text)] focus:outline-none"
          />
        </div>
      )}

      {/* View Switcher & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--notion-border)]">
        <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5" role="tablist" aria-label="Database views">
          {(
            [
              { id: 'table', label: 'Overview', icon: <Table2 className="w-3.5 h-3.5" /> },
              { id: 'status', label: 'Status', icon: <CircleDot className="w-3.5 h-3.5" /> },
              { id: 'calendar', label: 'Calendar', icon: <CalendarDays className="w-3.5 h-3.5" /> },
              { id: 'category', label: 'Category', icon: <Columns3 className="w-3.5 h-3.5" /> },
            ] as const
          ).map((v) => {
            const active = normalizedView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setFilterVal('');
                  onUpdateDatabase({ activeView: v.id });
                }}
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[12.5px] sm:text-[13px] whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-semibold'
                    : 'text-[var(--notion-text-muted)] font-medium hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)]'
                }`}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Search rows */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[var(--notion-text-muted)] absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rows..."
              aria-label="Search database rows"
              className="w-36 pl-7 pr-2 py-1 text-xs rounded-md bg-[var(--notion-surface-muted)] border border-transparent focus:border-[var(--notion-accent)] focus:bg-[var(--notion-bg)] text-[var(--notion-text)] focus:outline-none"
            />
          </div>

          {/* Column Filter */}
          {filterCol && (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--notion-hover)] text-xs text-[var(--notion-text-secondary)]">
              <ListFilter className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
              <select
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                aria-label={`Filter by ${filterCol.name}`}
                className="bg-transparent text-xs focus:outline-none cursor-pointer"
              >
                <option value="">All {filterCol.name}</option>
                {(filterCol.options ?? []).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort selector */}
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--notion-hover)] text-xs text-[var(--notion-text-secondary)]">
            <ArrowDownUp className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
            <select
              value={sortColId}
              onChange={(e) => setSortColId(e.target.value)}
              aria-label="Sort rows by column"
              className="bg-transparent text-xs focus:outline-none cursor-pointer"
            >
              <option value="">Default order</option>
              {database.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  Sort: {c.name}
                </option>
              ))}
            </select>
            {sortColId && (
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="text-[11px] font-mono px-1 rounded bg-[var(--notion-surface-muted)]"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? 'ASC' : 'DESC'}
              </button>
            )}
          </div>

          {/* Add Property */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                setAddPropOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Property</span>
            </button>
            {addPropOpen && (
              <form
                onSubmit={handleAddProperty}
                className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-2.5 space-y-2"
              >
                <div className="text-xs font-semibold text-[var(--notion-text)]">
                  New Property
                </div>
                <input
                  type="text"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  placeholder="Property name"
                  aria-label="New property name"
                  className="w-full px-2 py-1 text-xs rounded border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
                  autoFocus
                />
                <select
                  value={newPropType}
                  onChange={(e) => setNewPropType(e.target.value as DatabaseColumnType)}
                  aria-label="New property type"
                  className="w-full px-2 py-1 text-xs rounded border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[var(--notion-text)]"
                >
                  <option value="select">Select</option>
                  <option value="multi_select">Multi-select</option>
                  <option value="person">Text / Person</option>
                  <option value="date">Date</option>
                  <option value="number">Number</option>
                  <option value="checkbox">Checkbox</option>
                </select>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setAddPropOpen(false)}
                    className="px-2 py-1 text-xs rounded text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-medium rounded bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)]"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}
          </div>

          {onOpenUploadTemplate && (
            <button
              type="button"
              onClick={() => {
                setAddPropOpen(false);
                setExportMenuOpen(false);
                onOpenUploadTemplate();
              }}
              title="Upload template Notion (.csv, .md, .json)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[var(--notion-text-secondary)] border border-[var(--notion-border)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </button>
          )}

          {hasExportActions && (
            <div className="relative">
              <button
                type="button"
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setAddPropOpen(false);
                  setExportMenuOpen((v) => !v);
                }}
                title="Export project & Notion templates"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[var(--notion-text-secondary)] border border-[var(--notion-border)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {exportMenuOpen && (
                <div
                  role="menu"
                  aria-label="Export database template options"
                  className="absolute right-0 top-full mt-1 z-40 w-60 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-1.5 space-y-0.5"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--notion-text-faint)]">
                    Export Notion Template
                  </div>
                  {onExportProjectTemplate && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportProjectTemplate();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                    >
                      <FileJson className="w-3.5 h-3.5 text-[var(--notion-accent)] shrink-0" />
                      <span>Export Template (.json)</span>
                    </button>
                  )}
                  {onExportProjectCsv && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportProjectCsv();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Export Notion CSV (.csv)</span>
                    </button>
                  )}
                  {onExportProjectMarkdown && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportProjectMarkdown();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--notion-text-muted)] shrink-0" />
                      <span>Export Markdown (.md)</span>
                    </button>
                  )}
                  {onSaveAsTemplate && (
                    <>
                      <div className="my-1 border-t border-[var(--notion-border)]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          onSaveAsTemplate();
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Save as Reusable Template</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onAddRow({})}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* OVERVIEW (TABLE) VIEW */}
      {normalizedView === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--notion-border)]">
                {database.columns.map((col) => (
                  <th
                    key={col.id}
                    className="py-2 px-2.5 text-xs font-medium text-[var(--notion-text-muted)] border-r border-[var(--notion-border)] last:border-r-0 whitespace-nowrap"
                    style={{ minWidth: `${col.width ?? 130}px` }}
                  >
                    <div className="flex items-center gap-1.5">
                      {columnIcon(col.type)}
                      <span>{col.name}</span>
                    </div>
                  </th>
                ))}
                <th className="w-9 py-2 px-1" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={database.columns.length + 1}
                    className="py-8 text-center text-xs text-[var(--notion-text-muted)]"
                  >
                    No matching rows. Click New to add an entry.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-[var(--notion-border)] hover:bg-[var(--notion-hover)]/60 transition-colors"
                  >
                    {database.columns.map((col) => (
                      <td
                        key={col.id}
                        className="py-1.5 px-2.5 border-r border-[var(--notion-border)] last:border-r-0 align-middle"
                      >
                        {renderTableCell(row, col)}
                      </td>
                    ))}
                    <td className="py-1.5 px-1 text-center">
                      <button
                        type="button"
                        aria-label={`Delete row ${String(
                          titleCol ? row.cells[titleCol.id] ?? 'Untitled' : 'Untitled',
                        )}`}
                        onClick={() => onDeleteRow(row.id)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-red-500/10 text-[var(--notion-text-muted)] hover:text-red-500 transition-opacity"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-b border-[var(--notion-border)]">
            <button
              type="button"
              onClick={() => onAddRow({})}
              className="flex-1 flex items-center gap-1.5 px-2.5 py-2 text-xs text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] text-left transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
            <div className="px-3 py-2 text-[11px] font-medium text-[var(--notion-text-faint)] tabular-nums select-none">
              COUNT {visibleRows.length}
            </div>
          </div>
        </div>
      )}

      {/* STATUS & CATEGORY KANBAN BOARD VIEWS */}
      {(normalizedView === 'status' || normalizedView === 'category') && (
        <div className="py-4 space-y-3">
          {normalizedView === 'category' && !categoryCol && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--notion-surface-muted)] border border-[var(--notion-border)] px-3.5 py-2.5 text-xs text-[var(--notion-text-secondary)]">
              <span>This database does not have a dedicated Category property yet.</span>
              <button
                type="button"
                onClick={handleEnsureCategoryColumn}
                className="px-2.5 py-1 rounded-md bg-[var(--notion-accent)] text-white font-medium hover:bg-[var(--notion-accent-hover)]"
              >
                + Add Category property
              </button>
            </div>
          )}

          <div className="flex items-start gap-3 overflow-x-auto pb-2" data-testid={`kanban-${normalizedView}`}>
            {boardGroups.map((group) => (
              <div
                key={group.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColKey(group.key);
                }}
                onDragLeave={() => setDragOverColKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverColKey(null);
                  if (draggedRowId && activeGroupCol) {
                    const nextVal =
                      activeGroupCol.type === 'multi_select'
                        ? group.key === '__none__'
                          ? []
                          : [group.key]
                        : group.key === '__none__'
                        ? null
                        : group.key;
                    onUpdateRow(draggedRowId, { [activeGroupCol.id]: nextVal });
                    setDraggedRowId(null);
                  }
                }}
                className={`w-[220px] shrink-0 rounded-lg p-2 transition-colors ${
                  dragOverColKey === group.key
                    ? 'bg-[var(--notion-accent)]/10 ring-1 ring-[var(--notion-accent)]'
                    : 'bg-[var(--notion-surface-muted)]/60'
                }`}
              >
                <div className="flex items-center justify-between px-1 pb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-[4px] text-xs font-medium truncate ${
                        TAG_COLOR_CLASSES[group.color as TagColor] || TAG_COLOR_CLASSES.gray
                      }`}
                    >
                      {group.label}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--notion-text-muted)]">
                      {group.rows.length}
                    </span>
                  </div>
                  {activeGroupCol && (
                    <button
                      type="button"
                      aria-label={`Add card to ${group.label}`}
                      onClick={() => {
                        const cellVal =
                          activeGroupCol.type === 'multi_select'
                            ? group.key === '__none__'
                              ? []
                              : [group.key]
                            : group.key === '__none__'
                            ? null
                            : group.key;
                        onAddRow(
                          group.key === '__none__' ? {} : { [activeGroupCol.id]: cellVal },
                        );
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {group.rows.map((row) => {
                    const rowTitle = String(
                      (titleCol ? row.cells[titleCol.id] : '') || 'Untitled',
                    );
                    const otherCols = database.columns.filter(
                      (c) => c.id !== titleCol?.id && c.id !== activeGroupCol?.id,
                    );
                    const currentVal = activeGroupCol
                      ? Array.isArray(row.cells[activeGroupCol.id])
                        ? String((row.cells[activeGroupCol.id] as string[])[0] ?? '')
                        : String(row.cells[activeGroupCol.id] ?? '')
                      : '';

                    return (
                      <div
                        key={row.id}
                        draggable
                        onDragStart={() => setDraggedRowId(row.id)}
                        onDragEnd={() => {
                          setDraggedRowId(null);
                          setDragOverColKey(null);
                        }}
                        className="rounded-lg bg-[var(--notion-bg)] border border-[var(--notion-border)] p-3 shadow-xs hover:border-[var(--notion-border-strong)] transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenRowPage(row)}
                          className="w-full text-left text-[13.5px] font-medium text-[var(--notion-text)] hover:text-[var(--notion-accent)] transition-colors"
                        >
                          {rowTitle}
                        </button>

                        <div className="mt-2 space-y-1 text-xs text-[var(--notion-text-muted)]">
                          {otherCols.slice(0, 3).map((col) => {
                            const cellVal = row.cells[col.id];
                            if (
                              cellVal === null ||
                              cellVal === undefined ||
                              cellVal === '' ||
                              (Array.isArray(cellVal) && cellVal.length === 0)
                            ) {
                              return null;
                            }
                            if (col.type === 'select') {
                              return (
                                <div key={col.id}>{renderSelectOptionTag(col, cellVal)}</div>
                              );
                            }
                            if (col.type === 'multi_select' && Array.isArray(cellVal)) {
                              return (
                                <div key={col.id} className="flex flex-wrap gap-1">
                                  {cellVal.map((v) => (
                                    <React.Fragment key={v}>
                                      {renderSelectOptionTag(col, v)}
                                    </React.Fragment>
                                  ))}
                                </div>
                              );
                            }
                            if (col.type === 'checkbox') {
                              return (
                                <div key={col.id} className="text-[11.5px]">
                                  {col.name}: {cellVal ? 'Done' : 'Open'}
                                </div>
                              );
                            }
                            return (
                              <div key={col.id} className="truncate tabular-nums text-[11.5px]">
                                {String(cellVal)}
                              </div>
                            );
                          })}
                        </div>

                        {activeGroupCol && (
                          <div className="mt-2.5 pt-2 border-t border-[var(--notion-border)] flex items-center justify-between gap-2">
                            <select
                              value={currentVal}
                              onChange={(e) => {
                                const nextVal =
                                  activeGroupCol.type === 'multi_select'
                                    ? e.target.value
                                      ? [e.target.value]
                                      : []
                                    : e.target.value || null;
                                onUpdateRow(row.id, {
                                  [activeGroupCol.id]: nextVal,
                                });
                              }}
                              aria-label={`Move ${rowTitle} to ${activeGroupCol.name}`}
                              className="text-[11px] bg-transparent text-[var(--notion-text-muted)] hover:text-[var(--notion-text)] focus:outline-none cursor-pointer"
                            >
                              <option value="">Uncategorized</option>
                              {(activeGroupCol.options ?? []).map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => onOpenRowPage(row)}
                              className="text-[11px] text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]"
                            >
                              Open
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {activeGroupCol && (
                    <button
                      type="button"
                      onClick={() => {
                        const cellVal =
                          activeGroupCol.type === 'multi_select'
                            ? group.key === '__none__'
                              ? []
                              : [group.key]
                            : group.key === '__none__'
                            ? null
                            : group.key;
                        onAddRow(
                          group.key === '__none__' ? {} : { [activeGroupCol.id]: cellVal },
                        );
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CALENDAR VIEW */}
      {normalizedView === 'calendar' && (() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const startOffset = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const todayIso = new Date().toISOString().slice(0, 10);
        const monthLabel = calendarMonth.toLocaleString(undefined, {
          month: 'long',
          year: 'numeric',
        });

        const rowsByDate: Record<string, DatabaseRow[]> = {};
        if (dateCol) {
          for (const row of visibleRows) {
            const d = String(row.cells[dateCol.id] ?? '').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
              if (!rowsByDate[d]) rowsByDate[d] = [];
              rowsByDate[d].push(row);
            }
          }
        }

        return (
          <div className="py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--notion-text)]">{monthLabel}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
                  className="p-1.5 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  }}
                  className="px-2.5 py-1 rounded text-xs font-medium text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]"
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
                  className="p-1.5 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!dateCol && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--notion-surface-muted)] px-3 py-2 text-xs text-[var(--notion-text-muted)]">
                <span>Add a Date property to place items on calendar dates.</span>
                <button
                  type="button"
                  onClick={handleEnsureDateColumn}
                  className="px-2.5 py-1 rounded bg-[var(--notion-accent)] text-white font-medium hover:bg-[var(--notion-accent-hover)]"
                >
                  + Add Date property
                </button>
              </div>
            )}

            <div className="grid grid-cols-7 border-t border-l border-[var(--notion-border)] rounded-md overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
                <div
                  key={wd}
                  className="px-2 py-1.5 text-[11px] font-medium text-[var(--notion-text-muted)] bg-[var(--notion-surface-muted)]/60 border-r border-b border-[var(--notion-border)] text-center"
                >
                  {wd}
                </div>
              ))}

              {Array.from({ length: totalCells }).map((_, idx) => {
                const dayNum = idx - startOffset + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const isoDate = inMonth
                  ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                  : '';
                const dayRows = isoDate ? rowsByDate[isoDate] ?? [] : [];
                const isToday = isoDate === todayIso;

                return (
                  <div
                    key={idx}
                    className={`group/day min-h-[88px] p-1.5 border-r border-b border-[var(--notion-border)] flex flex-col gap-1 ${
                      inMonth
                        ? 'bg-[var(--notion-bg)]'
                        : 'bg-[var(--notion-surface-muted)]/30 opacity-50'
                    }`}
                  >
                    {inMonth && (
                      <>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[11px] tabular-nums w-5 h-5 flex items-center justify-center rounded-full ${
                              isToday
                                ? 'bg-[var(--notion-accent)] text-white font-semibold'
                                : 'text-[var(--notion-text-muted)]'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {dateCol && (
                            <button
                              type="button"
                              aria-label={`Add item on ${isoDate}`}
                              onClick={() => onAddRow({ [dateCol.id]: isoDate })}
                              className="opacity-0 group-hover/day:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-1">
                          {dayRows.map((row) => {
                            const rowTitle = String(
                              (titleCol ? row.cells[titleCol.id] : '') || 'Untitled',
                            );
                            const catBadge =
                              categoryCol && row.cells[categoryCol.id]
                                ? categoryCol.options?.find(
                                    (o) => o.id === row.cells[categoryCol.id],
                                  )?.label
                                : null;
                            return (
                              <button
                                key={row.id}
                                type="button"
                                onClick={() => onOpenRowPage(row)}
                                className="w-full text-left px-1.5 py-1 rounded bg-[var(--notion-surface-muted)] hover:bg-[var(--notion-hover)] border border-[var(--notion-border)] text-[11px] font-medium text-[var(--notion-text)] truncate"
                                title={catBadge ? `${rowTitle} (${catBadge})` : rowTitle}
                              >
                                {rowTitle}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
