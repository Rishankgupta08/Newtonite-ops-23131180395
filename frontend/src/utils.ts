import type { WorkItem } from './api/types';

export const label = (s: string) =>
  s
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const isOverdue = (item: Pick<WorkItem, 'dueDate' | 'status'>) =>
  !!item.dueDate &&
  item.status !== 'RESOLVED' &&
  item.status !== 'CLOSED' &&
  new Date(item.dueDate).getTime() < Date.now();

/** yyyy-mm-dd for <input type="date"> */
export const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
