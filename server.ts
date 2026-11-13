import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { WorkspaceStore } from './server/db.ts';
import type { Block, DatabaseColumn, DatabaseViewType, ThemeMode, WorkspaceData } from './src/lib/types.ts';

const PORT = Number(process.env.PORT || 3000);
const rawDataDir = (process.env.PLC_DATA_DIR || process.env.DATA_DIR || '').trim();
const DATA_DIR =
  rawDataDir && !/^\d+$/.test(rawDataDir)
    ? rawDataDir
    : path.resolve(process.cwd(), 'data');
const IS_PROD = process.env.NODE_ENV === 'production';

const store = new WorkspaceStore(DATA_DIR);
const app = express();

app.use(express.json({ limit: '10mb' }));

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function isAuthorized(req: Request): boolean {
  const settings = store.getSettings();
  if (!settings.passwordProtected) return true;
  const cookies = parseCookies(req);
  return store.hasSession(cookies.plc_session);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Workspace is locked. Please unlock with passcode.' });
    return;
  }
  next();
}

// Health endpoint for external hosters (Render, Railway, Fly.io, Docker)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, storage: 'sqlite', dataDir: DATA_DIR });
});

// Workspace bootstrap (returns lock screen metadata if passcode enabled & unauthenticated)
app.get('/api/workspace', (req: Request, res: Response) => {
  const settings = store.getSettings();
  if (!isAuthorized(req)) {
    res.json({
      locked: true,
      settings,
    });
    return;
  }
  const workspace = store.getWorkspaceData();
  res.json({
    locked: false,
    workspace,
  });
});

// Optional workspace passcode login/logout/management
app.post('/api/auth/login', (req: Request, res: Response) => {
  const password = String(req.body?.password ?? '');
  if (!store.verifyPassword(password)) {
    res.status(401).json({ error: 'Incorrect workspace passcode.' });
    return;
  }
  const token = store.createSession();
  res.setHeader(
    'Set-Cookie',
    `plc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  );
  res.json({ ok: true, workspace: store.getWorkspaceData() });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const cookies = parseCookies(req);
  store.deleteSession(cookies.plc_session);
  res.setHeader('Set-Cookie', 'plc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.post('/api/auth/passcode', requireAuth, (req: Request, res: Response) => {
  const newPassword = String(req.body?.newPassword ?? '');
  const currentPassword = req.body?.currentPassword ? String(req.body.currentPassword) : undefined;
  const result = store.setPassword(newPassword, currentPassword);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  if (newPassword.trim()) {
    const token = store.createSession();
    res.setHeader(
      'Set-Cookie',
      `plc_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );
  }
  res.json({ ok: true, settings: store.getSettings() });
});

// Workspace Settings
app.patch('/api/workspace/settings', requireAuth, (req: Request, res: Response) => {
  const patch = req.body as Partial<{ name: string; icon: string; theme: ThemeMode }>;
  const settings = store.updateSettings(patch);
  res.json({ settings });
});

// Pages CRUD
app.post('/api/pages', requireAuth, (req: Request, res: Response) => {
  const { parentId, title, icon, isDatabase, cover, blocks } = req.body ?? {};
  const result = store.createPage({ parentId, title, icon, isDatabase, cover, blocks });
  res.status(201).json(result);
});

