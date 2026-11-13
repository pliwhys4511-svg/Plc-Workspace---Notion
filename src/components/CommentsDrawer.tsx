import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, RotateCcw, Send, Trash2, X } from 'lucide-react';
import type { PageComment } from '../lib/types';

interface CommentsDrawerProps {
  isOpen: boolean;
  pageTitle: string;
  comments: PageComment[];
  onClose: () => void;
  onAddComment: (text: string) => void;
  onToggleResolve: (commentId: string, resolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  pageTitle,
  comments,
  onClose,
  onAddComment,
  onToggleResolve,
  onDeleteComment,
}) => {
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'open' | 'resolved'>('open');

  const openCount = useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);
  const resolvedCount = useMemo(() => comments.filter((c) => c.resolved).length, [comments]);

  const visibleComments = useMemo(
    () => comments.filter((c) => (tab === 'open' ? !c.resolved : c.resolved)),
    [comments, tab],
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment(trimmed);
    setDraft('');
    setTab('open');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Page comments"
    >
      <aside
        className="w-full max-w-sm h-full bg-[var(--notion-bg)] border-l border-[var(--notion-border-strong)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-4 border-b border-[var(--notion-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--notion-text)] truncate">
              Comments · {pageTitle || 'Untitled'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close comments"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-[var(--notion-border)] flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('open')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === 'open'
                ? 'bg-[var(--notion-active)] text-[var(--notion-text)]'
                : 'text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)]'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('resolved')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              tab === 'resolved'
                ? 'bg-[var(--notion-active)] text-[var(--notion-text)]'
                : 'text-[var(--notion-text-muted)] hover:bg-[var(--notion-hover)]'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visibleComments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--notion-text-muted)]">
              {tab === 'open' ? 'No open comments yet.' : 'No resolved comments.'}
            </div>
          ) : (
            visibleComments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-[var(--notion-border)] bg-[var(--notion-surface-muted)]/40 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[var(--notion-accent)]/15 text-[var(--notion-accent)] text-[10px] font-bold flex items-center justify-center shrink-0">
                      {comment.author.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs font-semibold text-[var(--notion-text)] truncate">
                      {comment.author}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleResolve(comment.id, !comment.resolved)}
                      aria-label={comment.resolved ? 'Reopen comment' : 'Resolve comment'}
                      title={comment.resolved ? 'Reopen' : 'Resolve'}
                      className="p-1 rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]"
                    >
                      {comment.resolved ? (
                        <RotateCcw className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteComment(comment.id)}
                      aria-label="Delete comment"
                      title="Delete comment"
                      className="p-1 rounded hover:bg-red-500/10 text-[var(--notion-text-muted)] hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-[var(--notion-text)] whitespace-pre-wrap">
                  {comment.text}
                </p>
                <div className="text-[10.5px] text-[var(--notion-text-faint)] tabular-nums">
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-3 border-t border-[var(--notion-border)] space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={2}
            placeholder="Add a comment..."
            aria-label="Write a comment"
            className="w-full px-3 py-2 rounded-md bg-[var(--notion-surface-muted)] border border-[var(--notion-border)] text-xs text-[var(--notion-text)] placeholder:text-[var(--notion-text-faint)] focus:outline-none focus:border-[var(--notion-accent)] resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--notion-accent)] text-white disabled:opacity-40 hover:bg-[var(--notion-accent-hover)] transition-colors"
            >
              <Send className="w-3 h-3" />
              <span>Comment</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};
