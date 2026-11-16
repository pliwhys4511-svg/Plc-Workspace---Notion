/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Block,
  Database,
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseViewType,
  Page,
  PageComment,
  ThemeMode,
  WorkspaceData,
  WorkspaceSettings,
} from './lib/types';
import { api } from './lib/api';
import {
  createId,
  getBreadcrumbs,
  getDescendantIds,
  renderPageToMarkdown,
  stripHtmlToText,
} from './lib/workspaceOps';
import {
  flushOutbox,
  isStaticHostMode,
  loadCachedWorkspace,
  loadOutbox,
  saveCachedWorkspace,
  saveCachedCloudWorkspace,
  useOnlineStatus,
} from './lib/offlineSync';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type { NotionTemplate } from './lib/templates';
import {
  deleteCustomTemplate,
  loadCustomTemplates,
  packageToNotionTemplate,
  saveCustomTemplate,
} from './lib/customTemplates';
import {
  createProjectFromTemplateImport,
  exportDatabaseToCsv,
  exportDatabaseToMarkdown,
  exportPageToTemplatePackage,
  mergeImportIntoDatabase,
  safeFileSlug,
  triggerFileDownload,
  type ParsedTemplateImport,
  type ProjectTemplatePackage,
} from './lib/templateTransfer';
import { auth } from './lib/firebase';
import { CLOUD_PAUSED_KEY, shouldAutoResumeCloud } from './lib/cloudReconnect';
import {
  cloudAddComment,
  cloudAddDatabaseRow,
  cloudCreatePage,
  cloudCreateProjectBundle,
  cloudDeleteComment,
  cloudDeleteDatabaseRow,
  cloudDeletePageTree,
  cloudImportDatabaseChanges,
  cloudEnsureImportTargets,
  cloudReplaceWorkspace,
  cloudSavePageBlocks,
  cloudUpdateComment,
  cloudUpdateDatabase,
  cloudUpdateDatabaseRow,
  cloudUpdatePage,
  cloudUpdateSettings,
  seedOrEnsureCloudWorkspace,
  signInWithGoogle,
  signOutGoogle,
  subscribeCloudWorkspace,
} from './lib/firestoreStore';
import { Sidebar } from './components/Sidebar';
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';
import { buildWorkspaceProject, type WorkspaceProjectSelection } from './lib/workspaceCreate';
import { Topbar } from './components/Topbar';
import { PageCanvas } from './components/PageCanvas';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { RowPeekModal } from './components/RowPeekModal';
import { LockScreen } from './components/LockScreen';
import { TemplatesModal } from './components/TemplatesModal';
import { UploadTemplateModal, type TemplateImportMode } from './components/UploadTemplateModal';
import { CommentsDrawer } from './components/CommentsDrawer';
import { OfflineIndicator } from './components/PWAComponents';
import { planPlcCommRestore } from './lib/plcCommRestore';
import { AccessGate } from './components/AccessGate';
import {
  clearWorkspaceAccess,
  loadWorkspaceAccess,
  saveWorkspaceAccess,
  type WorkspaceAccess,
} from './lib/accessTier';

function buildDefaultDatabase(id: string, title: string, icon: string): Database {
  return {
    id,
    title,
    icon,
    activeView: 'table',
    groupByColumnId: 'col_status',
    columns: [
      { id: 'col_title', name: 'Name', type: 'title', width: 220 },
      {
        id: 'col_status',
        name: 'Status',
        type: 'select',
        width: 140,
        options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
          { id: 'doing', label: 'In Progress', color: 'blue' },
          { id: 'done', label: 'Done', color: 'green' },
        ],
      },
      {
        id: 'col_category',
        name: 'Category',
        type: 'select',
        width: 140,
        options: [
          { id: 'general', label: 'General', color: 'gray' },
          { id: 'work', label: 'Work', color: 'blue' },
          { id: 'personal', label: 'Personal', color: 'green' },
          { id: 'ideas', label: 'Ideas', color: 'purple' },
        ],
      },
      { id: 'col_due', name: 'Due Date', type: 'date', width: 130 },
    ],
    rows: [],
  };
}

export default function App() {
  const [access, setAccess] = useState<WorkspaceAccess | null>(loadWorkspaceAccess);

  const handleSuccess = (next: WorkspaceAccess) => {
    saveWorkspaceAccess(next);
    setAccess(next);
  };
  const handleLogout = () => {
    clearWorkspaceAccess();
    setAccess(null);
  };

  if (!access) return <AccessGate onSuccess={handleSuccess} />;
  return <WorkspaceApp key={access.role + ':' + access.displayName} access={access} onLogout={handleLogout} />;
}

interface WorkspaceAppProps {
  access: WorkspaceAccess;
  onLogout: () => void;
}

