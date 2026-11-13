import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderPlus,
  Layers,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  parseUploadedTemplateFile,
  type ParsedTemplateImport,
} from '../lib/templateTransfer';

export type TemplateImportMode = 'append' | 'replace' | 'new_page';

interface UploadTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePageTitle?: string;
  activePageIsDatabase?: boolean;
  canTargetCurrentPage?: boolean;
  onConfirmImport: (
    parsed: ParsedTemplateImport,
    mode: TemplateImportMode,
    saveToGallery: boolean,
  ) => Promise<void> | void;
}

export const UploadTemplateModal: React.FC<UploadTemplateModalProps> = ({
  isOpen,
  onClose,
  activePageTitle,
  activePageIsDatabase = false,
  canTargetCurrentPage = true,
  onConfirmImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [fileName, setFileName] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [pasteFileName, setPasteFileName] = useState<string>('notion-template.csv');
  const [dragActive, setDragActive] = useState(false);
  const [importMode, setImportMode] = useState<TemplateImportMode>(
    canTargetCurrentPage && activePageIsDatabase ? 'append' : 'new_page',
  );
  const [saveToGallery, setSaveToGallery] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const parseResult = useMemo<{
    parsed: ParsedTemplateImport | null;
    error: string | null;
  }>(() => {
    if (!rawText.trim()) return { parsed: null, error: null };
    try {
      const effectiveName = inputMode === 'file' ? fileName || 'template.txt' : pasteFileName || 'template.csv';
      const parsed = parseUploadedTemplateFile(effectiveName, rawText);
      return { parsed, error: null };
    } catch (err) {
      return {
        parsed: null,
        error: err instanceof Error ? err.message : 'Gagal membaca file template.',
      };
    }
  }, [rawText, fileName, pasteFileName, inputMode]);

  if (!isOpen) return null;

  const parsed = parseResult.parsed;
  const displayError = manualError || parseResult.error;
  const hasTableRows = Boolean(parsed && parsed.rows.length > 0 && parsed.columns.length > 0);
  const canAppend = canTargetCurrentPage && activePageIsDatabase && hasTableRows;
  const canReplace =
    canTargetCurrentPage &&
    parsed !== null &&
    (activePageIsDatabase ? hasTableRows : parsed.blocks.length > 0 || hasTableRows);

  const effectiveMode: TemplateImportMode =
    importMode === 'append' && !canAppend
      ? canReplace
        ? 'replace'
        : 'new_page'
      : importMode === 'replace' && !canReplace
      ? 'new_page'
      : importMode;

  const handleFilePicked = async (file: File) => {
    setManualError(null);
    if (file.size > 4 * 1024 * 1024) {
      setManualError('Ukuran file terlalu besar (maksimal 4 MB).');
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setInputMode('file');
      setRawText(text);
      const preview = parseUploadedTemplateFile(file.name, text);
      if (canTargetCurrentPage && activePageIsDatabase && preview.rows.length > 0) {
        setImportMode('append');
      } else {
        setImportMode('new_page');
      }
    } catch (err) {
      setFileName(file.name);
      setManualError(err instanceof Error ? err.message : 'File tidak bisa dibaca.');
    }
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    setManualError(null);
    try {
      await onConfirmImport(parsed, effectiveMode, saveToGallery);
      setRawText('');
      setFileName('');
      onClose();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Gagal mengimpor template.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatLabel =
    parsed?.sourceFormat === 'notion-csv'
      ? 'Notion CSV'
      : parsed?.sourceFormat === 'notion-markdown'
      ? 'Notion Markdown'
      : parsed?.sourceFormat === 'template-json'
      ? 'Template JSON'
      : parsed?.sourceFormat === 'workspace-json'
      ? 'Workspace JSON'
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Upload & Import Notion Template"
    >
      <div
        className="w-full max-w-xl max-h-[88vh] rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--notion-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-4 h-4 text-[var(--notion-accent)] shrink-0" />
            <h2 className="text-sm font-semibold text-[var(--notion-text)] truncate">
              Upload Template / Import Notion
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close upload modal"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Source Mode Switch */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--notion-surface-muted)] w-fit">
            <button
              type="button"
              onClick={() => setInputMode('file')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                inputMode === 'file'
                  ? 'bg-[var(--notion-bg)] text-[var(--notion-text)] shadow-xs'
                  : 'text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]'
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                inputMode === 'paste'
                  ? 'bg-[var(--notion-bg)] text-[var(--notion-text)] shadow-xs'
                  : 'text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]'
              }`}
            >
              Paste CSV / Markdown / JSON
            </button>
          </div>

          {inputMode === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) void handleFilePicked(dropped);
              }}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                dragActive
                  ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/5'
                  : 'border-[var(--notion-border-strong)] bg-[var(--notion-surface-muted)]/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.md,.markdown,.json,.txt"
                aria-label="Choose template file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFilePicked(f);
                  e.target.value = '';
                }}
              />
              <FileUp className="w-7 h-7 mx-auto mb-2 text-[var(--notion-text-muted)]" />
              <p className="text-xs font-medium text-[var(--notion-text)]">
                {fileName ? `File dipilih: ${fileName}` : 'Tarik file ke sini atau pilih dari perangkat'}
              </p>
              <p className="text-[11px] text-[var(--notion-text-muted)] mt-1">
                Mendukung export Notion: <strong>.csv</strong> (Database), <strong>.md</strong> (Markdown &amp; Tabel), atau <strong>.json</strong> (Template Package)
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] hover:bg-[var(--notion-hover)] transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{fileName ? 'Ganti File' : 'Pilih File (.csv, .md, .json)'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="paste-template-name" className="text-xs font-medium text-[var(--notion-text-secondary)]">
                  Nama / Format (akhiri dengan .csv, .md, atau .json)
                </label>
                <input
                  id="paste-template-name"
                  type="text"
                  value={pasteFileName}
                  onChange={(e) => setPasteFileName(e.target.value)}
                  className="w-48 px-2 py-1 text-xs rounded border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-[var(--notion-text)]"
                />
              </div>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setManualError(null);
                  setRawText(e.target.value);
                }}
                rows={5}
                aria-label="Paste template content"
                placeholder={'Initiative,Status,Priority,Target Date,Verified\nBuild Release Notes,In Progress,High,2026-12-01,No'}
                className="w-full rounded-lg border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] p-2.5 text-xs font-mono text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
              />
            </div>
          )}

          {/* Error Banner */}
          {displayError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Parsed Preview */}
          {parsed && !displayError && (
            <div className="rounded-lg border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-base leading-none">{parsed.icon}</span>
                  <span className="text-xs font-semibold text-[var(--notion-text)] truncate">
                    {parsed.name}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[var(--notion-surface-muted)] text-[10px] font-medium text-[var(--notion-text-secondary)] shrink-0">
                  {formatLabel}
                </span>
              </div>

              <div className="text-[11px] text-[var(--notion-text-muted)]">
                {parsed.summary}
              </div>

              {parsed.columns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parsed.columns.map((col) => (
                    <span
                      key={col.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--notion-surface-muted)] text-[11px] text-[var(--notion-text-secondary)]"
                    >
                      <FileSpreadsheet className="w-3 h-3 opacity-70" />
                      <span>{col.name}</span>
                      <span className="text-[10px] opacity-60">({col.type})</span>
                    </span>
                  ))}
                </div>
              )}

              {parsed.columns.length === 0 && parsed.blocks.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {parsed.blocks.slice(0, 4).map((b, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-[11px] text-[var(--notion-text-secondary)] truncate">
                      <FileText className="w-3 h-3 shrink-0 opacity-60" />
                      <span className="font-mono text-[10px] uppercase opacity-60">{b.type}</span>
                      <span className="truncate">{b.content || '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Import Destination Options */}
              <div className="pt-2 border-t border-[var(--notion-border)] space-y-2">
                <div className="text-[11px] font-semibold text-[var(--notion-text-muted)]">
                  Tujuan Import
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {canAppend && (
                    <label
                      className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                        effectiveMode === 'append'
                          ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/5'
                          : 'border-[var(--notion-border)] hover:bg-[var(--notion-hover)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="import-mode"
                        checked={effectiveMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="mt-0.5 accent-[var(--notion-accent)]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--notion-text)]">
                          <Layers className="w-3.5 h-3.5 text-[var(--notion-accent)]" />
                          <span>Tambahkan baris ke "{activePageTitle || 'Project ini'}"</span>
                        </div>
                        <div className="text-[11px] text-[var(--notion-text-muted)]">
                          Menambahkan {parsed.rows.length} baris dan menyesuaikan kolom/tag secara otomatis.
                        </div>
                      </div>
                    </label>
                  )}

                  {canReplace && (
                    <label
                      className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                        effectiveMode === 'replace'
                          ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/5'
                          : 'border-[var(--notion-border)] hover:bg-[var(--notion-hover)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="import-mode"
                        checked={effectiveMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 accent-[var(--notion-accent)]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--notion-text)]">
                          <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                          <span>Terapkan &amp; ganti isi "{activePageTitle || 'Halaman ini'}"</span>
                        </div>
                        <div className="text-[11px] text-[var(--notion-text-muted)]">
                          Mengganti struktur dan baris/blok halaman aktif dengan isi file ini.
                        </div>
                      </div>
                    </label>
                  )}

                  <label
                    className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                      effectiveMode === 'new_page'
                        ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/5'
                        : 'border-[var(--notion-border)] hover:bg-[var(--notion-hover)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      checked={effectiveMode === 'new_page'}
                      onChange={() => setImportMode('new_page')}
                      className="mt-0.5 accent-[var(--notion-accent)]"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--notion-text)]">
                        <FolderPlus className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Buat halaman project baru</span>
                      </div>
                      <div className="text-[11px] text-[var(--notion-text-muted)]">
                        Membuat halaman baru "{parsed.name}" di sidebar tanpa mengubah project yang ada.
                      </div>
                    </div>
                  </label>
                </div>

                <label className="flex items-center gap-2 pt-1 text-xs text-[var(--notion-text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToGallery}
                    onChange={(e) => setSaveToGallery(e.target.checked)}
                    className="rounded accent-[var(--notion-accent)]"
                  />
                  <span>Simpan juga ke Galeri Templates agar bisa dipakai ulang</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--notion-border)] flex items-center justify-end gap-2 bg-[var(--notion-sidebar)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!parsed || Boolean(displayError) || submitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{submitting ? 'Mengimpor...' : 'Import Template'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
