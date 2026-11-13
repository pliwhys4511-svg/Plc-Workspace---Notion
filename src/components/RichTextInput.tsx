import React, { useEffect, useRef, useState } from 'react';
import { Bold, Code, Italic, Link2, Strikethrough, Underline } from 'lucide-react';
import { sanitizeInlineHtml, stripHtmlToText } from '../lib/workspaceOps';

interface RichTextInputProps {
  blockId: string;
  html: string;
  placeholder: string;
  hideWhenUnfocused?: boolean;
  readOnly?: boolean;
  className?: string;
  ariaLabel: string;
  registerRef: (blockId: string, el: HTMLElement | null) => void;
  onFocus: () => void;
  onChangeHtml: (nextHtml: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSlashCheck: (plainTextBeforeCaret: string, rect: DOMRect) => void;
  onSlashDismiss: () => void;
}

function getPlainTextBeforeCaret(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return root.innerText || '';
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return root.innerText || '';
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString();
}

export const RichTextInput: React.FC<RichTextInputProps> = ({
  blockId,
  html,
  placeholder,
  hideWhenUnfocused = false,
  readOnly = false,
  className = '',
  ariaLabel,
  registerRef,
  onFocus,
  onChangeHtml,
  onKeyDown,
  onSlashCheck,
  onSlashDismiss,
}) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string>(html);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (html !== lastEmittedRef.current || el.innerHTML !== html) {
      if (document.activeElement !== el || html !== lastEmittedRef.current) {
        const sanitized = sanitizeInlineHtml(html);
        if (el.innerHTML !== sanitized) {
          el.innerHTML = sanitized;
          lastEmittedRef.current = sanitized;
        }
      }
    }
  }, [html, blockId]);

  const emitChange = () => {
    const el = elRef.current;
    if (!el) return;
    // Normalize empty <br> left by browsers in contentEditable
    const raw = el.innerHTML === '<br>' ? '' : el.innerHTML;
    const clean = sanitizeInlineHtml(raw);
    if (raw === '' && el.innerHTML !== '') {
      el.innerHTML = '';
    }
    lastEmittedRef.current = clean;
    onChangeHtml(clean);
  };

  const checkSelectionToolbar = () => {
    if (readOnly) {
      setToolbarPos(null);
      return;
    }
    const sel = window.getSelection();
    const el = elRef.current;
    if (!sel || !el || sel.isCollapsed || !sel.rangeCount) {
      if (!linkMode) setToolbarPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) {
      setToolbarPos(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) {
      setToolbarPos({
        top: Math.max(12, rect.top - 44),
        left: Math.min(Math.max(12, rect.left), window.innerWidth - 280),
      });
    }
  };

  const applyInlineCommand = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    document.execCommand(cmd, false);
    emitChange();
  };

  const applyInlineCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    const parentEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;

    if (parentEl?.tagName === 'CODE') {
      const textNode = document.createTextNode(parentEl.textContent || '');
      parentEl.replaceWith(textNode);
    } else {
      const code = document.createElement('code');
      code.textContent = selectedText;
      range.deleteContents();
      range.insertNode(code);
    }
    emitChange();
  };

  const applyTextColor = (color: string | null) => {
    if (color) {
      document.execCommand('foreColor', false, color);
    } else {
      document.execCommand('removeFormat', false);
    }
    emitChange();
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = linkUrl.trim();
    if (url) {
      const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      document.execCommand('createLink', false, safe);
      emitChange();
    }
    setLinkMode(false);
    setLinkUrl('');
    setToolbarPos(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!readOnly && (e.metaKey || e.ctrlKey)) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        applyInlineCommand('bold');
        return;
      }
      if (k === 'i') {
        e.preventDefault();
        applyInlineCommand('italic');
        return;
      }
      if (k === 'u') {
        e.preventDefault();
        applyInlineCommand('underline');
        return;
      }
      if (k === 'e') {
        e.preventDefault();
        applyInlineCode();
        return;
      }
      if (e.shiftKey && k === 's') {
        e.preventDefault();
        applyInlineCommand('strikeThrough');
        return;
      }
    }
    onKeyDown(e);
  };

  return (
    <>
      <div
        ref={(node) => {
          elRef.current = node;
          registerRef(blockId, node);
        }}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-hide-unfocused={hideWhenUnfocused ? 'true' : 'false'}
        onFocus={() => {
          onFocus();
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!linkMode) setToolbarPos(null);
          }, 160);
        }}
        onInput={() => {
          emitChange();
          const el = elRef.current;
          if (el) {
            const before = getPlainTextBeforeCaret(el);
            const rect = el.getBoundingClientRect();
            onSlashCheck(before, rect);
          }
        }}
        onMouseUp={checkSelectionToolbar}
        onKeyUp={() => {
          checkSelectionToolbar();
          const el = elRef.current;
          if (el && stripHtmlToText(el.innerHTML) === '') {
            onSlashDismiss();
          }
        }}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          e.preventDefault();
          const plain = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, plain);
          emitChange();
        }}
        className={`notion-rich ${className}`}
      />

      {toolbarPos && (
        <div
          className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)]"
          style={{ top: `${toolbarPos.top}px`, left: `${toolbarPos.left}px` }}
          onMouseDown={(e) => e.preventDefault()}
          role="toolbar"
          aria-label="Text formatting"
        >
          {linkMode ? (
            <form onSubmit={handleLinkSubmit} className="flex items-center gap-1 px-1">
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste link URL..."
                aria-label="Link URL"
                autoFocus
                className="w-40 px-2 py-0.5 text-xs rounded bg-[var(--notion-surface-muted)] text-[var(--notion-text)] focus:outline-none"
              />
              <button
                type="submit"
                className="px-2 py-0.5 text-xs font-medium rounded bg-[var(--notion-accent)] text-white"
              >
                Add
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                aria-label="Bold"
                onClick={() => applyInlineCommand('bold')}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Italic"
                onClick={() => applyInlineCommand('italic')}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Underline"
                onClick={() => applyInlineCommand('underline')}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Strikethrough"
                onClick={() => applyInlineCommand('strikeThrough')}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Inline code"
                onClick={applyInlineCode}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Inline code (Ctrl+E)"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Add link"
                onClick={() => setLinkMode(true)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                title="Link"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-[var(--notion-border)] mx-0.5" />
              {[
                { label: 'Default', color: null, swatch: 'var(--notion-text)' },
                { label: 'Blue', color: '#2383e2', swatch: '#2383e2' },
                { label: 'Red', color: '#e03e3e', swatch: '#e03e3e' },
                { label: 'Green', color: '#0f7b6c', swatch: '#0f7b6c' },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  aria-label={`Color ${c.label}`}
                  onClick={() => applyTextColor(c.color)}
                  className="w-6 h-7 flex items-center justify-center rounded hover:bg-[var(--notion-hover)] text-xs font-bold"
                  style={{ color: c.swatch }}
                  title={`Text color: ${c.label}`}
                >
                  A
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
};