function WorkspaceApp({ access, onLogout }: WorkspaceAppProps) {
  const canManage = access.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedMeta, setLockedMeta] = useState<WorkspaceSettings | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [activePageId, setActivePageId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [createContext, setCreateContext] = useState<{ parentId: string | null; preferDatabase: boolean }>({
    parentId: null, preferDatabase: true,
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTargetDbId, setUploadTargetDbId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<NotionTemplate[]>(() =>
    loadCustomTemplates(),
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ dbId: string; rowId: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(() => loadOutbox().length);
  const [undoStack, setUndoStack] = useState<Record<string, Block[][]>>({});
  // GitHub Pages defaults to browser-local storage. A saved Google Auth session
  // must not silently enable Firestore writes; users opt in explicitly.
  const [cloudModeRequested, setCloudModeRequested] = useState(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'local' | 'connecting' | 'synced' | 'error'>('local');

  const isOnline = useOnlineStatus();
  const blockTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pageTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOnlineRef = useRef<boolean>(isOnline);
  const workspaceRef = useRef<WorkspaceData | null>(null);
  const workspaceCacheOwnerRef = useRef<string | null>(null);
  const activePageIdRef = useRef<string>('');
  // Never send writes to a cloud account that has not finished permission checks.
  const activeCloudUid = cloudModeRequested && cloudUser?.emailVerified && cloudSyncStatus === 'synced'
    ? cloudUser.uid : null;

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(loadOutbox().length);
  }, []);

  const applyTheme = useCallback((theme: ThemeMode) => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('plc.notion.theme', theme);
    } catch {
      // ignore storage failure
    }
  }, []);

  const selectInitialPage = useCallback((ws: WorkspaceData) => {
    const hashId = window.location.hash.replace(/^#/, '');
    const validPages = ws.pages.filter((p) => !p.isTrashed && !p.isRowPage);
    const fromHash = validPages.find((p) => p.id === hashId);
    const nextId = fromHash?.id ?? validPages[0]?.id ?? '';
    setActivePageId(nextId);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWorkspace();
      if (res.locked && res.settings) {
        setLockedMeta(res.settings);
        setWorkspace(null);
        applyTheme(res.settings.theme);
      } else if (res.workspace) {
        setLockedMeta(null);
        setWorkspace(res.workspace);
        saveCachedWorkspace(res.workspace);
        applyTheme(res.workspace.settings.theme);
        selectInitialPage(res.workspace);
      }
    } catch (err) {
      const cached = loadCachedWorkspace();
      if (cached) {
        setLockedMeta(null);
        setWorkspace(cached);
        applyTheme(cached.settings.theme);
        selectInitialPage(cached);
        showToast('Offline cache loaded');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to connect to workspace server.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyTheme, selectInitialPage, showToast]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Firebase Auth persists verified Google sessions across browser visits.
  // Restore the existing owner's Cloud DB automatically, without a popup.
  // Editor PINs are not Firebase credentials or permission to read owner data.
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      let paused = false;
      try { paused = localStorage.getItem(CLOUD_PAUSED_KEY) === '1'; } catch { /* private mode */ }
      if (shouldAutoResumeCloud(access.role, Boolean(user?.emailVerified), paused)) {
        setCloudModeRequested(true);
      }
    });
  }, [access.role]);

  // Listen for Firebase Auth only after the user explicitly selects Cloud mode.
  useEffect(() => {
    if (!cloudModeRequested) {
      workspaceCacheOwnerRef.current = null;
      setCloudUser(null);
      setCloudSyncStatus('local');
      return;
    }
    let unsubCloud: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubCloud) {
        unsubCloud();
        unsubCloud = null;
      }

      if (user && user.emailVerified) {
        workspaceCacheOwnerRef.current = null;
        setCloudUser(user);
        setCloudSyncStatus('connecting');
        try {
          // Never initialize a new cloud account from another user's local/cache data.
          await seedOrEnsureCloudWorkspace(user, null);
          if (cancelled) return;
          unsubCloud = subscribeCloudWorkspace(
            user.uid,
            (cloudWs) => {
              if (cancelled) return;
              setLockedMeta(null);
              setWorkspace(cloudWs);
              workspaceCacheOwnerRef.current = user.uid;
              saveCachedCloudWorkspace(user.uid, cloudWs);
              applyTheme(cloudWs.settings.theme);
              setCloudSyncStatus('synced');
              setLoading(false);

              const currentId = activePageIdRef.current;
              const stillExists = cloudWs.pages.some(
                (p) => p.id === currentId && !p.isTrashed && !p.isRowPage,
              );
              if (!currentId || !stillExists) {
                selectInitialPage(cloudWs);
              }
            },
            () => {
              if (!cancelled) {
                setCloudSyncStatus('error');
                showToast('Sinkronisasi Firebase ditolak. Gunakan Mode Lokal atau periksa izin Firestore.');
              }
            },
          );
        } catch {
          if (!cancelled) {
            setCloudSyncStatus('error');
            showToast('Akses Firebase ditolak. Gunakan Mode Lokal atau periksa izin Firestore.');
          }
        }
      } else {
        workspaceCacheOwnerRef.current = null;
        setCloudUser(null);
        setCloudSyncStatus('local');
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      if (unsubCloud) unsubCloud();
    };
  }, [cloudModeRequested, applyTheme, selectInitialPage, showToast]);

  // Persist workspace snapshot locally whenever it changes for instant offline booting
  useEffect(() => {
    if (workspace) {
      const owner = workspaceCacheOwnerRef.current;
      if (owner) saveCachedCloudWorkspace(owner, workspace);
      else saveCachedWorkspace(workspace);
    }
  }, [workspace]);

  // Flush queued offline mutations automatically when connection returns
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && (wasOffline || loadOutbox().length > 0)) {
      flushOutbox().then(async (synced) => {
        refreshPendingCount();
        if (synced > 0) {
          showToast(`Synced ${synced} offline changes`);
          try {
            const res = await api.getWorkspace();
            if (!res.locked && res.workspace) {
              setWorkspace(res.workspace);
            }
          } catch {
            // keep local cache if refresh fails
          }
        }
      });
    }
  }, [isOnline, refreshPendingCount, showToast]);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => {
        if (mobile && !prev) setSidebarOpen(false);
        if (!mobile && prev) setSidebarOpen(true);
        return mobile;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Global keyboard shortcuts (Ctrl/Cmd+K Search, Ctrl/Cmd+\ Sidebar)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectPage = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      window.location.hash = pageId;
      if (isMobile) setSidebarOpen(false);
    },
    [isMobile],
  );

  const activePage = useMemo(() => {
    if (!workspace) return undefined;
    const found = workspace.pages.find((p) => p.id === activePageId && !p.isTrashed);
    return found ?? workspace.pages.find((p) => !p.isTrashed && !p.isRowPage);
  }, [workspace, activePageId]);

  const breadcrumbs = useMemo(() => {
    if (!workspace || !activePage) return [];
    return getBreadcrumbs(workspace.pages, activePage.id);
  }, [workspace, activePage]);

  const activeBlocks = useMemo(() => {
    if (!workspace || !activePage) return [];
    return workspace.blocksByPage[activePage.id] ?? [];
  }, [workspace, activePage]);

  const activeComments = useMemo(() => {
    if (!workspace || !activePage) return [];
    return workspace.commentsByPage?.[activePage.id] ?? [];
  }, [workspace, activePage]);

  const wordCount = useMemo(() => {
    if (!activePage) return 0;
    const parts = [activePage.title];
    for (const b of activeBlocks) {
      parts.push(stripHtmlToText(b.content));
      if (b.details) parts.push(stripHtmlToText(b.details));
      if (b.rows) parts.push(b.rows.flat().join(' '));
    }
    const text = parts.join(' ').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [activePage, activeBlocks]);

  const markSaved = useCallback(() => {
    setSaveState('saved');
    setTimeout(() => {
      setSaveState((curr) => (curr === 'saved' ? 'idle' : curr));
    }, 1500);
  }, []);

  const openWorkspaceCreator = (opts?: { parentId?: string | null; isDatabase?: boolean }) => {
    setCreateContext({
      parentId: opts?.parentId ?? null,
      preferDatabase: opts?.isDatabase ?? (opts?.parentId == null),
    });
    setCreatorOpen(true);
  };

  const handleCreateWorkspaceFromTemplate = async (
    template: NotionTemplate | null,
    selection: WorkspaceProjectSelection,
  ) => {
    if (!workspace) throw new Error('Workspace belum siap.');
    if (cloudModeRequested && !activeCloudUid) {
      throw new Error('Cloud DB belum tersambung. Gunakan Mode Lokal atau sambungkan Firebase terlebih dahulu.');
    }
    const bundle = buildWorkspaceProject(template, selection, workspace.pages.length);
    const nextWs: WorkspaceData = {
      ...workspace,
      pages: [...workspace.pages, bundle.page, ...bundle.rowPages],
      blocksByPage: {
        ...workspace.blocksByPage,
        [bundle.page.id]: bundle.blocks,
        ...bundle.rowBlocksByPage,
      },
      databases: bundle.database
        ? { ...workspace.databases, [bundle.database.id]: bundle.database }
        : workspace.databases,
    };

    // Commit before showing success, so new projects do not disappear on reload.
    if (activeCloudUid) {
      await cloudCreateProjectBundle(activeCloudUid, bundle);
      saveCachedCloudWorkspace(activeCloudUid, nextWs);
    } else {
      await api.importWorkspace(nextWs);
      saveCachedWorkspace(nextWs);
    }
    setWorkspace(nextWs);
    handleSelectPage(bundle.page.id);
    showToast(`Project "${bundle.page.title}" dibuat. Template dapat diedit kapan saja.`);
  };

  const handleCreatePage = async (opts?: {
    parentId?: string | null;
    isDatabase?: boolean;
    title?: string;
    icon?: string;
    cover?: string | null;
    blocks?: Array<Partial<Block>>;
  }) => {
    if (!workspace) return;
    try {
      if (activeCloudUid) {
        const now = new Date().toISOString();
        const pageId = createId('page');
        const dbId = opts?.isDatabase ? createId('db') : null;
        const cloudPage: Page = {
          id: pageId,
          parentId: opts?.parentId ?? null,
          title: opts?.title ?? (opts?.isDatabase ? 'Untitled Database' : 'Untitled'),
          icon: opts?.icon ?? (opts?.isDatabase ? '🗂️' : '📄'),
          cover: opts?.cover ?? null,
          coverPosition: 50,
          font: 'sans',
          smallText: false,
          fullWidth: false,
          isFavorite: false,
          isTrashed: false,
          isDatabase: Boolean(opts?.isDatabase),
          databaseId: dbId,
          isRowPage: false,
          locked: false,
          position: workspace.pages.length,
          createdAt: now,
          updatedAt: now,
        };
        const cloudBlocks: Block[] =
          opts?.blocks && opts.blocks.length > 0
            ? opts.blocks.map((b, idx) => ({
                id: createId('blk'),
                pageId,
                type: b.type ?? 'paragraph',
                content: b.content ?? '',
                checked: b.checked,
                open: b.open,
                details: b.details,
                icon: b.icon,
                language: b.language,
                color: b.color,
                rows: b.rows,
                hasHeaderRow: b.hasHeaderRow,
                position: idx,
              }))
            : opts?.isDatabase
            ? []
            : [
                {
                  id: createId('blk'),
                  pageId,
                  type: 'paragraph',
                  content: '',
                  position: 0,
                },
              ];
        const cloudDb = dbId
          ? buildDefaultDatabase(dbId, cloudPage.title, cloudPage.icon)
          : undefined;
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                pages: [...prev.pages, cloudPage],
                blocksByPage: { ...prev.blocksByPage, [pageId]: cloudBlocks },
                databases: cloudDb ? { ...prev.databases, [cloudDb.id]: cloudDb } : prev.databases,
              }
            : prev,
        );
        handleSelectPage(pageId);
        await cloudCreatePage(activeCloudUid, cloudPage, cloudBlocks, cloudDb);
        return;
      }

      const res = await api.createPage({
        parentId: opts?.parentId ?? null,
        isDatabase: opts?.isDatabase ?? false,
        title: opts?.title,
        icon: opts?.icon,
        cover: opts?.cover,
        blocks: opts?.blocks,
      });
      refreshPendingCount();

      if (res.synced && res.data) {
        const data = res.data;
        setWorkspace((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: [...prev.pages, data.page],
            blocksByPage: {
              ...prev.blocksByPage,
              [data.page.id]: data.blocks,
            },
            databases: data.database
              ? { ...prev.databases, [data.database.id]: data.database }
              : prev.databases,
          };
        });
        handleSelectPage(data.page.id);
      } else {
        // Optimistic offline creation
        const now = new Date().toISOString();
        const pageId = createId('page');
        const dbId = opts?.isDatabase ? createId('db') : null;
        const offlinePage: Page = {
          id: pageId,
          parentId: opts?.parentId ?? null,
          title: opts?.title ?? (opts?.isDatabase ? 'Untitled Database' : 'Untitled'),
          icon: opts?.icon ?? (opts?.isDatabase ? '🗂️' : '📄'),
          cover: opts?.cover ?? null,
          coverPosition: 50,
          font: 'sans',
          smallText: false,
          fullWidth: false,
          isFavorite: false,
          isTrashed: false,
          isDatabase: Boolean(opts?.isDatabase),
          databaseId: dbId,
          isRowPage: false,
          locked: false,
          position: workspace.pages.length,
          createdAt: now,
          updatedAt: now,
        };
        const offlineBlocks: Block[] =
          opts?.blocks && opts.blocks.length > 0
            ? opts.blocks.map((b, idx) => ({
                id: createId('blk'),
                pageId,
                type: b.type ?? 'paragraph',
                content: b.content ?? '',
                checked: b.checked,
                open: b.open,
                details: b.details,
                icon: b.icon,
                language: b.language,
                color: b.color,
                rows: b.rows,
                hasHeaderRow: b.hasHeaderRow,
                position: idx,
              }))
            : opts?.isDatabase
            ? []
            : [
                {
                  id: createId('blk'),
                  pageId,
                  type: 'paragraph',
                  content: '',
                  position: 0,
                },
              ];
        const offlineDb: Database | undefined = dbId
          ? buildDefaultDatabase(dbId, offlinePage.title, offlinePage.icon)
          : undefined;
        setWorkspace((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: [...prev.pages, offlinePage],
            blocksByPage: { ...prev.blocksByPage, [pageId]: offlineBlocks },
            databases: offlineDb ? { ...prev.databases, [offlineDb.id]: offlineDb } : prev.databases,
          };
        });
        handleSelectPage(pageId);
      }
    } catch {
      showToast('Failed to create page');
    }
  };

  const handleUseTemplate = async (template: NotionTemplate) => {
    if (!workspace) return;
    if (template.isDatabase && template.database) {
      const parsed: ParsedTemplateImport = {
        sourceFormat: 'template-json',
        name: template.name,
        icon: template.icon,
        cover: template.cover,
        category: template.category,
        description: template.description,
        isDatabase: true,
        fullWidth: true,
        activeView: template.database.activeView,
        groupByColumnId: template.database.groupByColumnId,
        columns: template.database.columns,
        rows: template.database.rows,
        blocks: template.blocks,
        summary: template.description,
      };
      const bundle = createProjectFromTemplateImport(parsed, workspace.pages.length, null);
      const nextWs: WorkspaceData = {
        ...workspace,
        pages: [...workspace.pages, bundle.page, ...bundle.rowPages],
        blocksByPage: {
          ...workspace.blocksByPage,
          [bundle.page.id]: bundle.blocks,
          ...bundle.rowBlocksByPage,
        },
        databases: bundle.database
          ? { ...workspace.databases, [bundle.database.id]: bundle.database }
          : workspace.databases,
      };
      setWorkspace(nextWs);
      saveCachedWorkspace(nextWs);
      handleSelectPage(bundle.page.id);
      try {
        if (activeCloudUid) {
          await cloudCreateProjectBundle(activeCloudUid, bundle);
        } else {
          await api.importWorkspace(nextWs);
        }
        showToast(`Created project "${template.name}"`);
      } catch {
        showToast('Created locally (sync pending)');
      }
      return;
    }

    await handleCreatePage({
      parentId: null,
      title: template.name,
      icon: template.icon,
      cover: template.cover,
      isDatabase: Boolean(template.isDatabase),
      blocks: template.blocks,
    });
    showToast(`Created from "${template.name}"`);
  };

  const handleRestorePlcComm = async () => {
    if (!workspace) return;
    if (cloudModeRequested && cloudSyncStatus !== 'synced') {
      showToast('Firebase tidak mengizinkan perubahan. Klik Mode Lokal dahulu.');
      return;
    }
    const planned = planPlcCommRestore(workspace);
    if (planned.action === 'open') {
      handleSelectPage(planned.page.id);
      return;
    }
    try {
      if (activeCloudUid) {
        if (planned.action === 'restore') {
          await cloudUpdatePage(activeCloudUid, planned.page.id, { isTrashed: false });
        } else if (planned.action === 'repair') {
          const targetDb = planned.workspace.databases[planned.page.databaseId ?? ''];
          if (!targetDb) throw new Error('Database PLC Comm tidak ditemukan.');
          // Create only missing cloud documents; retain any existing page/data.
          await cloudEnsureImportTargets(activeCloudUid, targetDb, planned.page);
          const oldPage = workspace.pages.find((page) => page.id === planned.page.id);
          if (oldPage?.databaseId !== planned.page.databaseId) {
            await cloudUpdatePage(activeCloudUid, planned.page.id, { databaseId: planned.page.databaseId });
          }
          if (oldPage?.isTrashed) {
            await cloudUpdatePage(activeCloudUid, planned.page.id, { isTrashed: false });
          }
        } else {
          await cloudCreatePage(activeCloudUid, planned.page, [], planned.newDatabase);
        }
      } else {
        await api.importWorkspace(planned.workspace);
      }
      setWorkspace(planned.workspace);
      if (activeCloudUid) saveCachedCloudWorkspace(activeCloudUid, planned.workspace);
      else saveCachedWorkspace(planned.workspace);
      handleSelectPage(planned.page.id);
      showToast(
        planned.action === 'restore'
          ? 'Halaman PLC Comm dipulihkan.'
          : planned.action === 'repair'
            ? 'Database PLC Comm berhasil diperbaiki tanpa menghapus konten.'
            : 'Halaman PLC Comm siap untuk upload CSV.',
      );
    } catch {
      if (activeCloudUid) {
        setCloudSyncStatus('error');
        showToast('Firebase menolak perubahan. Gunakan Mode Lokal atau periksa izin akun.');
      } else {
        showToast('Gagal mengaktifkan PLC Comm di penyimpanan lokal.');
      }
    }
  };

  const handleOpenUploadTemplate = (targetDbId?: string) => {
    if (cloudModeRequested && cloudSyncStatus !== 'synced') {
      showToast('Koneksi Firebase belum siap. Pilih Mode Lokal terlebih dahulu.');
      return;
    }
    const resolvedDbId =
      targetDbId ?? (activePage?.isDatabase ? activePage.databaseId ?? null : null);
    setUploadTargetDbId(resolvedDbId);
    setUploadModalOpen(true);
  };

  const handleExportProjectTemplate = () => {
    if (!workspace || !activePage) return;
    const pkg = exportPageToTemplatePackage(
      activePage,
      workspace.blocksByPage[activePage.id] ?? [],
      workspace.databases,
      workspace.blocksByPage,
    );
    triggerFileDownload(
      `${safeFileSlug(activePage.title)}.template.json`,
      JSON.stringify(pkg, null, 2),
      'application/json;charset=utf-8',
    );
    showToast('Project template exported (.json)');
  };

  const handleExportProjectCsv = (dbId?: string) => {
    if (!workspace || !activePage) return;
    const resolvedId = dbId ?? (activePage.isDatabase ? activePage.databaseId : undefined);
    const db = resolvedId ? workspace.databases[resolvedId] : undefined;
    if (!db) {
      showToast('No database found on this page');
      return;
    }
    const csv = exportDatabaseToCsv(db);
    triggerFileDownload(
      `${safeFileSlug(db.title || activePage.title)}.csv`,
      csv,
      'text/csv;charset=utf-8',
      true,
    );
    showToast('Exported Notion CSV (.csv)');
  };

  const handleExportProjectMarkdown = (dbId: string) => {
    if (!workspace || !activePage) return;
    const db = workspace.databases[dbId];
    if (!db) return;
    const md = exportDatabaseToMarkdown(activePage, db);
    triggerFileDownload(
      `${safeFileSlug(db.title || activePage.title)}.md`,
      md,
      'text/markdown;charset=utf-8',
    );
    showToast('Exported Markdown table (.md)');
  };

  const handleSavePageAsTemplate = () => {
    if (!workspace || !activePage) return;
    const pkg = exportPageToTemplatePackage(
      activePage,
      workspace.blocksByPage[activePage.id] ?? [],
      workspace.databases,
      workspace.blocksByPage,
    );
    const tpl = packageToNotionTemplate(pkg);
    const updated = saveCustomTemplate(tpl);
    setCustomTemplates(updated);
    showToast(`Saved "${tpl.name}" to Templates`);
  };

  const handleExportGalleryTemplate = (tpl: NotionTemplate) => {
    const pkg: ProjectTemplatePackage = {
      format: 'plc-notion-template-v1',
      id: tpl.id,
      exportedAt: new Date().toISOString(),
      name: tpl.name,
      icon: tpl.icon,
      cover: tpl.cover,
      category: tpl.category,
      description: tpl.description,
      isDatabase: Boolean(tpl.isDatabase),
      ...(tpl.database ? { database: tpl.database } : {}),
      blocks: tpl.blocks,
    };
    triggerFileDownload(
      `${safeFileSlug(tpl.name)}.template.json`,
      JSON.stringify(pkg, null, 2),
      'application/json;charset=utf-8',
    );
    showToast(`Exported "${tpl.name}" (.json)`);
  };

  const handleDeleteCustomTemplate = (templateId: string) => {
    setCustomTemplates(deleteCustomTemplate(templateId));
    showToast('Custom template removed');
  };

  const handleConfirmTemplateImport = async (
    parsed: ParsedTemplateImport,
    mode: TemplateImportMode,
    saveToGallery: boolean,
  ) => {
    if (!workspace) return;
    if (cloudModeRequested && cloudSyncStatus !== 'synced') {
      throw new Error('Izin Firebase belum siap. Pilih Gunakan Mode Lokal, lalu unggah ulang.');
    }

    if (saveToGallery) {
      const savedTpl = packageToNotionTemplate(parsed);
      setCustomTemplates(saveCustomTemplate(savedTpl));
    }

    const targetDbId =
      uploadTargetDbId ?? (activePage?.isDatabase ? activePage.databaseId ?? null : null);
    const targetDb = targetDbId ? workspace.databases[targetDbId] : undefined;

    if (mode !== 'new_page' && targetDb && activePage) {
      const mergeMode = mode === 'replace' ? 'replace' : 'append';
      const merged = mergeImportIntoDatabase(targetDb, parsed, mergeMode, activePage.id);
      const removedRowPageSet = new Set(merged.removedRowPageIds);
      const nextBlocksByPage = { ...workspace.blocksByPage };
      for (const rpId of merged.removedRowPageIds) {
        delete nextBlocksByPage[rpId];
      }
      Object.assign(nextBlocksByPage, merged.addedBlocksByPage);

      const nextWs: WorkspaceData = {
        ...workspace,
        pages: [
          ...workspace.pages.filter((p) => !removedRowPageSet.has(p.id)),
          ...merged.addedRowPages,
        ],
        blocksByPage: nextBlocksByPage,
        databases: {
          ...workspace.databases,
          [targetDb.id]: merged.nextDatabase,
        },
      };

      // Persist before presenting success; a failed import must not replace local state.
      if (activeCloudUid) {
        try {
          await cloudImportDatabaseChanges(activeCloudUid, {
          database: merged.nextDatabase,
          targetPage: activePage,
          addedRows: merged.addedRows,
          updatedRows: merged.updatedRows,
          addedRowPages: merged.addedRowPages,
          addedBlocksByPage: merged.addedBlocksByPage,
          removedRowIds: merged.removedRowIds,
          removedRowPageIds: merged.removedRowPageIds,
          });
        } catch (err) {
          setCloudSyncStatus('error');
          throw err;
        }
      } else {
        await api.importWorkspace(nextWs);
      }

      setWorkspace(nextWs);
      if (activeCloudUid) saveCachedCloudWorkspace(activeCloudUid, nextWs);
      else saveCachedWorkspace(nextWs);

      const updated = merged.updatedRows?.length ?? 0;
      showToast(
        targetDb.id === 'db_plc_comm' && mergeMode === 'append'
          ? `PLC Comm: ${merged.addedRows.length} baru, ${updated} diperbarui, tanpa duplikat`
          : mergeMode === 'replace'
          ? `Replaced "${targetDb.title}" (${merged.addedRows.length} rows)`
          : `Added ${merged.addedRows.length} rows to "${targetDb.title}"`,
      );
      return;
    }

    if (mode === 'replace' && activePage && !activePage.isDatabase) {
      const nextBlocks: Block[] =
        parsed.blocks.length > 0
          ? parsed.blocks.map((b, idx) => ({
              id: createId('blk'),
              pageId: activePage.id,
              type: b.type,
              content: b.content,
              checked: b.checked,
              open: b.open,
              details: b.details,
              icon: b.icon,
              language: b.language,
              color: b.color,
              indent: b.indent,
              rows: b.rows,
              hasHeaderRow: b.hasHeaderRow,
              url: b.url,
              caption: b.caption,
              position: idx,
            }))
          : parsed.columns.length > 0
          ? [
              {
                id: createId('blk'),
                pageId: activePage.id,
                type: 'table',
                content: '',
                hasHeaderRow: true,
                rows: [
                  parsed.columns.map((c) => c.name),
                  ...parsed.rows.map((r) =>
                    parsed.columns.map((c) => String(r.cells[c.id] ?? '')),
                  ),
                ],
                position: 0,
              },
            ]
          : [];

      if (nextBlocks.length > 0) {
        handleUpdateBlocks(activePage.id, nextBlocks);
        showToast(`Replaced "${activePage.title}" from template`);
        return;
      }
    }

    // Default / new_page: create full new project page (+ database & rows if applicable)
    const bundle = createProjectFromTemplateImport(parsed, workspace.pages.length, null);
    const nextWs: WorkspaceData = {
      ...workspace,
      pages: [...workspace.pages, bundle.page, ...bundle.rowPages],
      blocksByPage: {
        ...workspace.blocksByPage,
        [bundle.page.id]: bundle.blocks,
        ...bundle.rowBlocksByPage,
      },
      databases: bundle.database
        ? { ...workspace.databases, [bundle.database.id]: bundle.database }
        : workspace.databases,
    };

    setWorkspace(nextWs);
    saveCachedWorkspace(nextWs);
    handleSelectPage(bundle.page.id);

    if (activeCloudUid) {
      await cloudCreateProjectBundle(activeCloudUid, bundle);
    } else {
      await api.importWorkspace(nextWs);
    }

    showToast(`Imported "${bundle.page.title}"`);
  };

  const handleUpdatePage = useCallback(
    (pageId: string, patch: Partial<Page>) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const nextPages = prev.pages.map((p) =>
          p.id === pageId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        );
        const target = nextPages.find((p) => p.id === pageId);
        let nextDbs = prev.databases;
        if (target?.databaseId && patch.title !== undefined && prev.databases[target.databaseId]) {
          nextDbs = {
            ...prev.databases,
            [target.databaseId]: {
              ...prev.databases[target.databaseId],
              title: patch.title,
            },
          };
        }
        return { ...prev, pages: nextPages, databases: nextDbs };
      });

      setSaveState('saving');
      if (pageTimers.current[pageId]) clearTimeout(pageTimers.current[pageId]);
      pageTimers.current[pageId] = setTimeout(async () => {
        try {
          if (activeCloudUid) {
            await cloudUpdatePage(activeCloudUid, pageId, patch);
          } else {
            await api.updatePage(pageId, patch);
            refreshPendingCount();
          }
          markSaved();
        } catch {
          setSaveState('error');
          showToast('Failed to save page changes');
        }
      }, 220);
    },
    [activeCloudUid, markSaved, refreshPendingCount, showToast],
  );

  const handleUpdateBlocks = useCallback(
    (pageId: string, blocks: Block[], skipUndo = false) => {
      const createdDbs: Database[] = [];
      const preparedBlocks = blocks.map((b) => {
        if (
          activeCloudUid &&
          b.type === 'database' &&
          (!b.databaseId || !workspaceRef.current?.databases[b.databaseId])
        ) {
          const newDbId = b.databaseId || createId('db');
          const created = buildDefaultDatabase(newDbId, b.content || 'Inline Database', '🗂️');
          createdDbs.push(created);
          return { ...b, databaseId: newDbId };
        }
        return b;
      });

      setWorkspace((prev) => {
        if (!prev) return prev;
        const previous = prev.blocksByPage[pageId] ?? [];
        if (!skipUndo) {
          setUndoStack((stack) => {
            const existing = stack[pageId] ?? [];
            const nextList = [...existing.slice(-24), previous];
            return { ...stack, [pageId]: nextList };
          });
        }
        const nextDbs = { ...prev.databases };
        for (const cdb of createdDbs) {
          nextDbs[cdb.id] = cdb;
        }
        return {
          ...prev,
          blocksByPage: {
            ...prev.blocksByPage,
            [pageId]: preparedBlocks,
          },
          databases: nextDbs,
        };
      });

      setSaveState('saving');
      if (blockTimers.current[pageId]) clearTimeout(blockTimers.current[pageId]);
      blockTimers.current[pageId] = setTimeout(async () => {
        try {
          if (activeCloudUid) {
            await cloudSavePageBlocks(activeCloudUid, pageId, preparedBlocks, createdDbs);
          } else {
            const res = await api.savePageBlocks(pageId, preparedBlocks);
            refreshPendingCount();
            if (res.synced && res.data) {
              const data = res.data;
              setWorkspace((prev) => {
                if (!prev) return prev;
                const nextDbs = { ...prev.databases };
                for (const db of data.createdDatabases) {
                  nextDbs[db.id] = db;
                }
                return {
                  ...prev,
                  blocksByPage: {
                    ...prev.blocksByPage,
                    [pageId]: data.blocks,
                  },
                  databases: nextDbs,
                };
              });
            }
          }
          markSaved();
        } catch {
          setSaveState('error');
          showToast('Failed to save blocks');
        }
      }, 260);
    },
    [activeCloudUid, markSaved, refreshPendingCount, showToast],
  );

  const handleUndoBlocks = useCallback(() => {
    if (!activePage) return;
    const stack = undoStack[activePage.id] ?? [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    setUndoStack((s) => ({
      ...s,
      [activePage.id]: stack.slice(0, -1),
    }));
    handleUpdateBlocks(activePage.id, previous, true);
    showToast('Undid last edit');
  }, [activePage, handleUpdateBlocks, showToast, undoStack]);

  const handleDuplicatePage = async (pageId: string) => {
    if (!workspace) return;
    try {
      if (activeCloudUid) {
        const src = workspace.pages.find((p) => p.id === pageId);
        if (!src) return;
        const copyId = createId('page');
        const copyPage: Page = {
          ...src,
          id: copyId,
          title: `${src.title || 'Untitled'} (Copy)`,
          isFavorite: false,
          isDatabase: false,
          databaseId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const copyBlocks = (workspace.blocksByPage[pageId] ?? []).map((b) => ({
          ...b,
          id: createId('blk'),
          pageId: copyId,
        }));
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                pages: [...prev.pages, copyPage],
                blocksByPage: { ...prev.blocksByPage, [copyId]: copyBlocks },
              }
            : prev,
        );
        handleSelectPage(copyId);
        await cloudCreatePage(activeCloudUid, copyPage, copyBlocks);
        showToast('Page duplicated');
        return;
      }

      const res = await api.duplicatePage(pageId);
      refreshPendingCount();
      if (res.synced && res.data) {
        const data = res.data;
        setWorkspace((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: [...prev.pages, data.page],
            blocksByPage: {
              ...prev.blocksByPage,
              [data.page.id]: data.blocks,
            },
          };
        });
        handleSelectPage(data.page.id);
      } else {
        const src = workspace.pages.find((p) => p.id === pageId);
        if (!src) return;
        const copyId = createId('page');
        const copyPage: Page = {
          ...src,
          id: copyId,
          title: `${src.title || 'Untitled'} (Copy)`,
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const copyBlocks = (workspace.blocksByPage[pageId] ?? []).map((b) => ({
          ...b,
          id: createId('blk'),
          pageId: copyId,
        }));
        setWorkspace((prev) =>
          prev
            ? {
                ...prev,
                pages: [...prev.pages, copyPage],
                blocksByPage: { ...prev.blocksByPage, [copyId]: copyBlocks },
              }
            : prev,
        );
        handleSelectPage(copyId);
      }
      showToast('Page duplicated');
    } catch {
      showToast('Failed to duplicate page');
    }
  };

  const handleTrashPage = async (pageId: string) => {
    if (!workspace) return;
    handleUpdatePage(pageId, { isTrashed: true, isFavorite: false });
    showToast('Moved to Trash');
    if (activePage?.id === pageId) {
      const next = workspace.pages.find(
        (p) => p.id !== pageId && !p.isTrashed && !p.isRowPage,
      );
      if (next) handleSelectPage(next.id);
    }
  };

  const handleRestorePage = async (pageId: string) => {
    handleUpdatePage(pageId, { isTrashed: false });
    handleSelectPage(pageId);
    showToast('Page restored');
  };

  const handleDeleteForever = async (pageId: string) => {
    if (!canManage) { showToast('Only Admin can permanently delete pages'); return; }
    if (!workspace) return;
    try {
      const localDeletedIds = [pageId, ...getDescendantIds(workspace.pages, pageId)];
      let deletedSet = new Set(localDeletedIds);

      if (activeCloudUid) {
        await cloudDeletePageTree(activeCloudUid, localDeletedIds);
      } else {
        const res = await api.deletePagePermanently(pageId);
        refreshPendingCount();
        if (res.synced && res.data) {
          deletedSet = new Set(res.data.deletedIds);
        }
      }

      setWorkspace((prev) => {
        if (!prev) return prev;
        const nextBlocks = { ...prev.blocksByPage };
        for (const id of deletedSet) delete nextBlocks[id];
        return {
          ...prev,
          pages: prev.pages.filter((p) => !deletedSet.has(p.id)),
          blocksByPage: nextBlocks,
        };
      });
      showToast('Deleted permanently');
    } catch {
      showToast('Failed to delete page');
    }
  };

  const handleUpdateDatabase = async (
    dbId: string,
    patch: Partial<{
      title: string;
      icon: string;
      activeView: DatabaseViewType;
      groupByColumnId: string;
      columns: DatabaseColumn[];
    }>,
  ) => {
    setWorkspace((prev) => {
      if (!prev || !prev.databases[dbId]) return prev;
      return {
        ...prev,
        databases: {
          ...prev.databases,
          [dbId]: { ...prev.databases[dbId], ...patch },
        },
      };
    });
    try {
      if (activeCloudUid) {
        await cloudUpdateDatabase(activeCloudUid, dbId, patch);
      } else {
        await api.updateDatabase(dbId, patch);
        refreshPendingCount();
      }
    } catch {
      showToast('Failed to update database');
    }
  };

  const handleAddDatabaseRow = async (
    dbId: string,
    cells: Record<string, DatabaseCellValue> = {},
  ) => {
    if (!workspace) return;
    try {
      if (activeCloudUid) {
        const db = workspace.databases[dbId];
        if (!db) return;
        const now = new Date().toISOString();
        const rowPageId = createId('rowp');
        const titleCol = db.columns.find((c) => c.type === 'title');
        const rowTitle = String((titleCol ? cells[titleCol.id] : '') || 'Untitled item');
        const rowPage: Page = {
          id: rowPageId,
          parentId: null,
          title: rowTitle,
          icon: '📄',
          cover: null,
          coverPosition: 50,
          font: 'sans',
          smallText: false,
          fullWidth: false,
          isFavorite: false,
          isTrashed: false,
          isDatabase: false,
          isRowPage: true,
          locked: false,
          position: 0,
          createdAt: now,
          updatedAt: now,
        };
        const row = {
          id: createId('row'),
          databaseId: dbId,
          pageId: rowPageId,
          cells: titleCol ? { [titleCol.id]: rowTitle, ...cells } : cells,
          position: db.rows.length,
          createdAt: now,
          updatedAt: now,
        };
        setWorkspace((prev) =>
          prev && prev.databases[dbId]
            ? {
                ...prev,
                pages: [...prev.pages, rowPage],
                blocksByPage: { ...prev.blocksByPage, [rowPageId]: [] },
                databases: {
                  ...prev.databases,
                  [dbId]: { ...prev.databases[dbId], rows: [...prev.databases[dbId].rows, row] },
                },
              }
            : prev,
        );
        await cloudAddDatabaseRow(activeCloudUid, row, rowPage);
        return;
      }

      const res = await api.addDatabaseRow(dbId, cells);
      refreshPendingCount();
      if (res.synced && res.data) {
        const data = res.data;
        setWorkspace((prev) => {
          if (!prev || !prev.databases[dbId]) return prev;
          return {
            ...prev,
            pages: [...prev.pages, data.rowPage],
            blocksByPage: { ...prev.blocksByPage, [data.rowPage.id]: [] },
            databases: {
              ...prev.databases,
              [dbId]: {
                ...prev.databases[dbId],
                rows: [...prev.databases[dbId].rows, data.row],
              },
            },
          };
        });
      } else {
        const db = workspace.databases[dbId];
        if (!db) return;
        const now = new Date().toISOString();
        const rowPageId = createId('rowp');
        const titleCol = db.columns.find((c) => c.type === 'title');
        const rowTitle = String((titleCol ? cells[titleCol.id] : '') || 'Untitled item');
        const rowPage: Page = {
          id: rowPageId,
          parentId: null,
          title: rowTitle,
          icon: '📄',
          cover: null,
          coverPosition: 50,
          font: 'sans',
          smallText: false,
          fullWidth: false,
          isFavorite: false,
          isTrashed: false,
          isDatabase: false,
          isRowPage: true,
          locked: false,
          position: 0,
          createdAt: now,
          updatedAt: now,
        };
        const row = {
          id: createId('row'),
          databaseId: dbId,
          pageId: rowPageId,
          cells: titleCol ? { [titleCol.id]: rowTitle, ...cells } : cells,
          position: db.rows.length,
          createdAt: now,
          updatedAt: now,
        };
        setWorkspace((prev) =>
          prev && prev.databases[dbId]
            ? {
                ...prev,
                pages: [...prev.pages, rowPage],
                blocksByPage: { ...prev.blocksByPage, [rowPageId]: [] },
                databases: {
                  ...prev.databases,
                  [dbId]: { ...prev.databases[dbId], rows: [...prev.databases[dbId].rows, row] },
                },
              }
            : prev,
        );
      }
    } catch {
      showToast('Failed to add database item');
    }
  };

  const handleUpdateDatabaseRow = async (
    dbId: string,
    rowId: string,
    cells: Record<string, DatabaseCellValue>,
  ) => {
    const existingDb = workspaceRef.current?.databases[dbId];
    const targetRow = existingDb?.rows.find((r) => r.id === rowId);
    const titleCol = existingDb?.columns.find((c) => c.type === 'title');
    const mergedCells = { ...(targetRow?.cells ?? {}), ...cells };

    setWorkspace((prev) => {
      if (!prev || !prev.databases[dbId]) return prev;
      const db = prev.databases[dbId];
      const tCol = db.columns.find((c) => c.type === 'title');
      const updatedRows = db.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, ...cells } } : r,
      );
      let nextPages = prev.pages;
      if (tCol && cells[tCol.id] !== undefined) {
        const tRow = db.rows.find((r) => r.id === rowId);
        if (tRow) {
          nextPages = prev.pages.map((p) =>
            p.id === tRow.pageId ? { ...p, title: String(cells[tCol.id] ?? '') } : p,
          );
        }
      }
      return {
        ...prev,
        pages: nextPages,
        databases: { ...prev.databases, [dbId]: { ...db, rows: updatedRows } },
      };
    });

    try {
      if (activeCloudUid) {
        await cloudUpdateDatabaseRow(activeCloudUid, rowId, mergedCells);
        if (titleCol && cells[titleCol.id] !== undefined && targetRow?.pageId) {
          await cloudUpdatePage(activeCloudUid, targetRow.pageId, {
            title: String(cells[titleCol.id] ?? ''),
          });
        }
      } else {
        await api.updateDatabaseRow(dbId, rowId, cells);
        refreshPendingCount();
      }
    } catch {
      showToast('Failed to update item');
    }
  };

  const handleDeleteDatabaseRow = async (dbId: string, rowId: string) => {
    const existingDb = workspaceRef.current?.databases[dbId];
    const targetRow = existingDb?.rows.find((r) => r.id === rowId);

    setWorkspace((prev) => {
      if (!prev || !prev.databases[dbId]) return prev;
      const db = prev.databases[dbId];
      const tRow = db.rows.find((r) => r.id === rowId);
      return {
        ...prev,
        pages: tRow ? prev.pages.filter((p) => p.id !== tRow.pageId) : prev.pages,
        databases: {
          ...prev.databases,
          [dbId]: { ...db, rows: db.rows.filter((r) => r.id !== rowId) },
        },
      };
    });
    try {
      if (activeCloudUid) {
        await cloudDeleteDatabaseRow(activeCloudUid, rowId, targetRow?.pageId);
      } else {
        await api.deleteDatabaseRow(dbId, rowId);
        refreshPendingCount();
      }
    } catch {
      showToast('Failed to delete item');
    }
  };

  const handleAddComment = async (text: string) => {
    if (!activePage) return;
    const tempId = createId('cmt');
    const optimistic: PageComment = {
      id: tempId,
      pageId: activePage.id,
      author: access.displayName,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    setWorkspace((prev) => {
      if (!prev) return prev;
      const existing = prev.commentsByPage?.[activePage.id] ?? [];
      return {
        ...prev,
        commentsByPage: {
          ...(prev.commentsByPage ?? {}),
          [activePage.id]: [...existing, optimistic],
        },
      };
    });
    try {
      if (activeCloudUid) {
        await cloudAddComment(activeCloudUid, optimistic);
        return;
      }
      const res = await api.addComment(activePage.id, text, access.displayName);
      refreshPendingCount();
      if (res.synced && res.data) {
        const savedComment = res.data.comment;
        setWorkspace((prev) => {
          if (!prev) return prev;
          const existing = prev.commentsByPage?.[activePage.id] ?? [];
          return {
            ...prev,
            commentsByPage: {
              ...(prev.commentsByPage ?? {}),
              [activePage.id]: existing.map((c) => (c.id === tempId ? savedComment : c)),
            },
          };
        });
      }
    } catch {
      showToast('Failed to save comment');
    }
  };

  const handleToggleResolveComment = async (commentId: string, resolved: boolean) => {
    if (!activePage) return;
    setWorkspace((prev) => {
      if (!prev) return prev;
      const existing = prev.commentsByPage?.[activePage.id] ?? [];
      return {
        ...prev,
        commentsByPage: {
          ...(prev.commentsByPage ?? {}),
          [activePage.id]: existing.map((c) => (c.id === commentId ? { ...c, resolved } : c)),
        },
      };
    });
    try {
      if (activeCloudUid) {
        await cloudUpdateComment(activeCloudUid, commentId, { resolved });
      } else {
        await api.updateComment(commentId, { resolved });
        refreshPendingCount();
      }
    } catch {
      showToast('Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activePage) return;
    setWorkspace((prev) => {
      if (!prev) return prev;
      const existing = prev.commentsByPage?.[activePage.id] ?? [];
      return {
        ...prev,
        commentsByPage: {
          ...(prev.commentsByPage ?? {}),
          [activePage.id]: existing.filter((c) => c.id !== commentId),
        },
      };
    });
    try {
      if (activeCloudUid) {
        await cloudDeleteComment(activeCloudUid, commentId);
      } else {
        await api.deleteComment(commentId);
        refreshPendingCount();
      }
    } catch {
      showToast('Failed to delete comment');
    }
  };

  const handleUpdateSettings = async (
    patch: Partial<{ name: string; icon: string; theme: ThemeMode }>,
  ) => {
    if (!canManage) { showToast('Only Admin can manage workspace settings'); return; }
    if (patch.theme) applyTheme(patch.theme);
    setWorkspace((prev) => {
      if (!prev) return prev;
      return { ...prev, settings: { ...prev.settings, ...patch } };
    });
    try {
      if (activeCloudUid) {
        await cloudUpdateSettings(activeCloudUid, patch);
      } else {
        const res = await api.updateSettings(patch);
        refreshPendingCount();
        if (res.synced && res.data) {
          const nextSettings = res.data.settings;
          setWorkspace((prev) => (prev ? { ...prev, settings: nextSettings } : prev));
        }
      }
    } catch {
      showToast('Failed to save settings');
    }
  };

  const handleSignInCloud = async () => {
    // The first Google sign-in still requires a user gesture. Subsequent
    // visits reuse the existing verified Firebase Auth session automatically.
    try { localStorage.removeItem(CLOUD_PAUSED_KEY); } catch { /* ignore */ }
    setCloudModeRequested(true);
    try {
      if (!auth.currentUser?.emailVerified) await signInWithGoogle();
      showToast('Menghubungkan Firebase Cloud DB...');
    } catch {
      setCloudModeRequested(false);
      showToast('Koneksi Google dibatalkan. Mode Lokal tetap aktif.');
    }
  };

  const handleSignOutCloud = async () => {
    // Respect explicit Local mode on future visits and preserve local cache.
    try { localStorage.setItem(CLOUD_PAUSED_KEY, '1'); } catch { /* ignore */ }
    setCloudModeRequested(false);
    workspaceCacheOwnerRef.current = null;
    setCloudUser(null);
    setCloudSyncStatus('local');
    try {
      await signOutGoogle();
    } catch {
      // Cached Firebase sessions are ignored unless cloud is opted into again.
    }
    await loadWorkspace();
    showToast('Mode Lokal aktif. Data hanya tersimpan di browser ini.');
  };

  const handlePushLocalToCloud = async () => {
    if (!canManage) { showToast('Only Admin can replace cloud workspace data'); return; }
    if (!activeCloudUid || !workspace) return;
    try {
      setCloudSyncStatus('connecting');
      await cloudReplaceWorkspace(activeCloudUid, workspace);
      setCloudSyncStatus('synced');
      showToast('Workspace pushed to Firebase Firestore');
    } catch {
      setCloudSyncStatus('error');
      showToast('Failed to push workspace to Firestore');
    }
  };

  const handleCopyMarkdown = () => {
    if (!workspace || !activePage) return;
    const md = renderPageToMarkdown(
      activePage,
      workspace.blocksByPage[activePage.id] ?? [],
      workspace.databases,
    );
    navigator.clipboard?.writeText(md);
    showToast('Copied page as Markdown');
  };

  const handleDownloadMarkdown = () => {
    if (!workspace || !activePage) return;
    const md = renderPageToMarkdown(
      activePage,
      workspace.blocksByPage[activePage.id] ?? [],
      workspace.databases,
    );
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activePage.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadWorkspaceJson = () => {
    if (!canManage) { showToast('Workspace backups are Admin only'); return; }
    if (isOnline && !isStaticHostMode()) {
      const a = document.createElement('a');
      a.href = '/api/export';
      a.download = 'plc-workspace-backup.json';
      a.click();
      return;
    }
    if (!workspace) return;
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plc-workspace-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-screen flex bg-[var(--notion-bg)]">
        <div className="hidden md:block w-[248px] bg-[var(--notion-sidebar)] border-r border-[var(--notion-border)] p-4 space-y-3">
          <div className="h-6 w-36 rounded bg-[var(--notion-active)] animate-pulse" />
          <div className="h-4 w-full rounded bg-[var(--notion-hover)] animate-pulse" />
          <div className="h-4 w-4/5 rounded bg-[var(--notion-hover)] animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-[var(--notion-hover)] animate-pulse" />
        </div>
        <div className="flex-1 p-12 max-w-[760px] mx-auto space-y-4">
          <div className="h-12 w-12 rounded-xl bg-[var(--notion-surface-muted)] animate-pulse" />
          <div className="h-10 w-2/3 rounded bg-[var(--notion-surface-muted)] animate-pulse" />
          <div className="h-4 w-full rounded bg-[var(--notion-surface-muted)] animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-[var(--notion-surface-muted)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center p-6 bg-[var(--notion-bg)] text-[var(--notion-text)]">
        <div className="max-w-md rounded-xl border border-[var(--notion-border-strong)] p-6 space-y-3 text-center">
          <h1 className="text-base font-semibold">Workspace Connection Error</h1>
          <p className="text-xs text-[var(--notion-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={loadWorkspace}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--notion-accent)] text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (lockedMeta && !workspace) {
    return (
      <LockScreen
        settings={lockedMeta}
        onUnlock={async (password) => {
          const res = await api.login(password);
          setLockedMeta(null);
          setWorkspace(res.workspace);
          saveCachedWorkspace(res.workspace);
          applyTheme(res.workspace.settings.theme);
          selectInitialPage(res.workspace);
        }}
      />
    );
  }

  if (!workspace) return null;

  // Preserve existing cloud data on permission failures. Require an explicit
  // disconnect rather than silently writing a cloud snapshot into local storage.
  if (cloudModeRequested && cloudUser && cloudSyncStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--notion-bg)] px-5 text-[var(--notion-text)]">
        <div className="max-w-md w-full rounded-xl border border-amber-400/50 bg-[var(--notion-surface)] p-6 space-y-4 shadow-lg">
          <h1 className="text-lg font-semibold">Akses Firebase ditolak</h1>
          <p className="text-sm text-[var(--notion-text-secondary)]">
            Firestore menolak akses akun Google ini. Data cloud tidak diubah.
            Agar PLC Comm dan upload CSV bisa digunakan di browser ini, keluar dari Cloud DB dan pilih Mode Lokal.
          </p>
          <p className="text-xs text-[var(--notion-text-muted)]">
            Mode Lokal hanya tersimpan di browser yang digunakan, bukan otomatis sinkron ke anggota tim lain.
          </p>
          <button type="button" onClick={() => { void handleSignOutCloud(); }}
            className="rounded-lg bg-[#0064ff] px-4 py-2 text-sm font-semibold text-white">
            Gunakan Mode Lokal
          </button>
        </div>
      </div>
    );
  }

  const peekDb = peekTarget ? workspace.databases[peekTarget.dbId] : undefined;
  const peekRow = peekDb?.rows.find((r) => r.id === peekTarget?.rowId);
  const peekRowPage = peekRow
    ? workspace.pages.find((p) => p.id === peekRow.pageId)
    : undefined;
  const openCommentCount = activeComments.filter((c) => !c.resolved).length;
  const canUndo = activePage ? (undoStack[activePage.id]?.length ?? 0) > 0 : false;

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[var(--notion-bg)] text-[var(--notion-text)]">
      <Sidebar
        canManage={canManage}
        onRestorePlcComm={() => { void handleRestorePlcComm(); }}
        isOpen={sidebarOpen}
        isMobile={isMobile}
        settings={workspace.settings}
        pages={workspace.pages}
        activePageId={activePage?.id ?? ''}
        onSelectPage={handleSelectPage}
        onCreatePage={openWorkspaceCreator}
        onToggleFavorite={(id) => {
          const p = workspace.pages.find((x) => x.id === id);
          if (p) handleUpdatePage(id, { isFavorite: !p.isFavorite });
        }}
        onDuplicatePage={handleDuplicatePage}
        onTrashPage={handleTrashPage}
        onRestorePage={handleRestorePage}
        onDeleteForever={handleDeleteForever}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => { if (canManage) setSettingsOpen(true); }}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onToggleTheme={(theme) => handleUpdateSettings({ theme })}
        onCloseSidebar={() => setSidebarOpen(false)}
        cloudUser={cloudUser}
        cloudSyncStatus={cloudSyncStatus}
        onSignInCloud={canManage ? handleSignInCloud : undefined}
      />

      <main id="main" className="flex-1 min-w-0 h-full flex flex-col bg-[var(--notion-bg)]">
        {activePage ? (
          <>
            <Topbar
              sidebarOpen={sidebarOpen}
              onOpenSidebar={() => setSidebarOpen(true)}
              breadcrumbs={breadcrumbs}
              activePage={activePage}
              saveState={saveState}
              canManage={canManage}
              commentCount={openCommentCount}
              wordCount={wordCount}
              canUndo={canUndo}
              onUndo={handleUndoBlocks}
              onOpenComments={() => setCommentsOpen(true)}
              onSelectPage={handleSelectPage}
              onUpdatePage={(patch) => handleUpdatePage(activePage.id, patch)}
              onDuplicatePage={() => handleDuplicatePage(activePage.id)}
              onTrashPage={() => handleTrashPage(activePage.id)}
              onCopyMarkdown={handleCopyMarkdown}
              onDownloadMarkdown={handleDownloadMarkdown}
              onDownloadWorkspaceJson={handleDownloadWorkspaceJson}
              onOpenUploadTemplate={() => handleOpenUploadTemplate()}
              onExportProjectTemplate={handleExportProjectTemplate}
              onExportProjectCsv={() => handleExportProjectCsv()}
              onSaveAsTemplate={handleSavePageAsTemplate}
            />

            <PageCanvas
              page={activePage}
              blocks={activeBlocks}
              allPages={workspace.pages}
              databases={workspace.databases}
              onUpdatePage={(patch) => handleUpdatePage(activePage.id, patch)}
              onUpdateBlocks={(blocks) => handleUpdateBlocks(activePage.id, blocks)}
              onSelectPage={handleSelectPage}
              onCreateSubpage={(parentId) => openWorkspaceCreator({ parentId })}
              onUpdateDatabase={handleUpdateDatabase}
              onAddDatabaseRow={handleAddDatabaseRow}
              onUpdateDatabaseRow={handleUpdateDatabaseRow}
              onDeleteDatabaseRow={handleDeleteDatabaseRow}
              onOpenRowPage={(dbId, row) => setPeekTarget({ dbId, rowId: row.id })}
              onOpenComments={() => setCommentsOpen(true)}
              onOpenUploadTemplate={(dbId) => handleOpenUploadTemplate(dbId)}
              onExportProjectTemplate={handleExportProjectTemplate}
              onExportProjectCsv={(dbId) => handleExportProjectCsv(dbId)}
              onExportProjectMarkdown={(dbId) => handleExportProjectMarkdown(dbId)}
              onSaveAsTemplate={handleSavePageAsTemplate}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-[var(--notion-text-muted)]">
              No active pages in workspace.
            </p>
            <button
              type="button"
              onClick={() => openWorkspaceCreator({ parentId: null })}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[var(--notion-accent)] text-white"
            >
              Create First Page
            </button>
          </div>
        )}
      </main>

      <SearchModal
        isOpen={searchOpen}
        pages={workspace.pages}
        blocksByPage={workspace.blocksByPage}
        databases={workspace.databases}
        onSelectPage={handleSelectPage}
        onClose={() => setSearchOpen(false)}
      />

      <CreateWorkspaceModal
        isOpen={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreate={handleCreateWorkspaceFromTemplate}
        parentId={createContext.parentId}
        parentTitle={workspace.pages.find((p) => p.id === createContext.parentId)?.title}
        preferDatabase={createContext.preferDatabase}
        customTemplates={customTemplates}
      />

      <TemplatesModal
        isOpen={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onUseTemplate={handleUseTemplate}
        customTemplates={customTemplates}
        onOpenUploadTemplate={() => handleOpenUploadTemplate()}
        onExportTemplate={handleExportGalleryTemplate}
        onDeleteCustomTemplate={handleDeleteCustomTemplate}
      />

      <UploadTemplateModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        activePageTitle={activePage?.title}
        activePageIsDatabase={Boolean(
          (uploadTargetDbId && workspace.databases[uploadTargetDbId]) ||
            (activePage?.isDatabase && activePage.databaseId),
        )}
        canTargetCurrentPage={Boolean(activePage && !activePage.locked)}
        storageMode={activeCloudUid ? 'cloud' : 'local'}
        onUseLocalMode={() => { setUploadModalOpen(false); void handleSignOutCloud(); }}
        onConfirmImport={handleConfirmTemplateImport}
      />

      <CommentsDrawer
        isOpen={commentsOpen}
        pageTitle={activePage?.title ?? 'Untitled'}
        comments={activeComments}
        onClose={() => setCommentsOpen(false)}
        onAddComment={handleAddComment}
        onToggleResolve={handleToggleResolveComment}
        onDeleteComment={handleDeleteComment}
      />

      {canManage && <SettingsModal
        isOpen={settingsOpen}
        settings={workspace.settings}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onDownloadBackup={handleDownloadWorkspaceJson}
        onImportBackup={async (data) => {
          if (activeCloudUid) {
            await cloudReplaceWorkspace(activeCloudUid, data);
            setWorkspace(data);
            saveCachedWorkspace(data);
            applyTheme(data.settings.theme);
            selectInitialPage(data);
            showToast('Workspace restored to Cloud DB');
            return;
          }
          const res = await api.importWorkspace(data);
          setWorkspace(res.workspace);
          saveCachedWorkspace(res.workspace);
          applyTheme(res.workspace.settings.theme);
          selectInitialPage(res.workspace);
          showToast('Workspace restored');
        }}
        onSetPasscode={async (newPass, currPass) => {
          const res = await api.setPasscode(newPass, currPass);
          setWorkspace((prev) => (prev ? { ...prev, settings: res.settings } : prev));
        }}
        onLockNow={async () => {
          await api.logout();
          setSettingsOpen(false);
          await loadWorkspace();
        }}
        cloudUser={cloudUser}
        cloudSyncStatus={cloudSyncStatus}
        onSignInCloud={handleSignInCloud}
        onSignOutCloud={handleSignOutCloud}
        onPushLocalToCloud={handlePushLocalToCloud}
      />}

      {peekDb && peekRow && (
        <RowPeekModal
          database={peekDb}
          row={peekRow}
          rowPage={peekRowPage}
          blocks={workspace.blocksByPage[peekRow.pageId] ?? []}
          onClose={() => setPeekTarget(null)}
          onUpdateRow={(cells) => handleUpdateDatabaseRow(peekDb.id, peekRow.id, cells)}
          onDeleteRow={() => handleDeleteDatabaseRow(peekDb.id, peekRow.id)}
          onUpdateRowBlocks={(blocks) => handleUpdateBlocks(peekRow.pageId, blocks)}
        />
      )}

      <div className="fixed bottom-4 left-3 z-40 flex items-center gap-2 rounded-xl border border-[var(--notion-border)] bg-[var(--notion-surface)] px-3 py-2 shadow-md">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--notion-text)]">{access.displayName}</div>
          <div className="text-[10px] text-[var(--notion-text-muted)]">{canManage
            ? (activeCloudUid ? 'Admin · Cloud tersambung' : 'Admin · Mode Lokal')
            : 'Editor · Mode Lokal (belum tersinkron bersama)'}</div>
        </div>
        <button type="button" onClick={onLogout}
          className="ml-1 rounded-md border border-[var(--notion-border-strong)] px-2 py-1 text-[11px] font-medium text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]"
          title="Keluar dari workspace">Keluar</button>
      </div>
      <OfflineIndicator pendingCount={pendingCount} />

      {toast && (
        <div
          id="toast"
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-3.5 py-2 rounded-lg bg-[#2f2f2f] text-white text-xs font-medium shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
