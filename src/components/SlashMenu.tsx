import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckSquare,
  ChevronRight,
  Code2,
  FileSymlink,
  Grid2x2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListTree,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  Table2,
} from 'lucide-react';
import type { BlockType } from '../lib/types';

export interface SlashCommandOption {
  type: BlockType;
  label: string;
  description: string;
  keywords: string[];
  icon: React.ReactNode;
  group: 'Basic blocks' | 'Media & Advanced' | 'Database & embeds';
}

export const SLASH_OPTIONS: SlashCommandOption[] = [
  {
    type: 'paragraph',
    label: 'Text',
    description: 'Just start writing with plain text.',
    keywords: ['text', 'paragraph', 'p'],
    icon: <Pilcrow className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'h1',
    label: 'Heading 1',
    description: 'Big section heading.',
    keywords: ['h1', 'heading 1', 'title'],
    icon: <Heading1 className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading.',
    keywords: ['h2', 'heading 2', 'subtitle'],
    icon: <Heading2 className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'h3',
    label: 'Heading 3',
    description: 'Small section heading.',
    keywords: ['h3', 'heading 3'],
    icon: <Heading3 className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'todo',
    label: 'To-do list',
    description: 'Track tasks with a to-do list.',
    keywords: ['todo', 'checkbox', 'task', 'check'],
    icon: <CheckSquare className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'bullet',
    label: 'Bulleted list',
    description: 'Create a simple bulleted list.',
    keywords: ['bullet', 'list', 'ul'],
    icon: <List className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'numbered',
    label: 'Numbered list',
    description: 'Create a list with numbering.',
    keywords: ['numbered', 'ol', 'ordered'],
    icon: <ListOrdered className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'toggle',
    label: 'Toggle list',
    description: 'Toggles can hide and show content inside.',
    keywords: ['toggle', 'collapse', 'accordion'],
    icon: <ChevronRight className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'callout',
    label: 'Callout',
    description: 'Make writing stand out.',
    keywords: ['callout', 'note', 'alert', 'box'],
    icon: <MessageSquareQuote className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Capture a quote.',
    keywords: ['quote', 'blockquote'],
    icon: <Quote className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Visually divide blocks.',
    keywords: ['divider', 'hr', 'line'],
    icon: <Minus className="w-4 h-4" />,
    group: 'Basic blocks',
  },
  {
    type: 'table',
    label: 'Table',
    description: 'Add a simple editable table grid.',
    keywords: ['table', 'grid', 'spreadsheet'],
    icon: <Grid2x2 className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Capture a code snippet.',
    keywords: ['code', 'snippet', 'pre'],
    icon: <Code2 className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Upload or embed with a link (works offline).',
    keywords: ['image', 'photo', 'picture', 'img'],
    icon: <ImageIcon className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'bookmark',
    label: 'Web Bookmark',
    description: 'Save a link as a visual card.',
    keywords: ['bookmark', 'link', 'web', 'url'],
    icon: <Bookmark className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'toc',
    label: 'Table of contents',
    description: 'Show an outline of page headings.',
    keywords: ['toc', 'contents', 'outline', 'headings'],
    icon: <ListTree className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'equation',
    label: 'Block equation',
    description: 'Display a standalone mathematical formula.',
    keywords: ['equation', 'math', 'formula', 'tex'],
    icon: <Sigma className="w-4 h-4" />,
    group: 'Media & Advanced',
  },
  {
    type: 'database',
    label: 'Inline Database',
    description: 'Table, Board, List, Calendar, or Gallery.',
    keywords: ['database', 'board', 'kanban', 'calendar', 'gallery'],
    icon: <Table2 className="w-4 h-4" />,
    group: 'Database & embeds',
  },
  {
    type: 'page_link',
    label: 'Link to page',
    description: 'Insert a clickable link to another page.',
    keywords: ['link', 'page', 'subpage'],
    icon: <FileSymlink className="w-4 h-4" />,
    group: 'Database & embeds',
  },
];

interface SlashMenuProps {
  query: string;
  position: { top: number; left: number; anchorTop?: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

export const SlashMenu: React.FC<SlashMenuProps> = ({
  query,
  position,
  onSelect,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SLASH_OPTIONS;
    return SLASH_OPTIONS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q)),
    );
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0,
        );
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        onSelect(filtered[activeIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [activeIndex, filtered, onSelect, onClose]);

  const menuHeight = 340;
  const opensUpward =
    position.top + menuHeight > window.innerHeight && position.anchorTop !== undefined;
  const safeLeft = Math.min(Math.max(12, position.left), window.innerWidth - 320);
  const posStyle: React.CSSProperties = opensUpward
    ? {
        bottom: `${Math.max(12, window.innerHeight - (position.anchorTop ?? position.top) + 6)}px`,
        left: `${safeLeft}px`,
      }
    : {
        top: `${Math.max(12, position.top)}px`,
        left: `${safeLeft}px`,
      };

  return (
    <div
      className="fixed z-50 w-76 max-h-[340px] overflow-y-auto rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-1.5"
      style={posStyle}
      role="listbox"
      aria-label="Insert block"
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-[var(--notion-text-muted)]">
        {query ? `Matches for "/${query}"` : 'Blocks'}
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-[var(--notion-text-muted)]">
          No matching block types
        </div>
      ) : (
        filtered.map((item, idx) => {
          const isSelected = idx === activeIndex;
          return (
            <button
              key={item.type}
              type="button"
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item.type);
              }}
              className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors ${
                isSelected ? 'bg-[var(--notion-hover)]' : ''
              }`}
            >
              <span className="w-9 h-9 rounded-md border border-[var(--notion-border)] bg-[var(--notion-bg)] flex items-center justify-center text-[var(--notion-text)] shrink-0">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--notion-text)]">
                  {item.label}
                </span>
                <span className="block text-[11.5px] text-[var(--notion-text-muted)] truncate">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
};
