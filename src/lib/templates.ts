import type { Block, BlockType } from './types';

export interface NotionTemplate {
  id: string;
  name: string;
  icon: string;
  cover: string | null;
  category: string;
  description: string;
  isDatabase?: boolean;
  blocks: Array<Partial<Block> & { type: BlockType; content: string }>;
}

export const NOTION_TEMPLATES: NotionTemplate[] = [
  {
    id: 'tpl_meeting',
    name: 'Meeting Notes',
    icon: '📝',
    cover: 'grad_warm',
    category: 'Team & Planning',
    description: 'Structured agenda, attendees, key decisions, and action items checklist.',
    blocks: [
      {
        type: 'callout',
        icon: '🗓️',
        color: 'gray',
        content: 'Date: Today · Facilitator: Team Lead · Attendees: Product, Engineering, Design',
      },
      { type: 'toc', content: '' },
      { type: 'h2', content: 'Agenda' },
      { type: 'bullet', content: 'Review sprint milestones and blockers' },
      { type: 'bullet', content: 'Discuss architecture decisions and offline sync UX' },
      { type: 'h2', content: 'Key Decisions' },
      { type: 'quote', content: 'Keep pages fast, distraction-free, and reliable offline.' },
      { type: 'h2', content: 'Action Items' },
      { type: 'todo', checked: false, content: 'Share summary notes with stakeholders' },
      { type: 'todo', checked: false, content: 'Follow up on deployment checklist' },
    ],
  },
  {
    id: 'tpl_prd',
    name: 'Product Spec (PRD)',
    icon: '📐',
    cover: 'arch',
    category: 'Product & Engineering',
    description: 'Problem statement, user stories, technical requirements table, and rollout plan.',
    blocks: [
      {
        type: 'callout',
        icon: '🎯',
        color: 'blue',
        content: 'Status: Draft · Target Release: Q4 · Owner: Product Engineering',
      },
      { type: 'toc', content: '' },
      { type: 'h2', content: '1. Problem Statement' },
      {
        type: 'paragraph',
        content:
          'Describe the user pain point clearly and outline measurable success criteria.',
      },
      { type: 'h2', content: '2. Requirements Matrix' },
      {
        type: 'table',
        hasHeaderRow: true,
        content: '',
        rows: [
          ['Requirement', 'Priority', 'Notes'],
          ['Offline-first local cache', 'P0', 'Persists seamlessly in IndexedDB/localStorage'],
          ['Rich inline text toolbar', 'P0', 'Bold, italic, underline, code, link, color'],
          ['Multi-view database', 'P1', 'Table, Board, List, Calendar, Gallery'],
        ],
      },
      { type: 'h2', content: '3. Open Questions' },
      {
        type: 'toggle',
        open: true,
        content: 'Edge cases to validate before shipping',
        details: 'Check mobile touch targets, dark mode contrast, and offline conflict replay.',
      },
    ],
  },
  {
    id: 'tpl_weekly',
    name: 'Weekly Planner',
    icon: '🗓️',
    cover: 'nordic',
    category: 'Personal Productivity',
    description: 'Top 3 priorities for the week with daily focus checklists.',
    blocks: [
      {
        type: 'callout',
        icon: '✨',
        color: 'yellow',
        content: 'Weekly Intention: Focus on deep work blocks before noon.',
      },
      { type: 'h2', content: 'Top 3 Priorities' },
      { type: 'numbered', content: 'Ship core workspace polish' },
      { type: 'numbered', content: 'Review architecture documentation' },
      { type: 'numbered', content: 'Plan next week sprint' },
      { type: 'divider', content: '' },
      { type: 'h3', content: 'Monday' },
      { type: 'todo', checked: false, content: 'Morning planning & inbox zero' },
      { type: 'h3', content: 'Tuesday' },
      { type: 'todo', checked: false, content: 'Deep build session' },
    ],
  },
  {
    id: 'tpl_runbook',
    name: 'Engineering Runbook',
    icon: '🛠️',
    cover: 'paper',
    category: 'Product & Engineering',
    description: 'Service health checks, rollback commands, and incident response steps.',
    blocks: [
      {
        type: 'callout',
        icon: '⚠️',
        color: 'red',
        content: 'Verify database backup before running schema migrations in production.',
      },
      { type: 'h2', content: 'Health Verification' },
      {
        type: 'code',
        language: 'bash',
        content: 'curl -sf http://localhost:3000/api/health\ndocker compose ps',
      },
      { type: 'h2', content: 'Performance Formula' },
      {
        type: 'equation',
        content: 'Availability = (Total_Time - Downtime) / Total_Time × 100%',
      },
    ],
  },
  {
    id: 'tpl_db_tasks',
    name: 'Project Tracker Database',
    icon: '🗂️',
    cover: 'grad_sage',
    category: 'Databases',
    description: 'Full-page multi-view database ready with Table, Board, List, Calendar & Gallery.',
    isDatabase: true,
    blocks: [],
  },
];
