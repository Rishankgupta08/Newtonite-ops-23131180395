import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchItems } from '../api/resources';
import type { ItemFilters, Priority, WorkItem } from '../api/types';
import { Spinner } from '../components/Feedback';
import { PlusIcon } from '../components/Icons';
import { ItemsTable } from '../components/ItemRow';
import { useAuth } from '../hooks/useAuth';
import { itemKeys, useItemsList } from '../hooks/useWorkItems';

const MAX = 5;

type Tab = 'all' | 'urgent' | 'unassigned' | 'review';
const TABS: Array<[Tab, string]> = [
  ['all', 'All Items'],
  ['urgent', 'Urgent'],
  ['unassigned', 'Unassigned'],
  ['review', 'Pending Review'],
];

const PRIORITY_WEIGHT: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');

  const mine: ItemFilters = { assigneeId: user!.id };
  const urgent: ItemFilters = { assigneeId: 'null', priority: 'CRITICAL', status: 'OPEN' };

  const assigned = useItemsList(mine, MAX);
  const unassigned = useItemsList(urgent, MAX);

  // "Awaiting my approval": only teams where I'm LEAD/ADMIN
  const approverTeams = user!.memberships.filter((m) => m.role === 'LEAD' || m.role === 'ADMIN');
  const isApprover = approverTeams.length > 0;
  const approvals = useQueries({
    queries: approverTeams.map((t) => {
      const filters: ItemFilters = { status: 'AWAITING_APPROVAL', teamId: t.teamId };
      return {
        queryKey: itemKeys.list(filters, MAX),
        queryFn: () => fetchItems(filters, undefined, MAX),
      };
    }),
  });
  const approvalTotal = approvals.reduce((n, q) => n + (q.data?.total ?? 0), 0);

  // "Total active" items query (non-closed)
  const activeItemsQuery = useQuery({
    queryKey: ['items', 'total-active'],
    queryFn: async () => {
      const [all, closed] = await Promise.all([
        fetchItems({}, undefined, 1),
        fetchItems({ status: 'CLOSED' }, undefined, 1),
      ]);
      return Math.max(0, (all.total ?? 0) - (closed.total ?? 0));
    },
    staleTime: 30_000,
  });

  // Count-only reads (limit 1) for the stat cards — totals come from the server, nothing is loaded in bulk.
  const countsQuery = useQuery({
    queryKey: ['items', 'dashboard-counts'],
    queryFn: async () => {
      const [all, resolved, closed] = await Promise.all([
        fetchItems({}, undefined, 1),
        fetchItems({ status: 'RESOLVED' }, undefined, 1),
        fetchItems({ status: 'CLOSED' }, undefined, 1),
      ]);
      return {
        total: all.total ?? 0,
        unresolved: Math.max(0, (all.total ?? 0) - (resolved.total ?? 0) - (closed.total ?? 0)),
      };
    },
    staleTime: 30_000,
  });

  // Merge everything already fetched into one "needs attention" list (deduped, most urgent first).
  const attention = useMemo(() => {
    const seen = new Map<string, WorkItem>();
    const all = [
      ...(assigned.data?.items ?? []),
      ...(unassigned.data?.items ?? []),
      ...approvals.flatMap((q) => q.data?.items ?? []),
    ];
    for (const it of all) if (!seen.has(it.id)) seen.set(it.id, it);
    return [...seen.values()].sort(
      (a, b) =>
        PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || b.createdAt.localeCompare(a.createdAt)
    );
  }, [assigned.data, unassigned.data, approvals]);

  const visible = attention
    .filter((it) => {
      if (tab === 'urgent') return it.priority === 'CRITICAL' || it.priority === 'HIGH';
      if (tab === 'unassigned') return it.assigneeId === null;
      if (tab === 'review') return it.status === 'AWAITING_APPROVAL';
      return true;
    })
    .slice(0, MAX);

  const loading = assigned.isLoading || unassigned.isLoading || approvals.some((q) => q.isLoading);
  const failed = assigned.isError && unassigned.isError;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user!.name.split(' ')[0];
  const num = (v: number | undefined, isLoading: boolean) => (isLoading ? '…' : (v ?? 0).toLocaleString());

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {greeting}, {firstName}
          </h1>
          <p className="page-subtitle">Here's what needs your attention.</p>
        </div>
        <button id="dashboard-new-item" className="btn-primary" onClick={() => navigate('/items')}>
          <PlusIcon />
          New Work Item
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card" id="stat-assigned">
          <div className="stat-number red">{num(assigned.data?.total, assigned.isLoading)}</div>
          <div className="stat-label">Items assigned to me</div>
        </div>
        <div className="stat-card" id="stat-unresolved">
          <div className="stat-number">{num(countsQuery.data?.unresolved, countsQuery.isLoading)}</div>
          <div className="stat-label">Unresolved items</div>
        </div>
        <div className="stat-card" id="stat-approval">
          {isApprover ? (
            <>
              <div className="stat-number">
                {num(approvalTotal, approvals.some((q) => q.isLoading))}
              </div>
              <div className="stat-label">Awaiting approval</div>
            </>
          ) : (
            <>
              <div className="stat-number">{num(activeItemsQuery.data, activeItemsQuery.isLoading)}</div>
              <div className="stat-label">Total active</div>
            </>
          )}
        </div>
        <div className="stat-card" id="stat-total">
          <div className="stat-number">{num(countsQuery.data?.total, countsQuery.isLoading)}</div>
          <div className="stat-label">Total work items</div>
        </div>
      </div>

      <section id="needs-attention">
        <div className="attention-head">
          <h2 className="attention-title">Needs your attention</h2>
          <div className="tab-group" role="tablist">
            {TABS.map(([key, text]) => (
              <button
                key={key}
                id={`tab-${key}`}
                role="tab"
                aria-selected={tab === key}
                className={`tab-pill${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="items-table">
            <Spinner />
          </div>
        ) : (
          <ItemsTable
            items={failed ? [] : visible}
            empty={failed ? "Couldn't load your items." : 'Nothing here — you’re all caught up 🎉'}
            footer={
              <Link to="/items" className="table-footer-link" id="view-all-items">
                View all work items →
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
