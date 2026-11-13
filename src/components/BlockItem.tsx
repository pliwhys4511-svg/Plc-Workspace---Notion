import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Block,
  BlockColor,
  BlockType,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseViewType,
  Page,
} from '../lib/types';
import { CALLOUT_COLOR_CLASSES, ICON_CHOICES } from '../data/covers';
import {
  extractHeadingsForToc,
  formatNumberedMarker,
  stripHtmlToText,
} from '../lib/workspaceOps';
import { RichTextInput } from './RichTextInput';
import { DatabaseView } from './DatabaseView';

interface BlockItemProps {
  block: Block;
  allBlocks: Block[];
  index: number;
  numberedIndex: number;
  isLocked: boolean;
  isOnlyBlock: boolean;
  isFocused: boolean;
  allPages: Page[];
  databases: Record<string, Database>;
  registerInputRef: (blockId: string, el: HTMLElement | null) => void;
  onFocusBlock: (blockId: string) => void;
  onScrollToBlock: (blockId: string) => void;
  onChangeBlock: (blockId: string, patch: Partial<Block>) => void;
  onKeyDownBlock: (e: React.KeyboardEvent<HTMLElement>, block: Block) => void;
  onSlashTrigger: (blockId: string, query: string, rect: DOMRect) => void;
  onSlashDismiss: () => void;
  onAddBelow: (blockId: string, openSlash?: boolean) => void;
  onDuplicateBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, offset: -1 | 1) => void;
  onDragStartBlock: (blockId: string) => void;
  onDropOnBlock: (targetId: string, placement: 'before' | 'after') => void;
  onSelectPage: (pageId: string) => void;
  onUpdateDatabase: (
    dbId: string,
    patch: Partial<{
      title: string;
      icon: string;
      activeView: DatabaseViewType;
      groupByColumnId: string;
      columns: DatabaseColumn[];
    }>,
  ) => void;
  onAddDatabaseRow: (dbId: string, cells?: Record<string, DatabaseCellValue>) => void;
  onUpdateDatabaseRow: (
    dbId: string,
    rowId: string,
    cells: Record<string, DatabaseCellValue>,
  ) => void;
  onDeleteDatabaseRow: (dbId: string, rowId: string) => void;
  onOpenRowPage: (dbId: string, row: DatabaseRow) => void;
}

const TURN_INTO_TYPES: Array<{ type: BlockType; label: string }> = [
  { type: 'paragraph', label: 'Text' },
  { type: 'h1', label: 'Heading 1' },
  { type: 'h2', label: 'Heading 2' },
  { type: 'h3', label: 'Heading 3' },
  { type: 'todo', label: 'To-do list' },
  { type: 'bullet', label: 'Bulleted list' },
  { type: 'numbered', label: 'Numbered list' },
  { type: 'toggle', label: 'Toggle list' },
  { type: 'callout', label: 'Callout' },
  { type: 'quote', label: 'Quote' },
  { type: 'code', label: 'Code' },
  { type: 'equation', label: 'Equation' },
];

