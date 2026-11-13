import React, { useState } from 'react';
import { COVER_PRESETS, ICON_CHOICES } from '../data/covers';

interface IconPickerProps {
  currentIcon: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  currentIcon,
  onSelect,
  onClose,
}) => {
  return (
    <div
      className="absolute left-0 top-full mt-2 z-50 w-72 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-3"
      role="dialog"
      aria-label="Choose page icon"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--notion-text-muted)]">Icons</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--notion-text-muted)] hover:text-[var(--notion-text)] px-1.5 py-0.5 rounded"
        >
          Done
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {ICON_CHOICES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className={`h-8 flex items-center justify-center rounded-md text-lg hover:bg-[var(--notion-hover)] transition-colors ${
              currentIcon === emoji ? 'bg-[var(--notion-active)]' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

interface CoverPickerProps {
  currentCover: string | null;
  onSelect: (cover: string | null) => void;
  onClose: () => void;
}

export const CoverPicker: React.FC<CoverPickerProps> = ({
  currentCover,
  onSelect,
  onClose,
}) => {
  const [customUrl, setCustomUrl] = useState('');

  return (
    <div
      className="absolute right-4 top-12 z-50 w-80 rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] p-3 space-y-3"
      role="dialog"
      aria-label="Choose cover image"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--notion-text)]">Page Cover</span>
        <div className="flex items-center gap-2">
          {currentCover && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className="text-xs text-[var(--notion-text-muted)] hover:text-red-500"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--notion-text-muted)] hover:text-[var(--notion-text)]"
          >
            Close
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-[var(--notion-text-muted)] mb-1.5">
          Curated Gallery
        </div>
        <div className="grid grid-cols-2 gap-2">
          {COVER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSelect(preset.id);
                onClose();
              }}
              className={`group relative h-14 rounded-lg overflow-hidden border text-left transition-all ${
                currentCover === preset.id
                  ? 'border-[var(--notion-accent)] ring-2 ring-[var(--notion-accent)]/30'
                  : 'border-[var(--notion-border)] hover:opacity-90'
              }`}
            >
              {preset.kind === 'image' && preset.src ? (
                <img
                  src={preset.src}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full" style={{ background: preset.gradient }} />
              )}
              <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[10px] font-medium text-white bg-gradient-to-t from-black/70 to-transparent truncate">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customUrl.trim()) {
            onSelect(customUrl.trim());
            onClose();
          }
        }}
        className="pt-2 border-t border-[var(--notion-border)] flex items-center gap-1.5"
      >
        <input
          type="url"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Paste image URL (https://...)"
          aria-label="Custom cover image URL"
          className="flex-1 px-2.5 py-1.5 text-xs rounded-md bg-[var(--notion-surface-muted)] border border-[var(--notion-border)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
        />
        <button
          type="submit"
          className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)] shrink-0"
        >
          Apply
        </button>
      </form>
    </div>
  );
};
