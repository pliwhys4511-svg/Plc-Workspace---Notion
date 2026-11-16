import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, Columns3, FileText, LayoutTemplate, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { NOTION_TEMPLATES, type NotionTemplate } from '../lib/templates';
import type { DatabaseColumn, DatabaseColumnType } from '../lib/types';
import {
  defaultWorkspaceColumns,
  templateColumns,
  type WorkspaceKind,
  type WorkspaceProjectSelection,
} from '../lib/workspaceCreate';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (template: NotionTemplate | null, settings: WorkspaceProjectSelection) => Promise<void>;
  parentId?: string | null;
  parentTitle?: string;
  preferDatabase?: boolean;
  customTemplates?: NotionTemplate[];
}

const TYPES: DatabaseColumnType[] = [
  'title', 'select', 'multi_select', 'date', 'person', 'number', 'checkbox', 'url',
];

export function CreateWorkspaceModal({
  isOpen, onClose, onCreate, parentId = null, parentTitle,
  preferDatabase = false, customTemplates = [],
}: CreateWorkspaceModalProps) {
  const [selectedId, setSelectedId] = useState('tpl_ld_projects');
  const [title, setTitle] = useState('Project & Task Tracker');
  const [icon, setIcon] = useState('📋');
  const [columns, setColumns] = useState<DatabaseColumn[]>([]);
  const [editingColumns, setEditingColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const templates = useMemo(() => [...customTemplates, ...NOTION_TEMPLATES], [customTemplates]);
  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const isBlank = selectedId === 'blank_page' || selectedId === 'blank_database';
  const kind: WorkspaceKind = selectedId === 'blank_database'
    ? 'database' : selectedId === 'blank_page' ? 'page'
    : selectedTemplate?.isDatabase ? 'database' : 'page';
  const categoryNames = Array.from(new Set(templates.map((t) => t.category)));
  const [category, setCategory] = useState('All');
  const filtered = templates.filter((t) =>
    (category === 'All' || t.category === category)
    && (t.name + ' ' + t.description).toLowerCase().includes(search.toLowerCase()),
  );

  const choose = (id: string) => {
    setSelectedId(id);
    setEditingColumns(false);
    setError('');
    if (id === 'blank_page') {
      setTitle('New Page'); setIcon('📄'); setColumns([]);
    } else if (id === 'blank_database') {
      setTitle('New Database'); setIcon('🗂️'); setColumns(defaultWorkspaceColumns());
    } else {
      const tpl = templates.find((t) => t.id === id);
      if (!tpl) return;
      setTitle(tpl.name); setIcon(tpl.icon);
      setColumns(templateColumns(tpl, tpl.isDatabase ? 'database' : 'page'));
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const initial = preferDatabase ? 'tpl_ld_projects' : 'tpl_ld_brief';
    const tpl = templates.find((t) => t.id === initial);
    setSelectedId(initial);
    setTitle(tpl?.name ?? 'New Project');
    setIcon(tpl?.icon ?? '🗂️');
    setColumns(templateColumns(tpl ?? null, tpl?.isDatabase ? 'database' : 'page'));
    setCategory('All');
    setSearch('');
    setEditingColumns(false);
    setSaving(false);
    setError('');
  }, [isOpen, parentId, preferDatabase]); // Reset each time creation begins

  if (!isOpen) return null;

  const changeColumn = (index: number, patch: Partial<DatabaseColumn>) => {
    setColumns((prev) => prev.map((col, i) => i === index ? { ...col, ...patch } : col));
  };
  const addColumn = () => {
    setColumns((prev) => [...prev, {
      id: `col_custom_${Math.random().toString(36).slice(2, 10)}`,
      name: 'New Property', type: 'select', width: 150, options: [],
    }]);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Nama project wajib diisi.'); return; }
    if (kind === 'database' && (columns.length === 0 || columns[0].type !== 'title')) {
      setError('Database wajib memiliki satu kolom judul.');
      return;
    }
    if (kind === 'database' && columns.some((c) => !c.name.trim())) {
      setError('Semua kolom harus memiliki nama.');
      return;
    }
    setSaving(true); setError('');
    try {
      await onCreate(isBlank ? null : selectedTemplate, {
        title: title.trim(), icon: icon.trim(),
        parentId, kind, columns: kind === 'database' ? columns : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5"
      role="dialog" aria-modal="true" aria-label="Buat project workspace">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] shadow-[var(--notion-shadow)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--notion-border)] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--notion-text)] flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-[#0064ff]"/> Buat Project / Workspace
            </h2>
            <p className="mt-1 text-xs text-[var(--notion-text-muted)]">
              Pilih template, sesuaikan kolom dan nama, lalu mulai bekerja.
              {parentTitle ? ` · Di dalam: ${parentTitle}` : ' · Di dalam Workspace'}
            </p>
          </div>
          <button type="button" aria-label="Tutup" onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[310px_1fr] flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="p-4 space-y-3 md:overflow-y-auto border-b md:border-b-0 md:border-r border-[var(--notion-border)] bg-[var(--notion-sidebar)]">
            <label className="block text-xs font-semibold text-[var(--notion-text-secondary)]">Temukan template</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] text-sm text-[var(--notion-text)]"
              placeholder="Cari tracker, event, meeting..." />
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {['All', ...categoryNames].map((item) => (
                <button key={item} type="button" onClick={() => setCategory(item)}
                  className={`text-[11px] whitespace-nowrap rounded-full px-2.5 py-1 border ${
                    category === item ? 'border-[#0064ff] bg-blue-500/10 text-[#0064ff]' :
                    'border-[var(--notion-border)] text-[var(--notion-text-muted)]'
                  }`}>{item}</button>
              ))}
            </div>
            <div className="space-y-1.5">
              {[
                { id:'blank_page', icon:'📄', name:'Blank Page', description:'Halaman kosong yang bisa diedit bebas.' },
                { id:'blank_database', icon:'🗂️', name:'Custom Database', description:'Mulai dari kolom dasar, lalu sesuaikan.' },
              ].map((item) => (
                <button type="button" key={item.id} onClick={() => choose(item.id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left ${
                    selectedId === item.id ? 'border-[#0064ff] bg-blue-500/10' :
                    'border-[var(--notion-border)] hover:bg-[var(--notion-hover)]'
                  }`}>
                  <span className="text-xl">{item.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-[var(--notion-text)]">{item.name}</span>
                    <span className="block text-[11px] text-[var(--notion-text-muted)] truncate">{item.description}</span>
                  </span>
                  {selectedId === item.id && <Check className="w-4 h-4 text-[#0064ff]"/>}
                </button>
              ))}
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--notion-text-muted)] pt-3 pb-1">Rekomendasi Template</div>
              {filtered.map((t) => (
                <button key={t.id} type="button" onClick={() => choose(t.id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left ${
                    selectedId === t.id ? 'border-[#0064ff] bg-blue-500/10' :
                    'border-[var(--notion-border)] hover:bg-[var(--notion-hover)]'
                  }`}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-[var(--notion-text)] truncate">{t.name}</span>
                    <span className="block text-[11px] text-[var(--notion-text-muted)] truncate">{t.description}</span>
                  </span>
                  {selectedId === t.id && <Check className="w-4 h-4 text-[#0064ff]"/>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-[var(--notion-text-muted)] py-3">Tidak ada template yang cocok.</p>}
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col min-h-0 md:overflow-y-auto">
            <div className="px-5 sm:px-7 py-6 space-y-5 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0064ff]">
                <Sparkles className="w-4 h-4"/> Customize project
              </div>
              <div className="grid grid-cols-[58px_1fr] gap-3">
                <label className="block">
                  <span className="block mb-1.5 text-xs text-[var(--notion-text-secondary)]">Icon</span>
                  <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={12}
                    className="w-full rounded-lg border border-[var(--notion-border)] bg-[var(--notion-surface)] text-center text-xl p-2 text-[var(--notion-text)]" />
                </label>
                <label className="block">
                  <span className="block mb-1.5 text-xs text-[var(--notion-text-secondary)]">Nama project / workspace</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required
                    className="w-full rounded-lg border border-[var(--notion-border)] bg-[var(--notion-surface)] p-3 text-sm font-semibold text-[var(--notion-text)]"
                    placeholder="Contoh: Training Plan 2027" />
                </label>
              </div>
              <div className="rounded-xl border border-[var(--notion-border)] p-4 bg-[var(--notion-surface)]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--notion-text)]">
                    {kind === 'database' ? <Columns3 className="w-4 h-4 text-[#0064ff]"/> : <FileText className="w-4 h-4 text-[#0064ff]"/>}
                    {kind === 'database' ? 'Database & Properties' : 'Page Content'}
                  </div>
                  {kind === 'database' && <button type="button" onClick={() => setEditingColumns((v) => !v)}
                    className="text-xs font-semibold text-[#0064ff] hover:underline">
                    {editingColumns ? 'Selesai edit' : 'Atur kolom'}
                  </button>}
                </div>
                <p className="text-xs text-[var(--notion-text-muted)] mb-3">
                  {kind === 'database'
                    ? 'Kolom sudah disiapkan sesuai template. Tambahkan atau ubah sebelum membuat project; selanjutnya juga dapat diubah dalam tabel.'
                    : selectedTemplate?.description ?? 'Halaman kosong untuk menulis dokumen, catatan, dan ide.'}
                </p>
                {kind === 'database' ? editingColumns ? (
                  <div className="space-y-2">
                    {columns.map((column,i) => (
                      <div key={column.id} className="flex items-center gap-2">
                        <input aria-label={`Nama kolom ${i+1}`} value={column.name}
                          onChange={(e) => changeColumn(i, {name:e.target.value})}
                          className="min-w-0 flex-1 px-2.5 py-2 text-xs rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] text-[var(--notion-text)]"/>
                        <select aria-label={`Tipe kolom ${i+1}`} value={column.type}
                          disabled={i===0}
                          onChange={(e) => changeColumn(i, {type:e.target.value as DatabaseColumnType})}
                          className="w-32 px-2 py-2 text-xs rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] text-[var(--notion-text)]">
                          {TYPES.filter((t) => i===0 ? t==='title' : t!=='title').map(t=> <option key={t} value={t}>{t}</option>)}
                        </select>
                        {i > 0 ? <button type="button" aria-label="Hapus kolom" onClick={() => setColumns((prev) => prev.filter((c)=>c.id!==column.id))}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md"><Trash2 className="w-4 h-4"/></button>
                        : <span className="w-7 text-center text-[10px] text-[var(--notion-text-muted)]">Wajib</span>}
                      </div>
                    ))}
                    <button type="button" onClick={addColumn} disabled={columns.length >= 40}
                      className="flex items-center gap-1 text-xs font-semibold text-[#0064ff] py-1">
                      <Plus className="w-3.5 h-3.5"/> Tambah kolom
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {columns.map((column) => (
                      <span key={column.id} className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] text-[var(--notion-text-secondary)]">
                        {column.name} <span className="opacity-60">· {column.type}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(selectedTemplate?.blocks ?? []).slice(0,8).map((block,i) => (
                      <div key={i} className="text-xs text-[var(--notion-text-secondary)]">
                        <span className="opacity-60 mr-2">{block.type}</span>{block.content?.replace(/<[^>]*>/g,'') || '—'}
                      </div>
                    ))}
                    {!selectedTemplate?.blocks?.length && <div className="italic text-xs text-[var(--notion-text-muted)]">Mulai menulis dari halaman kosong.</div>}
                  </div>
                )}
              </div>
              <div className="text-xs text-[var(--notion-text-muted)] flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0"/>
                Template adalah titik awal; sesudah dibuat, nama, isi, dan properti bisa disesuaikan lagi.
              </div>
              {error && <p role="alert" className="text-xs text-red-600 rounded-lg bg-red-500/10 px-3 py-2">{error}</p>}
            </div>
            <div className="px-5 sm:px-7 py-4 border-t border-[var(--notion-border)] flex items-center justify-end gap-3 sticky bottom-0 bg-[var(--notion-bg)]">
              <button type="button" onClick={onClose} disabled={saving}
                className="rounded-lg px-4 py-2 text-sm text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]">Batal</button>
              <button type="submit" disabled={saving || !title.trim()}
                className="rounded-lg bg-[#0064ff] disabled:opacity-50 text-white px-4 py-2.5 font-semibold text-sm flex items-center gap-2">
                {saving ? 'Menyimpan...' : 'Buat Workspace'} <ArrowRight className="w-4 h-4"/>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