export const BlockItem: React.FC<BlockItemProps> = ({
  block,
  allBlocks,
  index,
  numberedIndex,
  isLocked,
  isOnlyBlock,
  isFocused,
  allPages,
  databases,
  registerInputRef,
  onFocusBlock,
  onScrollToBlock,
  onChangeBlock,
  onKeyDownBlock,
  onSlashTrigger,
  onSlashDismiss,
  onAddBelow,
  onDuplicateBlock,
  onDeleteBlock,
  onMoveBlock,
  onDragStartBlock,
  onDropOnBlock,
  onSelectPage,
  onUpdateDatabase,
  onAddDatabaseRow,
  onUpdateDatabaseRow,
  onDeleteDatabaseRow,
  onOpenRowPage,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [calloutIconsOpen, setCalloutIconsOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [dropPlacement, setDropPlacement] = useState<'before' | 'after' | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState(block.url || '');
  const [bookmarkUrlInput, setBookmarkUrlInput] = useState(block.url || '');

  const handleSlashCheck = (plainBeforeCaret: string, rect: DOMRect) => {
    const slashMatch = plainBeforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9]*)$/);
    if (slashMatch && block.type !== 'code') {
      onSlashTrigger(block.id, slashMatch[1], rect);
    } else {
      onSlashDismiss();
    }
  };

  const getPlaceholder = (): string => {
    switch (block.type) {
      case 'h1':
        return 'Heading 1';
      case 'h2':
        return 'Heading 2';
      case 'h3':
        return 'Heading 3';
      case 'todo':
        return 'To-do';
      case 'bullet':
      case 'numbered':
        return 'List';
      case 'toggle':
        return 'Toggle';
      case 'callout':
        return 'Type something...';
      case 'quote':
        return 'Empty quote';
      case 'code':
        return 'Write code...';
      case 'equation':
        return 'E = mc^2';
      default:
        return "Type '/' for commands";
    }
  };

  const textStyleClass = () => {
    switch (block.type) {
      case 'h1':
        return 'text-[1.875rem] font-bold leading-[1.2] tracking-[-0.02em]';
      case 'h2':
        return 'text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em]';
      case 'h3':
        return 'text-[1.25rem] font-semibold leading-[1.35]';
      case 'quote':
        return 'text-[1em] italic text-[var(--notion-text-secondary)] leading-[1.6]';
      case 'todo':
        return `text-[1em] leading-[1.6] ${
          block.checked ? 'line-through text-[var(--notion-text-muted)]' : ''
        }`;
      default:
        return 'text-[1em] leading-[1.6]';
    }
  };

  const colorClass = () => {
    if (!block.color || block.color === 'default') return '';
    const map: Record<string, string> = {
      gray: 'text-[#787774] dark:text-[#9b9a97]',
      blue: 'text-[#2383e2] dark:text-[#529cca]',
      green: 'text-[#0f7b6c] dark:text-[#4dab9a]',
      yellow: 'text-[#dfab01] dark:text-[#ffdc49]',
      red: 'text-[#e03e3e] dark:text-[#ff7369]',
    };
    return map[block.color] || '';
  };

  const spacingClass = () => {
    if (block.type === 'h1') return 'mt-5 mb-1';
    if (block.type === 'h2') return 'mt-4 mb-0.5';
    if (block.type === 'h3') return 'mt-3 mb-0.5';
    if (block.type === 'divider') return 'my-2';
    if (
      block.type === 'callout' ||
      block.type === 'code' ||
      block.type === 'database' ||
      block.type === 'table' ||
      block.type === 'image' ||
      block.type === 'bookmark' ||
      block.type === 'equation' ||
      block.type === 'toc'
    ) {
      return 'my-2';
    }
    return 'my-0.5';
  };

  const indentPx =
    block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo'
      ? Math.min(block.indent ?? 0, 3) * 24
      : 0;

  const bulletSymbol = () => {
    const level = (block.indent ?? 0) % 3;
    if (level === 1) return '◦';
    if (level === 2) return '▪';
    return '•';
  };

  const renderInner = () => {
    if (block.type === 'divider') {
      return (
        <div className="py-2.5">
          <hr className="border-t border-[var(--notion-border-strong)]" />
        </div>
      );
    }

    if (block.type === 'toc') {
      const headings = extractHeadingsForToc(allBlocks);
      return (
        <div className="rounded-md bg-[var(--notion-surface-muted)]/60 border border-[var(--notion-border)] px-4 py-3 space-y-1">
          <div className="text-[11px] font-semibold text-[var(--notion-text-muted)] mb-1">
            Table of Contents
          </div>
          {headings.length === 0 ? (
            <div className="text-xs text-[var(--notion-text-faint)]">
              Add Heading 1, 2, or 3 blocks to populate an outline.
            </div>
          ) : (
            headings.map((h) => (
              <button
                key={h.blockId}
                type="button"
                onClick={() => onScrollToBlock(h.blockId)}
                style={{ paddingLeft: `${(h.level - 1) * 14}px` }}
                className="block w-full text-left text-[13px] text-[var(--notion-text-secondary)] hover:text-[var(--notion-text)] underline decoration-[var(--notion-border-strong)] underline-offset-4 py-0.5 truncate"
              >
                {h.text}
              </button>
            ))
          )}
        </div>
      );
    }

    if (block.type === 'equation') {
      return (
        <div className="rounded-md bg-[var(--notion-surface-muted)]/60 border border-[var(--notion-border)] px-4 py-3 text-center">
          <input
            type="text"
            value={stripHtmlToText(block.content)}
            readOnly={isLocked}
            onChange={(e) => onChangeBlock(block.id, { content: e.target.value })}
            aria-label="Block equation"
            placeholder="Write an equation (e.g. E = mc²)"
            className="w-full text-center bg-transparent font-notion-serif italic text-lg text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
          />
        </div>
      );
    }

    if (block.type === 'table') {
      const rows = block.rows && block.rows.length > 0 ? block.rows : [['Column 1', 'Column 2'], ['', '']];
      const hasHeader = block.hasHeaderRow !== false;
      const colCount = rows[0]?.length ?? 2;

      const updateCell = (rIdx: number, cIdx: number, val: string) => {
        const next = rows.map((r, ri) =>
          ri === rIdx ? r.map((cell, ci) => (ci === cIdx ? val : cell)) : r,
        );
        onChangeBlock(block.id, { rows: next });
      };

      const addRow = () => {
        const next = [...rows, Array.from({ length: colCount }, () => '')];
        onChangeBlock(block.id, { rows: next });
      };

      const addCol = () => {
        const next = rows.map((r, ri) => [...r, ri === 0 ? `Column ${colCount + 1}` : '']);
        onChangeBlock(block.id, { rows: next });
      };

      return (
        <div className="space-y-1.5 overflow-x-auto">
          <table className="w-full border-collapse border border-[var(--notion-border-strong)] rounded-md text-left text-xs">
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={
                    hasHeader && rIdx === 0
                      ? 'bg-[var(--notion-surface-muted)] font-semibold'
                      : 'bg-[var(--notion-bg)]'
                  }
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="border border-[var(--notion-border)] p-0 min-w-[110px]"
                    >
                      <input
                        type="text"
                        value={cell}
                        readOnly={isLocked}
                        onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                        aria-label={`Table row ${rIdx + 1} column ${cIdx + 1}`}
                        placeholder={rIdx === 0 && hasHeader ? `Col ${cIdx + 1}` : ''}
                        className="w-full px-2.5 py-1.5 bg-transparent text-[var(--notion-text)] focus:outline-none focus:bg-[var(--notion-hover)]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!isLocked && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--notion-text-muted)]">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--notion-hover)]"
              >
                <Plus className="w-3 h-3" />
                <span>Add row</span>
              </button>
              <button
                type="button"
                onClick={addCol}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--notion-hover)]"
              >
                <Plus className="w-3 h-3" />
                <span>Add column</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeBlock(block.id, { hasHeaderRow: !hasHeader })}
                className="px-2 py-0.5 rounded hover:bg-[var(--notion-hover)]"
              >
                {hasHeader ? 'Header row: On' : 'Header row: Off'}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (block.type === 'image') {
      const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            onChangeBlock(block.id, { url: reader.result, caption: block.caption || file.name });
          }
        };
        reader.readAsDataURL(file);
      };

      if (!block.url) {
        return (
          <div className="rounded-md border border-[var(--notion-border-strong)] bg-[var(--notion-surface-muted)]/60 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--notion-text-secondary)]">
              <ImageIcon className="w-4 h-4" />
              <span>Add an image (stored offline or via link)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-xs font-medium text-[var(--notion-text)] hover:bg-[var(--notion-hover)] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (imageUrlInput.trim()) {
                    onChangeBlock(block.id, { url: imageUrlInput.trim() });
                  }
                }}
                className="flex-1 flex items-center gap-1.5 min-w-[200px]"
              >
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="Paste image link..."
                  aria-label="Image URL"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-[var(--notion-bg)] border border-[var(--notion-border)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--notion-accent)] text-white"
                >
                  Embed
                </button>
              </form>
            </div>
          </div>
        );
      }

      return (
        <figure className="space-y-1.5">
          <div className="relative group/img rounded-md overflow-hidden border border-[var(--notion-border)] bg-[var(--notion-surface-muted)]">
            <img
              src={block.url}
              alt={block.caption || 'Embedded block image'}
              referrerPolicy="no-referrer"
              className="w-full max-h-[420px] object-contain mx-auto"
            />
            {!isLocked && (
              <button
                type="button"
                onClick={() => onChangeBlock(block.id, { url: '' })}
                className="opacity-0 group-hover/img:opacity-100 absolute top-2 right-2 px-2 py-1 rounded text-xs bg-[var(--notion-popover)]/95 border border-[var(--notion-border-strong)] text-[var(--notion-text)]"
              >
                Replace
              </button>
            )}
          </div>
          <input
            type="text"
            value={block.caption ?? ''}
            readOnly={isLocked}
            onChange={(e) => onChangeBlock(block.id, { caption: e.target.value })}
            placeholder="Write a caption..."
            aria-label="Image caption"
            className="w-full text-xs text-[var(--notion-text-muted)] bg-transparent focus:outline-none"
          />
        </figure>
      );
    }

    if (block.type === 'bookmark') {
      if (!block.url) {
        return (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = bookmarkUrlInput.trim();
              if (val) {
                const safe = /^https?:\/\//i.test(val) ? val : `https://${val}`;
                onChangeBlock(block.id, {
                  url: safe,
                  content: block.content || safe.replace(/^https?:\/\//, ''),
                });
              }
            }}
            className="flex items-center gap-2 rounded-md border border-[var(--notion-border-strong)] bg-[var(--notion-surface-muted)]/60 p-3"
          >
            <Bookmark className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
            <input
              type="text"
              value={bookmarkUrlInput}
              onChange={(e) => setBookmarkUrlInput(e.target.value)}
              placeholder="Paste web link to create bookmark..."
              aria-label="Bookmark URL"
              className="flex-1 bg-transparent text-xs text-[var(--notion-text)] focus:outline-none"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded text-xs font-medium bg-[var(--notion-accent)] text-white"
            >
              Create bookmark
            </button>
          </form>
        );
      }

      return (
        <div className="rounded-md border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] hover:bg-[var(--notion-hover)] transition-colors p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <input
              type="text"
              value={stripHtmlToText(block.content)}
              readOnly={isLocked}
              onChange={(e) => onChangeBlock(block.id, { content: e.target.value })}
              aria-label="Bookmark title"
              className="w-full bg-transparent text-sm font-medium text-[var(--notion-text)] focus:outline-none"
            />
            <div className="text-xs text-[var(--notion-text-muted)] truncate">{block.url}</div>
          </div>
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${block.url}`}
            className="p-2 rounded hover:bg-[var(--notion-active)] text-[var(--notion-text-muted)] shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      );
    }

    if (block.type === 'database') {
      const db = block.databaseId ? databases[block.databaseId] : undefined;
      if (!db) {
        return (
          <div className="rounded-lg border border-dashed border-[var(--notion-border-strong)] p-4 text-xs text-[var(--notion-text-muted)]">
            Initializing inline database...
          </div>
        );
      }
      return (
        <div className="rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] p-3">
          <DatabaseView
            database={db}
            compact
            onUpdateDatabase={(patch) => onUpdateDatabase(db.id, patch)}
            onAddRow={(cells) => onAddDatabaseRow(db.id, cells)}
            onUpdateRow={(rowId, cells) => onUpdateDatabaseRow(db.id, rowId, cells)}
            onDeleteRow={(rowId) => onDeleteDatabaseRow(db.id, rowId)}
            onOpenRowPage={(row) => onOpenRowPage(db.id, row)}
          />
        </div>
      );
    }

    if (block.type === 'page_link') {
      const linkable = allPages.filter((p) => !p.isTrashed && !p.isRowPage);
      const target = linkable.find((p) => p.id === block.targetPageId) ?? linkable[0];
      return (
        <div className="group/link flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--notion-hover)] transition-colors">
          <button
            type="button"
            onClick={() => target && onSelectPage(target.id)}
            className="flex items-center gap-2 min-w-0 text-left flex-1"
          >
            <span className="text-base leading-none shrink-0">{target?.icon || '📄'}</span>
            <span className="text-sm font-medium text-[var(--notion-text)] underline decoration-[var(--notion-border-strong)] underline-offset-4 truncate">
              {target?.title || 'Select a page'}
            </span>
          </button>
          {!isLocked && (
            <select
              value={target?.id ?? ''}
              onChange={(e) => {
                const chosen = linkable.find((p) => p.id === e.target.value);
                onChangeBlock(block.id, {
                  targetPageId: e.target.value,
                  content: chosen?.title ?? '',
                });
              }}
              aria-label="Choose linked page"
              className="opacity-0 group-hover/link:opacity-100 focus:opacity-100 transition-opacity text-xs bg-[var(--notion-bg)] border border-[var(--notion-border)] rounded px-2 py-0.5 text-[var(--notion-text-secondary)]"
            >
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.title || 'Untitled'}
                </option>
              ))}
            </select>
          )}
        </div>
      );
    }

    if (block.type === 'code') {
      return (
        <div className="rounded-md bg-[var(--notion-code-bg)] border border-[var(--notion-border)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--notion-border)] text-xs text-[var(--notion-text-muted)]">
            <select
              value={block.language || 'typescript'}
              disabled={isLocked}
              onChange={(e) => onChangeBlock(block.id, { language: e.target.value })}
              aria-label="Code language"
              className="bg-transparent text-xs font-mono text-[var(--notion-text-secondary)] focus:outline-none cursor-pointer"
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="sql">SQL</option>
              <option value="bash">Bash</option>
              <option value="json">JSON</option>
              <option value="html">HTML / CSS</option>
            </select>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(stripHtmlToText(block.content));
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
            >
              {codeCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{codeCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <textarea
            ref={(el) => registerInputRef(block.id, el)}
            value={stripHtmlToText(block.content)}
            readOnly={isLocked}
            rows={Math.max(2, stripHtmlToText(block.content).split('\n').length)}
            onFocus={() => onFocusBlock(block.id)}
            onChange={(e) => onChangeBlock(block.id, { content: e.target.value })}
            onKeyDown={(e) => onKeyDownBlock(e, block)}
            placeholder={getPlaceholder()}
            aria-label="Code block editor"
            className="w-full p-3.5 bg-transparent resize-y font-notion-mono text-[13px] leading-[1.6] text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
          />
        </div>
      );
    }

    if (block.type === 'callout') {
      const boxTone =
        CALLOUT_COLOR_CLASSES[block.color || 'gray'] || CALLOUT_COLOR_CLASSES.gray;
      return (
        <div className={`relative flex items-start gap-3 rounded-md border px-4 py-3 ${boxTone}`}>
          <div className="relative shrink-0 pt-0.5">
            <button
              type="button"
              disabled={isLocked}
              aria-label="Change callout icon"
              onClick={() => setCalloutIconsOpen((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 text-lg leading-none"
            >
              {block.icon || '💡'}
            </button>
            {calloutIconsOpen && (
              <div className="absolute left-0 top-8 z-40 w-56 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-2 grid grid-cols-6 gap-1">
                {ICON_CHOICES.slice(0, 18).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onChangeBlock(block.id, { icon: emoji });
                      setCalloutIconsOpen(false);
                    }}
                    className="h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)]"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <RichTextInput
            blockId={block.id}
            html={block.content}
            placeholder={getPlaceholder()}
            readOnly={isLocked}
            ariaLabel="Callout content"
            registerRef={registerInputRef}
            onFocus={() => onFocusBlock(block.id)}
            onChangeHtml={(content) => onChangeBlock(block.id, { content })}
            onKeyDown={(e) => onKeyDownBlock(e, block)}
            onSlashCheck={handleSlashCheck}
            onSlashDismiss={onSlashDismiss}
            className="flex-1 text-[1em] leading-[1.6] text-[var(--notion-text)]"
          />
        </div>
      );
    }

    if (block.type === 'quote') {
      return (
        <div className="flex items-start gap-2.5 rounded-md bg-[var(--notion-surface-muted)]/55 px-4 py-2.5">
          <span
            className="text-xl leading-none font-notion-serif text-[var(--notion-text-faint)] select-none pt-0.5"
            aria-hidden="true"
          >
            “
          </span>
          <RichTextInput
            blockId={block.id}
            html={block.content}
            placeholder={getPlaceholder()}
            readOnly={isLocked}
            ariaLabel="Quote block"
            registerRef={registerInputRef}
            onFocus={() => onFocusBlock(block.id)}
            onChangeHtml={(content) => onChangeBlock(block.id, { content })}
            onKeyDown={(e) => onKeyDownBlock(e, block)}
            onSlashCheck={handleSlashCheck}
            onSlashDismiss={onSlashDismiss}
            className={`flex-1 ${textStyleClass()} ${colorClass()}`}
          />
        </div>
      );
    }

    if (block.type === 'toggle') {
      return (
        <div>
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              aria-label={block.open ? 'Collapse toggle' : 'Expand toggle'}
              aria-expanded={Boolean(block.open)}
              onClick={() => onChangeBlock(block.id, { open: !block.open })}
              className="mt-1 w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-secondary)] shrink-0 transition-transform"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  block.open ? 'rotate-90' : ''
                }`}
              />
            </button>
            <RichTextInput
              blockId={block.id}
              html={block.content}
              placeholder={getPlaceholder()}
              readOnly={isLocked}
              ariaLabel="Toggle heading"
              registerRef={registerInputRef}
              onFocus={() => onFocusBlock(block.id)}
              onChangeHtml={(content) => onChangeBlock(block.id, { content })}
              onKeyDown={(e) => onKeyDownBlock(e, block)}
              onSlashCheck={handleSlashCheck}
              onSlashDismiss={onSlashDismiss}
              className={`flex-1 font-medium text-[var(--notion-text)] ${textStyleClass()}`}
            />
          </div>
          {block.open && (
            <div className="pl-6 mt-1">
              <textarea
                value={stripHtmlToText(block.details ?? '')}
                readOnly={isLocked}
                rows={Math.max(1, (block.details ?? '').split('\n').length)}
                onChange={(e) => onChangeBlock(block.id, { details: e.target.value })}
                placeholder="Write hidden toggle content..."
                aria-label="Toggle body content"
                className="w-full bg-transparent resize-none text-[0.95em] leading-[1.6] text-[var(--notion-text-secondary)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2" style={{ paddingLeft: `${indentPx}px` }}>
        {block.type === 'todo' && (
          <input
            type="checkbox"
            checked={Boolean(block.checked)}
            disabled={isLocked}
            onChange={(e) => onChangeBlock(block.id, { checked: e.target.checked })}
            aria-label={`Mark "${stripHtmlToText(block.content) || 'to-do'}" complete`}
            className="mt-[5px] w-4 h-4 rounded-[3px] accent-[var(--notion-accent)] cursor-pointer shrink-0"
          />
        )}

        {block.type === 'bullet' && (
          <span
            className="mt-[2px] w-5 text-center text-base leading-[1.4] text-[var(--notion-text)] select-none shrink-0"
            aria-hidden="true"
          >
            {bulletSymbol()}
          </span>
        )}

        {block.type === 'numbered' && (
          <span
            className="mt-[2px] min-w-[22px] text-right pr-1 text-[0.95em] tabular-nums leading-[1.6] text-[var(--notion-text-secondary)] select-none shrink-0"
            aria-hidden="true"
          >
            {formatNumberedMarker(numberedIndex, block.indent ?? 0)}
          </span>
        )}

        <RichTextInput
          blockId={block.id}
          html={block.content}
          placeholder={getPlaceholder()}
          hideWhenUnfocused={block.type === 'paragraph' && !isOnlyBlock && !isFocused}
          readOnly={isLocked}
          ariaLabel={`Block ${index + 1} (${block.type})`}
          registerRef={registerInputRef}
          onFocus={() => onFocusBlock(block.id)}
          onChangeHtml={(content) => onChangeBlock(block.id, { content })}
          onKeyDown={(e) => onKeyDownBlock(e, block)}
          onSlashCheck={handleSlashCheck}
          onSlashDismiss={onSlashDismiss}
          className={`flex-1 text-[var(--notion-text)] ${textStyleClass()} ${colorClass()}`}
        />
      </div>
    );
  };

  return (
    <div
      id={`block-${block.id}`}
      className={`group/block relative ${spacingClass()}`}
      onDragOver={(e) => {
        if (isLocked) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        setDropPlacement(e.clientY < mid ? 'before' : 'after');
      }}
      onDragLeave={() => setDropPlacement(null)}
      onDrop={(e) => {
        if (isLocked) return;
        e.preventDefault();
        const placement = dropPlacement ?? 'after';
        setDropPlacement(null);
        onDropOnBlock(block.id, placement);
      }}
    >
      {dropPlacement === 'before' && (
        <div className="absolute -top-0.5 inset-x-0 h-[2px] bg-[var(--notion-accent)] rounded-full pointer-events-none z-20" />
      )}
      {dropPlacement === 'after' && (
        <div className="absolute -bottom-0.5 inset-x-0 h-[2px] bg-[var(--notion-accent)] rounded-full pointer-events-none z-20" />
      )}

      {!isLocked && (
        <div className="hidden sm:flex items-center gap-0.5 absolute -left-13 top-0.5 opacity-0 group-hover/block:opacity-100 focus-within:opacity-100 transition-opacity select-none">
          <button
            type="button"
            aria-label="Add block below"
            onClick={() => onAddBelow(block.id, true)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-faint)] hover:text-[var(--notion-text)]"
            title="Click to add block below"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              draggable
              aria-label="Block actions and drag handle"
              onDragStart={() => onDragStartBlock(block.id)}
              onClick={() => setMenuOpen((v) => !v)}
              className="w-5 h-6 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-faint)] hover:text-[var(--notion-text)] cursor-grab active:cursor-grabbing"
              title="Drag to move · Click for options"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div
                className="absolute left-0 top-7 z-50 w-52 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-1.5 space-y-1"
                role="menu"
              >
                <div className="px-2 py-0.5 text-[11px] font-semibold text-[var(--notion-text-muted)]">
                  Block Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDuplicateBlock(block.id);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                >
                  <Copy className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveBlock(block.id, -1);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                  <span>Move up</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveBlock(block.id, 1);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                  <span>Move down</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteBlock(block.id);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                {block.type !== 'database' && block.type !== 'divider' && block.type !== 'table' && (
                  <>
                    <div className="pt-1 mt-1 border-t border-[var(--notion-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--notion-text-muted)]">
                      Turn into
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      {TURN_INTO_TYPES.map((t) => (
                        <button
                          key={t.type}
                          type="button"
                          onClick={() => {
                            onChangeBlock(block.id, { type: t.type });
                            setMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-[var(--notion-hover)] ${
                            block.type === t.type
                              ? 'text-[var(--notion-accent)] font-medium'
                              : 'text-[var(--notion-text)]'
                          }`}
                        >
                          <FileText className="w-3 h-3 opacity-60" />
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 mt-1 border-t border-[var(--notion-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--notion-text-muted)]">
                      Color
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1">
                      {(['default', 'gray', 'blue', 'green', 'yellow', 'red'] as BlockColor[]).map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Set block color ${c}`}
                            onClick={() => {
                              onChangeBlock(block.id, { color: c });
                              setMenuOpen(false);
                            }}
                            className={`w-5 h-5 rounded border border-[var(--notion-border-strong)] flex items-center justify-center text-[10px] font-bold ${
                              c === 'default'
                                ? 'text-[var(--notion-text)]'
                                : c === 'gray'
                                ? 'text-[#787774]'
                                : c === 'blue'
                                ? 'text-[#2383e2]'
                                : c === 'green'
                                ? 'text-[#0f7b6c]'
                                : c === 'yellow'
                                ? 'text-[#dfab01]'
                                : 'text-[#e03e3e]'
                            }`}
                          >
                            A
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {renderInner()}
    </div>
  );
};
