import type { NotionTemplate } from './templates';
import type { DatabaseColumn } from './types';

const STATUS: DatabaseColumn = {
  id: 'col_status', name: 'Status', type: 'select', width: 150,
  options: [
    { id: 'not_started', label: 'Not Started', color: 'gray' },
    { id: 'in_progress', label: 'In Progress', color: 'blue' },
    { id: 'review', label: 'In Review', color: 'yellow' },
    { id: 'completed', label: 'Completed', color: 'green' },
  ],
};
const PRIORITY: DatabaseColumn = {
  id: 'col_priority', name: 'Priority', type: 'select', width: 115,
  options: [
    { id: 'high', label: 'High', color: 'red' },
    { id: 'medium', label: 'Medium', color: 'yellow' },
    { id: 'low', label: 'Low', color: 'green' },
  ],
};

const dbTemplate = (
  id: string, name: string, icon: string, description: string, category: string,
  columns: DatabaseColumn[],
): NotionTemplate => ({
  id, name, icon, description, category, cover: 'grad_sage', isDatabase: true, blocks: [],
  database: { title: name, icon, activeView: 'table', groupByColumnId: 'col_status', columns, rows: [] },
});

/** Empty structures only; no example records or internal employee identities. */
export const PROJECT_STARTERS: NotionTemplate[] = [
  dbTemplate(
    'tpl_ld_projects', 'Project & Task Tracker', '📋',
    'Kelola pekerjaan, penanggung jawab, prioritas, deadline, dan progress project.',
    'Project Management',
    [
      { id: 'col_title', name: 'Task / Deliverable', type: 'title', width: 265 },
      STATUS, PRIORITY, { id: 'col_pic', name: 'PIC', type: 'person', width: 160 },
      { id: 'col_due', name: 'Due Date', type: 'date', width: 140 },
      { id: 'col_progress', name: 'Progress (%)', type: 'number', width: 125 },
    ],
  ),
  dbTemplate(
    'tpl_ld_training', 'Learning Program Tracker', '🎓',
    'Pantau training, jadwal, PIC, peserta, status, dan hasil evaluasi.',
    'Learning & Development',
    [
      { id: 'col_title', name: 'Training / Program', type: 'title', width: 280 },
      STATUS, { id: 'col_pic', name: 'PIC', type: 'person', width: 175 },
      { id: 'col_date', name: 'Date', type: 'date', width: 125 },
      { id: 'col_participants', name: 'Participants', type: 'number', width: 130 },
      { id: 'col_nps', name: 'NPS', type: 'number', width: 90 },
    ],
  ),
  dbTemplate(
    'tpl_ld_events', 'Event & Activity Planner', '📅',
    'Rencanakan aktivitas event, vendor, PIC, tenggat, dan progres persiapan.',
    'Event Planning',
    [
      { id: 'col_title', name: 'Activity', type: 'title', width: 260 },
      STATUS, PRIORITY,
      { id: 'col_pic', name: 'PIC', type: 'person', width: 160 },
      { id: 'col_date', name: 'Target Date', type: 'date', width: 145 },
      { id: 'col_budget', name: 'Budget', type: 'number', width: 120 },
    ],
  ),
  dbTemplate(
    'tpl_ld_content', 'Content & Campaign Calendar', '📣',
    'Rencanakan konten komunikasi, PIC, channel, jadwal tayang, dan engagement.',
    'Communications',
    [
      { id: 'col_title', name: 'Campaign / Content', type: 'title', width: 275 },
      STATUS,
      { id: 'col_channel', name: 'Channel', type: 'select', width: 140,
        options: [
          { id: 'instagram', label: 'Instagram', color: 'pink' },
          { id: 'email', label: 'Email', color: 'blue' },
          { id: 'viva', label: 'Viva Engage', color: 'purple' },
          { id: 'teams', label: 'Teams', color: 'green' },
        ],
      },
      { id: 'col_pic', name: 'PIC', type: 'person', width: 160 },
      { id: 'col_date', name: 'Publish Date', type: 'date', width: 142 },
      { id: 'col_views', name: 'Viewers', type: 'number', width: 105 },
      { id: 'col_engagement', name: 'Engagement', type: 'number', width: 125 },
    ],
  ),
  {
    id: 'tpl_ld_brief', name: 'Project Brief', icon: '🗒️', cover: 'grad_warm',
    category: 'Documentation', description: 'Mulai dari tujuan, scope, timeline, deliverables, dan risiko project.',
    blocks: [
      { type: 'callout', content: 'Project Owner: [PIC] · Status: Draft', icon: '🎯', color: 'blue' },
      { type: 'h2', content: 'Objectives' },
      { type: 'paragraph', content: 'Tuliskan tujuan utama dan hasil yang diharapkan.' },
      { type: 'h2', content: 'Scope & Deliverables' },
      { type: 'todo', content: 'Deliverable 1', checked: false },
      { type: 'h2', content: 'Timeline & Milestones' },
      { type: 'paragraph', content: 'Tambahkan tahapan, PIC, dan target tanggal.' },
      { type: 'h2', content: 'Risks & Next Steps' },
      { type: 'bullet', content: 'Risiko utama dan mitigasinya.' },
    ],
  },
];
