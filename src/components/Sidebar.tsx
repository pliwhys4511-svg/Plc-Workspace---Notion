import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Cloud,
  CloudOff,
  Copy,
  Database as DatabaseIcon,
  FilePlus2,
  FileText,
  Home,
  LayoutTemplate,
  Moon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Page, PageTreeNode, ThemeMode, WorkspaceSettings } from '../lib/types';
import { buildPageTree } from '../lib/workspaceOps';
import { PWAInstallButton } from './PWAComponents';

interface SidebarProps {
  isOpen: boolean;
  isMobile: boolean;
  settings: WorkspaceSettings;
  pages: Page[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  onCreatePage: (opts?: { parentId?: string | null; isDatabase?: boolean }) => void;
  onToggleFavorite: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onTrashPage: (pageId: string) => void;
  onRestorePage: (pageId: string) => void;
  onDeleteForever: (pageId: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
  onToggleTheme: (theme: ThemeMode) => void;
  onCloseSidebar: () => void;
  cloudUser?: User | null;
  cloudSyncStatus?: 'local' | 'connecting' | 'synced' | 'error';
  onSignInCloud?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isMobile,
  settings,
  pages,
  activePageId,
  onSelectPage,
  onCreatePage,
  onToggleFavorite,
  onDuplicatePage,
  onTrashPage,
  onRestorePage,
  onDeleteForever,
  onOpenSearch,
  onOpenSettings,
  onOpenTemplates,
  onToggleTheme,
  onCloseSidebar,
  cloudUser,
  cloudSyncStatus = 'local',
  onSignInCloud,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    page_home: true,
  });
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashQuery, setTrashQuery] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('plc.notion.sidebar.width'));
      if (saved >= 220 && saved <= 360) return saved;
    } catch {
      // ignore storage failure
    }
    return 248;
  });
  const resizingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(360, Math.max(220, e.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        document.body.style.cursor = '';
        try {
          localStorage.setItem('plc.notion.sidebar.width', String(sidebarWidth));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarWidth]);

  const renderPageGlyph = (p: Page) => {
    if (!p.icon || p.icon === '📄') {
      return p.isDatabase ? (
        <DatabaseIcon className="w-3.5 h-3.5 text-[var(--notion-text-muted)] shrink-0" />
      ) : (
        <FileText className="w-3.5 h-3.5 text-[var(--notion-text-muted)] shrink-0" />
      );
    }
    return (
      <span className="shrink-0 text-sm leading-none" aria-hidden="true">
        {p.icon}
      </span>
    );
  };

  const tree = useMemo(() => buildPageTree(pages, null), [pages]);

  const favorites = useMemo(
    () =>
      pages
        .filter((p) => !p.isTrashed && !p.isRowPage && p.isFavorite)
        .sort((a, b) => a.position - b.position),
    [pages],
  );

  const trashedPages = useMemo(() => {
    const q = trashQuery.trim().toLowerCase();
    return pages
      .filter((p) => p.isTrashed && !p.isRowPage)
      .filter((p) => !q || (p.title || 'Untitled').toLowerCase().includes(q));
  }, [pages, trashQuery]);

  const homePageId = useMemo(() => {
    const first = pages.find((p) => !p.isTrashed && !p.isRowPage);
    return first?.id ?? '';
  }, [pages]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderTreeNode = (node: PageTreeNode, depth: number) => {
    const { page, children } = node;
    const isActive = page.id === activePageId;
    const isExpanded = Boolean(expanded[page.id]);
    const hasChildren = children.length > 0;
    const indentPx = 8 + depth * 14;

    return (
      <div key={page.id} className="select-none">
        <div
          className={`group relative flex items-center gap-1 pr-1.5 py-1 rounded-md text-[13.5px] transition-colors ${
            isActive
              ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-medium'
              : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)]'
          }`}
          style={{ paddingLeft: `${indentPx}px` }}
        >
          <button
            type="button"
            aria-label={isExpanded ? `Collapse ${page.title}` : `Expand ${page.title}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(page.id);
            }}
            className={`w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] shrink-0 ${
              hasChildren ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
            }`}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectPage(page.id);
              setMenuPageId(null);
            }}
            className="flex-1 min-w-0 flex items-center gap-1.5 py-0.5 text-left"
          >
            {renderPageGlyph(page)}
            <span className="truncate">{page.title || 'Untitled'}</span>
          </button>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 shrink-0">
            <button
              type="button"
              aria-label={`Page options for ${page.title || 'Untitled'}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuPageId((prev) => (prev === page.id ? null : page.id));
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--notion-active)] text-[var(--notion-text-muted)]"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Add subpage inside ${page.title || 'Untitled'}`}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => ({ ...prev, [page.id]: true }));
                onCreatePage({ parentId: page.id });
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--notion-active)] text-[var(--notion-text-muted)]"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {menuPageId === page.id && (
            <div
              className="absolute right-1 top-8 z-40 w-48 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] p-1 shadow-[var(--notion-shadow)]"
              role="menu"
            >
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(page.id);
                  setMenuPageId(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
              >
                <Star className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                <span>{page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicatePage(page.id);
                  setMenuPageId(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTrashPage(page.id);
                  setMenuPageId(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-red-500/10 text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </div>
          )}
        </div>

        {isExpanded && (
          <div>
            {hasChildren ? (
              children.map((child) => renderTreeNode(child, depth + 1))
            ) : (
              <div
                className="py-1 text-xs text-[var(--notion-text-faint)] select-none"
                style={{ paddingLeft: `${indentPx + 24}px` }}
              >
                No pages inside
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar"
        aria-label="Sidebar"
        style={!isMobile ? { width: `${sidebarWidth}px` } : undefined}
        className={`${
          isMobile ? 'fixed inset-y-0 left-0 z-40 w-[264px] shadow-2xl' : 'relative shrink-0'
        } h-full flex flex-col bg-[var(--notion-sidebar)] border-r border-[var(--notion-border)] select-none`}
      >
        {/* Workspace Header */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 min-w-0 px-1.5 py-1 rounded-md hover:bg-[var(--notion-hover)] transition-colors text-left"
          >
            <span className="w-5 h-5 rounded bg-[var(--notion-active)] flex items-center justify-center text-xs shrink-0">
              {settings.icon || '📐'}
            </span>
            <span className="text-[13.5px] font-semibold text-[var(--notion-text)] truncate">
              {settings.name || 'PLC Workspace'}
            </span>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={onCloseSidebar}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
              title="Close sidebar (Ctrl+\)"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Create new page"
              onClick={() => onCreatePage({ parentId: null })}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
              title="New page"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-2 pb-2 space-y-0.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13.5px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[var(--notion-text-muted)]" />
              <span>Search</span>
            </span>
            <kbd className="text-[11px] font-mono text-[var(--notion-text-faint)]">Ctrl+K</kbd>
          </button>

          {homePageId && (
            <button
              type="button"
              onClick={() => onSelectPage(homePageId)}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13.5px] transition-colors ${
                activePageId === homePageId
                  ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-medium'
                  : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)]'
              }`}
            >
              <Home className="w-4 h-4 text-[var(--notion-text-muted)]" />
              <span>Home</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenTemplates}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13.5px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
          >
            <LayoutTemplate className="w-4 h-4 text-[var(--notion-text-muted)]" />
            <span>Templates</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13.5px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
          >
            <Settings className="w-4 h-4 text-[var(--notion-text-muted)]" />
            <span>Settings & Hosting</span>
          </button>

          {cloudUser ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
              title={`Firestore Cloud: ${cloudUser.displayName || cloudUser.email || cloudUser.uid}`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="truncate">
                  {cloudSyncStatus === 'connecting' ? 'Syncing Cloud...' : 'Cloud DB Active'}
                </span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            </button>
          ) : (
            onSignInCloud && (
              <button
                type="button"
                onClick={onSignInCloud}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
                title="Sign in with Google to sync workspace with Firebase Firestore"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <CloudOff className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
                  <span className="truncate">Connect Cloud DB</span>
                </span>
              </button>
            )
          )}

          <PWAInstallButton />
        </div>

        {/* Scrollable Trees */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
          {favorites.length > 0 && (
            <div>
              <div className="px-2 pb-1 text-[11.5px] font-semibold text-[var(--notion-text-muted)]">
                Favorites
              </div>
              <div className="space-y-0.5">
                {favorites.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPage(p.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[13.5px] transition-colors text-left ${
                      activePageId === p.id
                        ? 'bg-[var(--notion-active)] text-[var(--notion-text)] font-medium'
                        : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)]'
                    }`}
                  >
                    {renderPageGlyph(p)}
                    <span className="truncate">{p.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11.5px] font-semibold text-[var(--notion-text-muted)]">
                Workspace
              </span>
              <button
                type="button"
                aria-label="Add root page"
                onClick={() => onCreatePage({ parentId: null })}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
                title="Add page"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-0.5">{tree.map((node) => renderTreeNode(node, 0))}</div>

            <div className="mt-2 pt-2 border-t border-[var(--notion-border)] space-y-0.5">
              <button
                type="button"
                onClick={() => onCreatePage({ parentId: null, isDatabase: false })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>New page</span>
              </button>
              <button
                type="button"
                onClick={() => onCreatePage({ parentId: null, isDatabase: true })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
              >
                <DatabaseIcon className="w-3.5 h-3.5" />
                <span>New database</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="relative px-2 py-2 border-t border-[var(--notion-border)] flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setTrashOpen((v) => !v)}
            className="flex-1 flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[var(--notion-text-muted)]" />
              <span>Trash</span>
            </span>
            {trashedPages.length > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--notion-text-muted)]">
                {trashedPages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label={settings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => onToggleTheme(settings.theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors shrink-0"
            title={settings.theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {trashOpen && (
            <div
              className="fixed md:absolute left-2 bottom-12 z-50 w-72 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-2"
              role="dialog"
              aria-label="Trash"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-xs font-semibold text-[var(--notion-text)]">Trash</span>
                <button
                  type="button"
                  onClick={() => setTrashOpen(false)}
                  className="text-xs text-[var(--notion-text-muted)] hover:text-[var(--notion-text)] px-1.5 py-0.5 rounded"
                >
                  Close
                </button>
              </div>
              <input
                type="text"
                value={trashQuery}
                onChange={(e) => setTrashQuery(e.target.value)}
                placeholder="Search pages in Trash..."
                aria-label="Search pages in Trash"
                className="w-full mb-2 px-2.5 py-1.5 text-xs rounded-md bg-[var(--notion-surface-muted)] border border-[var(--notion-border)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
              />
              <div className="max-h-56 overflow-y-auto space-y-1">
                {trashedPages.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--notion-text-muted)]">
                    No pages in Trash
                  </div>
                ) : (
                  trashedPages.map((tp) => (
                    <div
                      key={tp.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--notion-hover)]"
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="text-xs shrink-0">{tp.icon || '📄'}</span>
                        <span className="text-xs text-[var(--notion-text)] truncate">
                          {tp.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Restore ${tp.title || 'Untitled'}`}
                          onClick={() => onRestorePage(tp.id)}
                          className="p-1 rounded hover:bg-[var(--notion-active)] text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]"
                          title="Restore page"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${tp.title || 'Untitled'} permanently`}
                          onClick={() => onDeleteForever(tp.id)}
                          className="p-1 rounded hover:bg-red-500/15 text-red-600 dark:text-red-400"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {!isMobile && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={() => {
              resizingRef.current = true;
              document.body.style.cursor = 'col-resize';
            }}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--notion-accent)]/50 transition-colors"
          />
        )}
      </aside>
    </>
  );
};
