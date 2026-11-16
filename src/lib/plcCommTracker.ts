import type { DatabaseColumn, SelectOption, TagColor } from './types';

/**
 * PLC Comm import contract based on the supplied Progress tracker (Sheet1).csv.
 * Contains only schema and allowed labels: NEVER include campaign rows or PIC details
 * in the public GitHub repository.
 */
export const PLC_COMM_HEADERS = [
  'Date', 'Campaign Name', 'Category', 'PIC', 'Status', 'Viewers', 'React', 'Comment', 'Poll',
] as const;

const CATEGORY_LABELS: Array<[string, TagColor]> = [
  ['PEARL Course', 'green'],
  ['Event Training', 'blue'],
  ['PLW', 'purple'],
  ['Book Review', 'purple'],
  ['Bankwide', 'blue'],
  ['Tapping', 'orange'],
  ['Request Design', 'orange'],
  ['PEARL Feature', 'pink'],
  ['Braincation', 'blue'],
  ['Quiz', 'yellow'],
  ['Game Master', 'green'],
  ['Voting', 'yellow'],
  ['AI Campaign', 'purple'],
];
const STATUS_LABELS: Array<[string, TagColor]> = [
  ['Not started', 'gray'],
  ['In progress', 'blue'],
  ['Ready for review', 'yellow'],
  ['Completed', 'green'],
];

function optionId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
}

function makeOptions(values: Array<[string, TagColor]>): SelectOption[] {
  return values.map(([label, color]) => ({ id: optionId(label), label, color }));
}

export function createPlcCommTrackerColumns(): DatabaseColumn[] {
  return [
    { id: 'col_title', name: 'Campaign Name', type: 'title', width: 290 },
    { id: 'col_date', name: 'Date', type: 'date', width: 128 },
    { id: 'col_category', name: 'Category', type: 'select', width: 165, options: makeOptions(CATEGORY_LABELS) },
    { id: 'col_pic', name: 'PIC', type: 'person', width: 255 },
    { id: 'col_status', name: 'Status', type: 'select', width: 153, options: makeOptions(STATUS_LABELS) },
    { id: 'col_viewers', name: 'Viewers', type: 'number', width: 108 },
    { id: 'col_react', name: 'React', type: 'number', width: 92 },
    { id: 'col_comment', name: 'Comment', type: 'number', width: 104 },
    { id: 'col_poll', name: 'Poll', type: 'number', width: 88 },
  ];
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** Allows extra optional columns in future tracker exports. */
export function isPlcCommTrackerHeaders(headers: string[]): boolean {
  const known = PLC_COMM_HEADERS.map(normalizeHeader);
  const found = headers.map(normalizeHeader);
  return found.includes('campaign name') && found.includes('date') &&
    found.filter((name) => known.includes(name as (typeof known)[number])).length >= 7 &&
    new Set(found).size === found.length;
}

function validISODate(year: number, month: number, day: number): string | null {
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() + 1 !== month || result.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Source dates are US month/day/year, even when both parts are <= 12. */
export function normalizePlcCommDate(value: string, line: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const result = validISODate(Number(slash[3]), Number(slash[1]), Number(slash[2]));
    if (result) return result;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const result = validISODate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (result) return result;
  }
  throw new Error(`Baris ${line}: tanggal "${trimmed}" tidak valid. Gunakan MM/DD/YYYY (contoh: 11/25/2026) atau YYYY-MM-DD.`);
}

/** Metrics are integer counts; supports 1,963 and 2.069 thousand-grouping. */
export function parsePlcCommMetric(value: string, label: string, line: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (/^\d{1,3}(?:[,\.]\d{3})+$/.test(trimmed)) {
    return Number(trimmed.replace(/[,\.]/g, ''));
  }
  throw new Error(`Baris ${line}, kolom ${label}: nilai "${trimmed}" bukan angka yang valid.`);
}

export function normalizePlcCommKey(title: unknown, date: unknown): string {
  const t = String(title ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const d = String(date ?? '').trim();
  return t && d ? `${d}\u0000${t}` : '';
}

/** Match new labels without deleting any existing user-defined options. */
export function findOrAddOption(column: DatabaseColumn, value: string): string {
  const name = value.trim();
  if (!name) return '';
  if (!column.options) column.options = [];
  const existing = column.options.find((x) => x.label.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'));
  if (existing) return existing.id;
  const base = optionId(name);
  let id = base;
  let suffix = 2;
  while (column.options.some((opt) => opt.id === id)) id = `${base}_${suffix++}`;
  const color: TagColor = column.name === 'Status'
    ? /complete/i.test(name) ? 'green' : /progress/i.test(name) ? 'blue' : 'gray'
    : 'blue';
  column.options.push({ id, label: name, color });
  return id;
}