app.patch('/api/pages/:id', requireAuth, (req: Request, res: Response) => {
  const updated = store.updatePage(req.params.id, req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  res.json({ page: updated });
});

app.post('/api/pages/:id/duplicate', requireAuth, (req: Request, res: Response) => {
  const duplicated = store.duplicatePage(req.params.id);
  if (!duplicated) {
    res.status(404).json({ error: 'Page not found' });
    return;
  }
  res.status(201).json(duplicated);
});

app.delete('/api/pages/:id', requireAuth, (req: Request, res: Response) => {
  const deletedIds = store.deletePagePermanently(req.params.id);
  res.json({ deletedIds });
});

// Page Comments
app.post('/api/pages/:id/comments', requireAuth, (req: Request, res: Response) => {
  const text = String(req.body?.text ?? '').trim();
  const author = String(req.body?.author ?? 'Workspace Member').trim();
  if (!text) {
    res.status(400).json({ error: 'Comment text is required.' });
    return;
  }
  const comment = store.addComment(req.params.id, text, author);
  res.status(201).json({ comment });
});

app.patch('/api/comments/:id', requireAuth, (req: Request, res: Response) => {
  const updated = store.updateComment(req.params.id, req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  res.json({ comment: updated });
});

app.delete('/api/comments/:id', requireAuth, (req: Request, res: Response) => {
  store.deleteComment(req.params.id);
  res.json({ ok: true });
});

// Blocks sync
app.put('/api/pages/:id/blocks', requireAuth, (req: Request, res: Response) => {
  const blocks = Array.isArray(req.body?.blocks) ? (req.body.blocks as Block[]) : [];
  const result = store.replacePageBlocks(req.params.id, blocks);
  res.json(result);
});

// Databases & Rows
app.patch('/api/databases/:id', requireAuth, (req: Request, res: Response) => {
  const patch = req.body as Partial<{
    title: string;
    icon: string;
    activeView: DatabaseViewType;
    groupByColumnId: string;
    columns: DatabaseColumn[];
  }>;
  const updated = store.updateDatabase(req.params.id, patch);
  if (!updated) {
    res.status(404).json({ error: 'Database not found' });
    return;
  }
  res.json({ database: updated });
});

app.post('/api/databases/:id/rows', requireAuth, (req: Request, res: Response) => {
  const initialCells = req.body?.cells && typeof req.body.cells === 'object' ? req.body.cells : {};
  const result = store.addDatabaseRow(req.params.id, initialCells);
  res.status(201).json(result);
});

app.patch('/api/databases/:id/rows/:rowId', requireAuth, (req: Request, res: Response) => {
  const cells = req.body?.cells && typeof req.body.cells === 'object' ? req.body.cells : {};
  const updated = store.updateDatabaseRow(req.params.id, req.params.rowId, cells);
  if (!updated) {
    res.status(404).json({ error: 'Row not found' });
    return;
  }
  res.json({ row: updated });
});

app.delete('/api/databases/:id/rows/:rowId', requireAuth, (req: Request, res: Response) => {
  const ok = store.deleteDatabaseRow(req.params.id, req.params.rowId);
  if (!ok) {
    res.status(404).json({ error: 'Row not found' });
    return;
  }
  res.json({ ok: true });
});

// Full Workspace Backup & Restore
app.get('/api/export', requireAuth, (_req: Request, res: Response) => {
  const data = store.getWorkspaceData();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="plc-workspace-backup.json"');
  res.send(JSON.stringify(data, null, 2));
});

app.post('/api/import', requireAuth, (req: Request, res: Response) => {
  const payload = req.body as WorkspaceData;
  if (!payload || !Array.isArray(payload.pages) || typeof payload.blocksByPage !== 'object') {
    res.status(400).json({ error: 'Invalid workspace backup JSON format.' });
    return;
  }
  store.importWorkspaceData(payload);
  res.json({ ok: true, workspace: store.getWorkspaceData() });
});

async function startServer() {
  const httpServer = http.createServer(app);
  const disableHmr = process.env.DISABLE_HMR === 'true';

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (disableHmr) {
      app.get('/@vite/client', async (_req: Request, res: Response, next: NextFunction) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) {
            next();
            return;
          }
          const patched = result.code.replace(
            'const createWebSocketModuleRunnerTransport = (options) => {',
            'const createWebSocketModuleRunnerTransport = () => ({ connect: async () => {}, disconnect: async () => {}, send: () => {} }); const _disabledWebSocketTransport = (options) => {',
          );
          res.setHeader('Content-Type', 'application/javascript');
          res.send(patched);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PLC Workspace server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
