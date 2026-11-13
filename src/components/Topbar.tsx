import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronsRight,
  Copy,
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  Undo2,
  Unlock,
  Upload,
} from 'lucide-react';
import type { Page, PageFont } from '../lib/types';
import { TopbarOfflineBadge } from './PWAComponents';

interface TopbarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  breadcrumbs: Page[];
  activePage: Page;
  saveState: 'idle' | 'saving' | 'saved';
  commentCount: number;
  wordCount: number;
  canUndo: boolean;
  onUndo: () => void;
  onOpenComments: () => void;
  onSelectPage: (pageId: string) => void;
  onUpdatePage: (patch: Partial<Page>) => void;
  onDuplicatePage: () => void;
  onTrashPage: () => void;
  onCopyMarkdown: () => void;
  onDownloadMarkdown: () => void;
  onDownloadWorkspaceJson: () => void;
  onOpenUploadTemplate?: () => void;
  onExportProjectTemplate?: () => void;
  onExportProjectCsv?: () => void;
  onSaveAsTemplate?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  sidebarOpen,
  onOpenSidebar,
  breadcrumbs,
  activePage,
  saveState,
  commentCount,
  wordCount,
  canUndo,
  onUndo,
  onOpenComments,
  onSelectPage,
  onUpdatePage,
  onDuplicatePage,
  onTrashPage,
  onCopyMarkdown,
  onDownloadMarkdown,
  onDownloadWorkspaceJson,
  onOpenUploadTemplate,
  onExportProjectTemplate,
  onExportProjectCsv,
  onSaveAsTemplate,
}) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fontOptions: Array<{ id: PageFont; label: string; sampleClass: string }> = [
    { id: 'sans', label: 'Default', sampleClass: 'font-notion-sans' },
    { id: 'serif', label: 'Serif', sampleClass: 'font-notion-serif' },
    { id: 'mono', label: 'Mono', sampleClass: 'font-notion-mono' },
  ];

  return (
    <header
      id="topbar"
      aria-label="Page top bar"
      className="h-11 shrink-0 px-3 flex items-center justify-between gap-4 bg-[var(--notion-bg)] border-b border-[var(--notion-border)] select-none"
    >
      {/* Left: Sidebar Toggle & Breadcrumbs */}
      <div className="flex items-center gap-1.5 min-w-0">
        {!sidebarOpen && (
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={onOpenSidebar}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] shrink-0"
            title="Open sidebar (Ctrl+\)"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 overflow-hidden">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id}>
                {index > 0 && (
                  <span className="text-xs text-[var(--notion-text-faint)] shrink-0" aria-hidden="true">
                    /
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onSelectPage(crumb.id)}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[13px] min-w-0 max-w-[180px] transition-colors ${
                    isLast
                      ? 'text-[var(--notion-text)] font-medium'
                      : 'text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]'
                  }`}
                >
                  {!crumb.icon || crumb.icon === '📄' ? (
                    <FileText className="w-3.5 h-3.5 text-[var(--notion-text-muted)] shrink-0" />
                  ) : (
                    <span className="text-sm leading-none shrink-0" aria-hidden="true">
                      {crumb.icon}
                    </span>
                  )}
                  <span className="truncate">{crumb.title || 'Untitled'}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right: Sync state, Share/Export, Comments, Favorite, Page Options */}
      <div className="relative flex items-center gap-1 shrink-0">
        <TopbarOfflineBadge />

        {saveState !== 'idle' && (
          <span className="hidden sm:inline text-xs text-[var(--notion-text-faint)] px-2 whitespace-nowrap">
            {saveState === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            setShareOpen((v) => !v);
            setStyleOpen(false);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[13px] text-[var(--notion-text)] hover:bg-[var(--notion-hover)] transition-colors whitespace-nowrap shrink-0"
        >
          <Share2 className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          type="button"
          aria-label="Open comments"
          onClick={() => {
            setShareOpen(false);
            setStyleOpen(false);
            onOpenComments();
          }}
          className="relative inline-flex items-center gap-1 px-2 h-7 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] hover:text-[var(--notion-text)] transition-colors shrink-0"
          title="Comments"
        >
          <MessageSquare className="w-4 h-4" />
          {commentCount > 0 && (
            <span className="text-[11px] font-medium tabular-nums text-[var(--notion-text)]">
              {commentCount}
            </span>
          )}
        </button>

        <button
          type="button"
          aria-label={activePage.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onUpdatePage({ isFavorite: !activePage.isFavorite })}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] transition-colors shrink-0"
          title="Favorite"
        >
          <Star
            className={`w-4 h-4 ${
              activePage.isFavorite
                ? 'fill-amber-400 text-amber-400'
                : 'text-[var(--notion-text-muted)]'
            }`}
          />
        </button>

        <button
          type="button"
          aria-label="Page style and actions"
          onClick={() => {
            setStyleOpen((v) => !v);
            setShareOpen(false);
          }}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] transition-colors shrink-0"
          title="Page style & actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {shareOpen && (
          <div
            className="absolute right-0 top-10 z-50 w-68 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-2 space-y-1"
            role="dialog"
            aria-label="Export page"
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-[var(--notion-text-muted)]">
              Notion Template &amp; Project
            </div>
            {onOpenUploadTemplate && (
              <button
                type="button"
                onClick={() => {
                  setShareOpen(false);
                  onOpenUploadTemplate();
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--notion-accent)]" />
                <span>Upload / Import Template...</span>
              </button>
            )}
            {onExportProjectTemplate && (
              <button
                type="button"
                onClick={() => {
                  onExportProjectTemplate();
                  setShareOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <FileJson className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                <span>Export Project Template (.json)</span>
              </button>
            )}
            {activePage.isDatabase && onExportProjectCsv && (
              <button
                type="button"
                onClick={() => {
                  onExportProjectCsv();
                  setShareOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Database CSV (.csv)</span>
              </button>
            )}
            {onSaveAsTemplate && (
              <button
                type="button"
                onClick={() => {
                  onSaveAsTemplate();
                  setShareOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-amber-500" />
                <span>Save as Reusable Template</span>
              </button>
            )}

            <div className="my-1 border-t border-[var(--notion-border)]" />
            <div className="px-2 py-1 text-[11px] font-semibold text-[var(--notion-text-muted)]">
              Markdown &amp; Workspace
            </div>
            <button
              type="button"
              onClick={() => {
                onCopyMarkdown();
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />}
              <span>{copied ? 'Copied Markdown' : 'Copy page as Markdown'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onDownloadMarkdown();
                setShareOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
            >
              <FileDown className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
              <span>Download page (.md)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onDownloadWorkspaceJson();
                setShareOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
            >
              <Download className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
              <span>Full workspace backup (.json)</span>
            </button>
          </div>
        )}

        {styleOpen && (
          <div
            className="absolute right-0 top-10 z-50 w-64 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-2.5 space-y-3"
            role="dialog"
            aria-label="Page settings"
          >
            <div>
              <div className="text-[11px] font-semibold text-[var(--notion-text-muted)] mb-1.5 px-1">
                Font
              </div>
              <div className="grid grid-cols-3 gap-1">
                {fontOptions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onUpdatePage({ font: f.id })}
                    className={`flex flex-col items-center py-2 px-1 rounded-md border text-xs transition-colors ${
                      activePage.font === f.id
                        ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/10 text-[var(--notion-text)]'
                        : 'border-[var(--notion-border)] hover:bg-[var(--notion-hover)] text-[var(--notion-text-secondary)]'
                    }`}
                  >
                    <span className={`text-base font-semibold ${f.sampleClass}`}>Ag</span>
                    <span className="mt-0.5 text-[11px]">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-[var(--notion-border)]">
              <button
                type="button"
                onClick={() => onUpdatePage({ smallText: !activePage.smallText })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <span>Small text</span>
                <span
                  className={`w-7 h-4 rounded-full relative transition-colors ${
                    activePage.smallText ? 'bg-[var(--notion-accent)]' : 'bg-[var(--notion-border-strong)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      activePage.smallText ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onUpdatePage({ fullWidth: !activePage.fullWidth })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <span>Full width</span>
                <span
                  className={`w-7 h-4 rounded-full relative transition-colors ${
                    activePage.fullWidth ? 'bg-[var(--notion-accent)]' : 'bg-[var(--notion-border-strong)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      activePage.fullWidth ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onUpdatePage({ locked: !activePage.locked })}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <span className="flex items-center gap-2">
                  {activePage.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{activePage.locked ? 'Unlock page' : 'Lock page'}</span>
                </span>
              </button>
            </div>

            <div className="space-y-1 pt-2 border-t border-[var(--notion-border)]">
              {canUndo && (
                <button
                  type="button"
                  onClick={() => {
                    onUndo();
                    setStyleOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                >
                  <Undo2 className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                  <span>Undo last block edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onDuplicatePage();
                  setStyleOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--notion-text-muted)]" />
                <span>Duplicate page</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTrashPage();
                  setStyleOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </div>

            <div className="pt-2 border-t border-[var(--notion-border)] px-2 text-[11px] text-[var(--notion-text-faint)] space-y-0.5 tabular-nums">
              <div>Word count: {wordCount}</div>
              <div>Last edited: {new Date(activePage.updatedAt).toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
