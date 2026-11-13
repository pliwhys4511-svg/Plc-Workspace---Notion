import coverArch from '../assets/images/cover_minimal_arch_1794565698111.jpg';
import coverNordic from '../assets/images/cover_nordic_mist_1794565698501.jpg';
import coverPaper from '../assets/images/cover_studio_paper_1794565698387.jpg';
import type { TagColor } from '../lib/types';

export interface CoverPreset {
  id: string;
  label: string;
  kind: 'image' | 'gradient';
  src?: string;
  gradient?: string;
}

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: 'arch',
    label: 'Travertine Studio',
    kind: 'image',
    src: coverArch,
  },
  {
    id: 'nordic',
    label: 'Nordic Ridge',
    kind: 'image',
    src: coverNordic,
  },
  {
    id: 'paper',
    label: 'Atelier Desk',
    kind: 'image',
    src: coverPaper,
  },
  {
    id: 'grad_slate',
    label: 'Cool Slate',
    kind: 'gradient',
    gradient: 'linear-gradient(120deg, #e2e8f0 0%, #cbd5e1 48%, #94a3b8 100%)',
  },
  {
    id: 'grad_ocean',
    label: 'Deep Horizon',
    kind: 'gradient',
    gradient: 'linear-gradient(125deg, #1e293b 0%, #334155 50%, #475569 100%)',
  },
  {
    id: 'grad_sage',
    label: 'Mineral Sage',
    kind: 'gradient',
    gradient: 'linear-gradient(120deg, #d8e2dc 0%, #bcd0c7 52%, #9bb5aa 100%)',
  },
  {
    id: 'grad_dusk',
    label: 'Dusk Indigo',
    kind: 'gradient',
    gradient: 'linear-gradient(120deg, #2b2d42 0%, #4a4e69 55%, #6b708d 100%)',
  },
  {
    id: 'grad_warm',
    label: 'Sandstone',
    kind: 'gradient',
    gradient: 'linear-gradient(120deg, #ece9e2 0%, #dcd5c9 50%, #c8beb0 100%)',
  },
];

export function resolveCover(cover: string | null): CoverPreset | { kind: 'url'; src: string } | null {
  if (!cover) return null;
  const preset = COVER_PRESETS.find((c) => c.id === cover);
  if (preset) return preset;
  if (cover.startsWith('http://') || cover.startsWith('https://') || cover.startsWith('/')) {
    return { kind: 'url', src: cover };
  }
  return null;
}

export const ICON_CHOICES = [
  '📄', '📐', '🗂️', '📝', '⚙️', '🚀', '💡', '📌',
  '📚', '✅', '🧠', '🔍', '🛠️', '📊', '🗓️', '🎯',
  '⌨️', '🧩', '📦', '🔐', '🌿', '🏔️', '🧪', '🎨',
  '⚡', '🧭', '📁', '💬', '🏗️', '🔗', '🌟', '📋',
];

export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: 'notion-tag-gray',
  brown: 'notion-tag-brown',
  orange: 'notion-tag-orange',
  yellow: 'notion-tag-yellow',
  green: 'notion-tag-green',
  blue: 'notion-tag-blue',
  purple: 'notion-tag-purple',
  pink: 'notion-tag-pink',
  red: 'notion-tag-red',
};

export const CALLOUT_COLOR_CLASSES: Record<string, string> = {
  default: 'notion-callout-default border-transparent',
  gray: 'notion-callout-gray border-transparent',
  blue: 'notion-callout-blue border-transparent',
  green: 'notion-callout-green border-transparent',
  yellow: 'notion-callout-yellow border-transparent',
  red: 'notion-callout-red border-transparent',
};
