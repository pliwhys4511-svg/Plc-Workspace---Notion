export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'toggle'
  | 'callout'
  | 'quote'
  | 'code'
  | 'divider'
  | 'table'
  | 'image'
  | 'bookmark'
  | 'toc'
  | 'equation'
  | 'database'
  | 'page_link';

export type BlockColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  open?: boolean;
  details?: string;
  icon?: string;
  language?: string;
  color?: BlockColor;
  indent?: number;
  rows?: string[][];
  hasHeaderRow?: boolean;
  url?: string;
  caption?: string;
  databaseId?: string;
  targetPageId?: string;
  position: number;
}

export type PageFont = 'sans' | 'serif' | 'mono';

export interface Page {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  cover: string | null;
  coverPosition: number;
  font: PageFont;
  smallText: boolean;
  fullWidth: boolean;
  isFavorite: boolean;
  isTrashed: boolean;
  isDatabase: boolean;
  databaseId?: string | null;
  isRowPage?: boolean;
  locked: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageComment {
  id: string;
  pageId: string;
  author: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

export type DatabaseColumnType =
  | 'title'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'checkbox'
  | 'number'
  | 'person'
  | 'url';

export type TagColor =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

export interface SelectOption {
  id: string;
  label: string;
  color: TagColor;
}

export interface DatabaseColumn {
  id: string;
  name: string;
  type: DatabaseColumnType;
  width?: number;
  options?: SelectOption[];
}

export type DatabaseCellValue = string | number | boolean | string[] | null;

export interface DatabaseRow {
  id: string;
  databaseId: string;
  pageId: string;
  cells: Record<string, DatabaseCellValue>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type DatabaseViewType =
  | 'table'
  | 'status'
  | 'calendar'
  | 'category'
  | 'board'
  | 'list'
  | 'gallery';

export interface Database {
  id: string;
  title: string;
  icon: string;
  activeView: DatabaseViewType;
  groupByColumnId: string;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
}

export type ThemeMode = 'light' | 'dark';

export interface WorkspaceSettings {
  name: string;
  icon: string;
  theme: ThemeMode;
  passwordProtected: boolean;
}

export interface WorkspaceData {
  settings: WorkspaceSettings;
  pages: Page[];
  blocksByPage: Record<string, Block[]>;
  databases: Record<string, Database>;
  commentsByPage?: Record<string, PageComment[]>;
}

export interface PageTreeNode {
  page: Page;
  children: PageTreeNode[];
}

export interface SearchHit {
  pageId: string;
  title: string;
  icon: string;
  snippet: string;
  matchType: 'title' | 'block' | 'database';
  breadcrumb: string;
}
