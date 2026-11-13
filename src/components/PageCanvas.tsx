import React, { useCallback, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Plus,
  Smile,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Block,
  BlockType,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseViewType,
  Page,
} from '../lib/types';
import {
  createId,
  deleteBlockAt,
  getNumberedListIndex,
  insertBlockAfter,
  moveBlockByOffset,
  parseMarkdownShortcut,
  reorderBlock,
  stripHtmlToText,
} from '../lib/workspaceOps';
import { resolveCover } from '../data/covers';
import { CoverPicker, IconPicker } from './CoverIconPickers';
import { BlockItem } from './BlockItem';
import { SlashMenu } from './SlashMenu';
import { DatabaseView } from './DatabaseView';

function getCaretInfo(el: HTMLElement): {
  atStart: boolean;
  atEnd: boolean;
  splitHtml: () => { before: string; after: string };
} {
  if (el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? el.value.length;
    return {
      atStart: pos === 0,
      atEnd: pos === el.value.length,
      splitHtml: () => ({
        before: el.value.slice(0, pos),
        after: el.value.slice(pos),
      }),
    };
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return {
      atStart: false,
      atEnd: true,
      splitHtml: () => ({ before: el.innerHTML, after: '' }),
    };
  }

  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) {
    return {
      atStart: false,
      atEnd: true,
      splitHtml: () => ({ before: el.innerHTML, after: '' }),
    };
  }

  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);

  const post = range.cloneRange();
  post.selectNodeContents(el);
  post.setStart(range.endContainer, range.endOffset);

  return {
    atStart: pre.toString().length === 0,
    atEnd: post.toString().length === 0,
    splitHtml: () => {
      const beforeDiv = document.createElement('div');
      beforeDiv.appendChild(pre.cloneContents());
      const afterDiv = document.createElement('div');
      afterDiv.appendChild(post.cloneContents());
      return {
        before: beforeDiv.innerHTML === '<br>' ? '' : beforeDiv.innerHTML,
        after: afterDiv.innerHTML === '<br>' ? '' : afterDiv.innerHTML,
      };
    },
  };
}

interface PageCanvasProps {
  page: Page;
  blocks: Block[];
  allPages: Page[];
  databases: Record<string, Database>;
  onUpdatePage: (patch: Partial<Page>) => void;
  onUpdateBlocks: (blocks: Block[]) => void;
  onSelectPage: (pageId: string) => void;
  onCreateSubpage: (parentId: string) => void;
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
  onOpenComments?: () => void;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({
  page,
  blocks,
  allPages,
  databases,
  onUpdatePage,
  onUpdateBlocks,
  onSelectPage,
  onCreateSubpage,
  onUpdateDatabase,
  onAddDatabaseRow,
  onUpdateDatabaseRow,
  onDeleteDatabaseRow,
  onOpenRowPage,
  onOpenComments,
}) => {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [repositionOpen, setRepositionOpen] = useState(false);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [slashState, setSlashState] = useState<{
    blockId: string;
    query: string;
    position: { top: number; left: number; anchorTop?: number };
  } | null>(null);

  const inputRefs = useRef<Record<string, HTMLElement | null>>({});

  const registerInputRef = useCallback((blockId: string, el: HTMLElement | null) => {
    inputRefs.current[blockId] = el;
  }, []);

  const focusBlockById = useCallback((blockId: string, atEnd = true) => {
    setFocusedBlockId(blockId);
    requestAnimationFrame(() => {
      const el = inputRefs.current[blockId];
      if (!el) return;
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        if (atEnd) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        } else {
          el.setSelectionRange(0, 0);
        }
      } else {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(!atEnd);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });
  }, []);

