import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Block, Database, Page } from '../lib/types';
import { searchWorkspace } from '../lib/workspaceOps';

interface SearchModalProps {
  isOpen: boolean;
  pages: Page[];
  blocksByPage: Record<string, Block[]>;
  databases: Record<string, Database>;
  onSelectPage: (pageId: string) => void;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  pages,
  blocksByPage,
  databases,
  onSelectPage,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const hits = useMemo(
    () => searchWorkspace(pages, blocksByPage, databases, query),
    [pages, blocksByPage, databases, query],
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/35"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search workspace"
    >
      <div
        className="w-full max-w-xl rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--notion-border)]">
          <Search className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => (hits.length ? (i + 1) % hits.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) =>
                  hits.length ? (i - 1 + hits.length) % hits.length : 0,
                );
              } else if (e.key === 'Enter' && hits[selectedIndex]) {
                e.preventDefault();
                onSelectPage(hits[selectedIndex].pageId);
                onClose();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search pages, blocks, or database entries..."
            aria-label="Search workspace query"
            autoFocus
            className="flex-1 bg-transparent text-sm text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {hits.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--notion-text-muted)]">
              No results for "{query}"
            </div>
          ) : (
            hits.map((hit, idx) => (
              <button
                key={hit.pageId}
                type="button"
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  onSelectPage(hit.pageId);
                  onClose();
                }}
                className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  idx === selectedIndex ? 'bg-[var(--notion-hover)]' : ''
                }`}
              >
                <span className="text-lg leading-none mt-0.5 shrink-0">{hit.icon || '📄'}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--notion-text)] truncate">
                      {hit.title}
                    </span>
                    {hit.breadcrumb && (
                      <span className="text-xs text-[var(--notion-text-faint)] truncate">
                        · {hit.breadcrumb}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--notion-text-muted)] truncate mt-0.5">
                    {hit.snippet}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