  const scrollToBlock = useCallback(
    (blockId: string) => {
      const target = document.getElementById(`block-${blockId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      focusBlockById(blockId, true);
    },
    [focusBlockById],
  );

  const coverData = resolveCover(page.cover);

  const fontClass =
    page.font === 'serif'
      ? 'font-notion-serif'
      : page.font === 'mono'
      ? 'font-notion-mono'
      : 'font-notion-sans';

  const sizeClass = page.smallText ? 'text-[14px]' : 'text-[16px]';
  const containerClass = page.fullWidth
    ? 'w-full max-w-none px-4 sm:px-10'
    : 'w-full max-w-[760px] mx-auto px-5 sm:px-14';

  const childPages = allPages.filter(
    (p) => !p.isTrashed && !p.isRowPage && p.parentId === page.id,
  );

  const handleChangeBlock = (blockId: string, patch: Partial<Block>) => {
    if (page.locked) return;
    let nextBlocks = blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b));

    // Check live Markdown shortcut conversion on paragraph blocks
    if (patch.content !== undefined) {
      const target = nextBlocks.find((b) => b.id === blockId);
      if (target && target.type === 'paragraph') {
        const plainRaw = patch.content
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        const shortcut = parseMarkdownShortcut(plainRaw);
        if (shortcut) {
          nextBlocks = nextBlocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  type: shortcut.type,
                  content: shortcut.content,
                  checked: shortcut.checked ?? b.checked,
                  open: shortcut.type === 'toggle' ? true : b.open,
                  language: shortcut.type === 'code' ? 'typescript' : b.language,
                }
              : b,
          );
          if (shortcut.type === 'divider') {
            const newPara: Block = {
              id: createId('blk'),
              pageId: page.id,
              type: 'paragraph',
              content: '',
              position: 0,
            };
            nextBlocks = insertBlockAfter(nextBlocks, blockId, newPara);
            onUpdateBlocks(nextBlocks);
            focusBlockById(newPara.id);
            return;
          }
        }
      }
    }

    onUpdateBlocks(nextBlocks);
  };

  const handleAddBelow = (afterId: string | null, openSlash = false) => {
    if (page.locked) return;
    const newBlock: Block = {
      id: createId('blk'),
      pageId: page.id,
      type: 'paragraph',
      content: openSlash ? '/' : '',
      position: 0,
    };
    const next = insertBlockAfter(blocks, afterId, newBlock);
    onUpdateBlocks(next);
    focusBlockById(newBlock.id);
    if (openSlash) {
      requestAnimationFrame(() => {
        const el = inputRefs.current[newBlock.id];
        if (el) {
          const rect = el.getBoundingClientRect();
          setSlashState({
            blockId: newBlock.id,
            query: '',
            position: { top: rect.bottom + 6, left: rect.left, anchorTop: rect.top },
          });
        }
      });
    }
  };

  const handleKeyDownBlock = (
    e: React.KeyboardEvent<HTMLElement>,
    block: Block,
  ) => {
    if (page.locked) return;

    // When slash menu is open, let SlashMenu handle ArrowUp/Down/Enter/Escape
    if (slashState && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      return;
    }

    const el = e.currentTarget;
    const idx = blocks.findIndex((b) => b.id === block.id);
    const caretInfo = getCaretInfo(el);
    const plainContent = stripHtmlToText(block.content);

    // Tab / Shift+Tab indentation for lists & todos
    if (
      e.key === 'Tab' &&
      (block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo')
    ) {
      e.preventDefault();
      const currIndent = block.indent ?? 0;
      const nextIndent = e.shiftKey ? Math.max(0, currIndent - 1) : Math.min(3, currIndent + 1);
      handleChangeBlock(block.id, { indent: nextIndent });
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      const continueType: BlockType =
        block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered'
          ? block.type
          : 'paragraph';

      // Pressing Enter on an empty list/todo outdents first or exits back to plain paragraph
      if (
        (block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered') &&
        plainContent === ''
      ) {
        if ((block.indent ?? 0) > 0) {
          handleChangeBlock(block.id, { indent: (block.indent ?? 0) - 1 });
        } else {
          handleChangeBlock(block.id, { type: 'paragraph', indent: 0 });
        }
        return;
      }

      const { before, after } = caretInfo.splitHtml();
      const updatedCurrent = blocks.map((b) =>
        b.id === block.id ? { ...b, content: before } : b,
      );
      const nextBlock: Block = {
        id: createId('blk'),
        pageId: page.id,
        type: continueType,
        content: after,
        checked: false,
        indent: continueType === 'paragraph' ? 0 : block.indent ?? 0,
        position: 0,
      };
      const next = insertBlockAfter(updatedCurrent, block.id, nextBlock);
      onUpdateBlocks(next);
      focusBlockById(nextBlock.id, false);
      return;
    }

    if (e.key === 'Backspace' && plainContent === '' && caretInfo.atStart) {
      if ((block.indent ?? 0) > 0) {
        e.preventDefault();
        handleChangeBlock(block.id, { indent: (block.indent ?? 0) - 1 });
        return;
      }
      if (block.type !== 'paragraph') {
        e.preventDefault();
        handleChangeBlock(block.id, { type: 'paragraph', indent: 0 });
        return;
      }
      if (blocks.length > 1) {
        e.preventDefault();
        const prev = blocks[idx - 1];
        onUpdateBlocks(deleteBlockAt(blocks, block.id));
        if (prev) focusBlockById(prev.id);
      }
      return;
    }

    if (e.key === 'ArrowUp' && caretInfo.atStart && idx > 0) {
      e.preventDefault();
      focusBlockById(blocks[idx - 1].id);
    } else if (e.key === 'ArrowDown' && caretInfo.atEnd && idx < blocks.length - 1) {
      e.preventDefault();
      focusBlockById(blocks[idx + 1].id, false);
    }
  };

  const handleSelectSlashType = (type: BlockType) => {
    if (!slashState) return;
    const { blockId } = slashState;
    const target = blocks.find((b) => b.id === blockId);
    if (!target) {
      setSlashState(null);
      return;
    }

    // Strip the trailing "/query" from block content
    const cleaned = target.content
      .replace(/(?:^|\s|&nbsp;)\/[a-zA-Z0-9]*$/i, '')
      .replace(/^\/[a-zA-Z0-9]*$/i, '')
      .trim();

    const next = blocks.map((b) => {
      if (b.id !== blockId) return b;
      const base: Block = {
        ...b,
        type,
        content:
          type === 'divider' || type === 'toc' || type === 'image' || type === 'table' || type === 'bookmark'
            ? ''
            : type === 'database'
            ? 'Inline Database'
            : cleaned,
        open: type === 'toggle' ? true : b.open,
        icon: type === 'callout' ? b.icon || '💡' : b.icon,
        language: type === 'code' ? b.language || 'typescript' : b.language,
      };
      if (type === 'table') {
        base.rows = [
          ['Column 1', 'Column 2', 'Column 3'],
          ['', '', ''],
          ['', '', ''],
        ];
        base.hasHeaderRow = true;
      }
      return base;
    });

    if (type === 'divider') {
      const followUp: Block = {
        id: createId('blk'),
        pageId: page.id,
        type: 'paragraph',
        content: '',
        position: 0,
      };
      onUpdateBlocks(insertBlockAfter(next, blockId, followUp));
      setSlashState(null);
      focusBlockById(followUp.id);
      return;
    }

    onUpdateBlocks(next);
    setSlashState(null);
    if (!['database', 'page_link', 'table', 'image', 'bookmark', 'toc'].includes(type)) {
      focusBlockById(blockId);
    }
  };

  const pageDatabase =
    page.isDatabase && page.databaseId ? databases[page.databaseId] : undefined;

  return (
    <div id="scroll" className="flex-1 overflow-y-auto pb-32">
      {/* Cover Banner */}
      {coverData && (
        <div className="group/cover relative w-full h-44 sm:h-52 overflow-hidden bg-[var(--notion-surface-muted)]">
          {coverData.kind === 'image' || coverData.kind === 'url' ? (
            <img
              src={coverData.src}
              alt="Page cover"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              style={{ objectPosition: `50% ${page.coverPosition}%` }}
            />
          ) : (
            <div className="w-full h-full" style={{ background: coverData.gradient }} />
          )}

          {!page.locked && (
            <div className="absolute right-4 bottom-3 flex items-center gap-1.5 opacity-0 group-hover/cover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setCoverPickerOpen((v) => !v)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--notion-popover)]/95 border border-[var(--notion-border-strong)] text-[var(--notion-text)] shadow-sm hover:bg-[var(--notion-popover)]"
              >
                Change cover
              </button>
              {(coverData.kind === 'image' || coverData.kind === 'url') && (
                <button
                  type="button"
                  onClick={() => setRepositionOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--notion-popover)]/95 border border-[var(--notion-border-strong)] text-[var(--notion-text)] shadow-sm hover:bg-[var(--notion-popover)]"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Reposition</span>
                </button>
              )}
            </div>
          )}

          {repositionOpen && (
            <div className="absolute right-4 bottom-12 z-30 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)]">
              <label htmlFor="cover-pos-slider" className="text-xs text-[var(--notion-text-muted)]">
                Vertical
              </label>
              <input
                id="cover-pos-slider"
                type="range"
                min={0}
                max={100}
                value={page.coverPosition}
                onChange={(e) => onUpdatePage({ coverPosition: Number(e.target.value) })}
                className="w-28 accent-[var(--notion-accent)]"
              />
              <button
                type="button"
                onClick={() => setRepositionOpen(false)}
                className="text-xs text-[var(--notion-accent)] font-medium"
              >
                Done
              </button>
            </div>
          )}

          {coverPickerOpen && (
            <CoverPicker
              currentCover={page.cover}
              onSelect={(cover) => onUpdatePage({ cover })}
              onClose={() => setCoverPickerOpen(false)}
            />
          )}
        </div>
      )}

      {/* Main Page Column */}
      <div id="page" className={`${containerClass} ${fontClass} ${sizeClass}`}>
        {/* Page Header Controls (Add icon / Add cover) */}
        <div
          className={`group/header relative ${
            coverData ? '-mt-9 mb-4' : 'pt-10 mb-3'
          }`}
        >
          {/* Floating Cover Picker when no cover exists */}
          {!coverData && coverPickerOpen && (
            <CoverPicker
              currentCover={page.cover}
              onSelect={(cover) => onUpdatePage({ cover })}
              onClose={() => setCoverPickerOpen(false)}
            />
          )}

          <div className="relative inline-block">
            <button
              type="button"
              disabled={page.locked}
              aria-label="Change page icon"
              onClick={() => setIconPickerOpen((v) => !v)}
              className="w-16 h-16 flex items-center justify-center rounded-xl text-5xl leading-none hover:bg-[var(--notion-hover)] transition-colors"
            >
              {page.icon || '📄'}
            </button>
            {iconPickerOpen && (
              <IconPicker
                currentIcon={page.icon}
                onSelect={(icon) => onUpdatePage({ icon })}
                onClose={() => setIconPickerOpen(false)}
              />
            )}
          </div>

          {!page.locked && (
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--notion-text-muted)] opacity-0 group-hover/header:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setIconPickerOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--notion-hover)]"
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Change icon</span>
              </button>
              {!coverData && (
                <button
                  type="button"
                  onClick={() => onUpdatePage({ cover: 'arch' })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--notion-hover)]"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Add cover</span>
                </button>
              )}
              {coverData && (
                <button
                  type="button"
                  onClick={() => setCoverPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--notion-hover)]"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Change cover</span>
                </button>
              )}
              {onOpenComments && (
                <button
                  type="button"
                  onClick={onOpenComments}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--notion-hover)]"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Add comment</span>
                </button>
              )}
            </div>
          )}

          {page.locked && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--notion-text-muted)]">
              <Lock className="w-3.5 h-3.5" />
              <span>Page locked</span>
            </div>
          )}

          {/* Editable Page Title */}
          <input
            type="text"
            value={page.title}
            readOnly={page.locked}
            onChange={(e) => onUpdatePage({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !page.isDatabase) {
                e.preventDefault();
                if (blocks.length > 0) {
                  focusBlockById(blocks[0].id, false);
                } else {
                  handleAddBelow(null);
                }
              }
            }}
            placeholder="Untitled"
            aria-label="Page title"
            className="mt-2 w-full bg-transparent text-[1.875rem] sm:text-[2.5rem] font-bold leading-[1.2] tracking-[-0.025em] text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
          />
        </div>

        {/* Full-Page Database View */}
        {page.isDatabase && pageDatabase ? (
          <DatabaseView
            database={pageDatabase}
            onUpdateDatabase={(patch) => onUpdateDatabase(pageDatabase.id, patch)}
            onAddRow={(cells) => onAddDatabaseRow(pageDatabase.id, cells)}
            onUpdateRow={(rowId, cells) => onUpdateDatabaseRow(pageDatabase.id, rowId, cells)}
            onDeleteRow={(rowId) => onDeleteDatabaseRow(pageDatabase.id, rowId)}
            onOpenRowPage={(row) => onOpenRowPage(pageDatabase.id, row)}
          />
        ) : (
          <>
            {/* Document Blocks */}
            <div className="mt-4">
              {blocks.map((block, index) => (
                <BlockItem
                  key={block.id}
                  block={block}
                  allBlocks={blocks}
                  index={index}
                  numberedIndex={getNumberedListIndex(blocks, index)}
                  isLocked={page.locked}
                  isOnlyBlock={blocks.length === 1}
                  isFocused={focusedBlockId === block.id}
                  allPages={allPages}
                  databases={databases}
                  registerInputRef={registerInputRef}
                  onFocusBlock={setFocusedBlockId}
                  onScrollToBlock={scrollToBlock}
                  onChangeBlock={handleChangeBlock}
                  onKeyDownBlock={handleKeyDownBlock}
                  onSlashTrigger={(blockId, query, rect) =>
                    setSlashState({
                      blockId,
                      query,
                      position: { top: rect.bottom + 6, left: rect.left, anchorTop: rect.top },
                    })
                  }
                  onSlashDismiss={() => setSlashState(null)}
                  onAddBelow={handleAddBelow}
                  onDuplicateBlock={(blockId) => {
                    const src = blocks.find((b) => b.id === blockId);
                    if (!src) return;
                    const copy: Block = { ...src, id: createId('blk') };
                    onUpdateBlocks(insertBlockAfter(blocks, blockId, copy));
                  }}
                  onDeleteBlock={(blockId) => {
                    if (blocks.length === 1) {
                      onUpdateBlocks([{ ...blocks[0], type: 'paragraph', content: '' }]);
                    } else {
                      onUpdateBlocks(deleteBlockAt(blocks, blockId));
                    }
                  }}
                  onMoveBlock={(blockId, offset) => {
                    onUpdateBlocks(moveBlockByOffset(blocks, blockId, offset));
                  }}
                  onDragStartBlock={setDraggedBlockId}
                  onDropOnBlock={(targetId, placement) => {
                    if (draggedBlockId && draggedBlockId !== targetId) {
                      onUpdateBlocks(reorderBlock(blocks, draggedBlockId, targetId, placement));
                    }
                    setDraggedBlockId(null);
                  }}
                  onSelectPage={onSelectPage}
                  onUpdateDatabase={onUpdateDatabase}
                  onAddDatabaseRow={onAddDatabaseRow}
                  onUpdateDatabaseRow={onUpdateDatabaseRow}
                  onDeleteDatabaseRow={onDeleteDatabaseRow}
                  onOpenRowPage={onOpenRowPage}
                />
              ))}
            </div>

            {/* Bottom Click-to-append Canvas Area */}
            {!page.locked && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddBelow(blocks[blocks.length - 1]?.id ?? null, false)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[var(--notion-text-faint)] hover:text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add a block</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBelow(blocks[blocks.length - 1]?.id ?? null, true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[var(--notion-text-faint)] hover:text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] transition-colors"
                >
                  <span>Insert with /</span>
                </button>
              </div>
            )}

            {/* Subpages Strip */}
            {(childPages.length > 0 || !page.locked) && (
              <div className="mt-10 pt-5 border-t border-[var(--notion-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--notion-text-muted)]">
                    Subpages
                  </span>
                  {!page.locked && (
                    <button
                      type="button"
                      onClick={() => onCreateSubpage(page.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add subpage</span>
                    </button>
                  )}
                </div>

                {childPages.length > 0 && (
                  <div className="space-y-0.5">
                    {childPages.map((cp) => (
                      <button
                        key={cp.id}
                        type="button"
                        onClick={() => onSelectPage(cp.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-[var(--notion-text)] hover:bg-[var(--notion-hover)] transition-colors text-left"
                      >
                        <span className="text-base leading-none">{cp.icon || '📄'}</span>
                        <span className="underline decoration-[var(--notion-border-strong)] underline-offset-4">
                          {cp.title || 'Untitled'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Slash Command Menu */}
      {slashState && (
        <SlashMenu
          query={slashState.query}
          position={slashState.position}
          onSelect={handleSelectSlashType}
          onClose={() => setSlashState(null)}
        />
      )}
    </div>
  );
};
