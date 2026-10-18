import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PRIORITIES,
  STATUSES,
  TYPES,
  type ItemFilters,
  type ItemType,
  type Priority,
  type Status,
} from '../api/types';
import { Spinner } from '../components/Feedback';
import { DownloadIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { ItemsTable } from '../components/ItemRow';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { useInfiniteItems, useTeams } from '../hooks/useWorkItems';
import { label } from '../utils';

export default function ItemListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const teams = useTeams();

  const filters: ItemFilters = {
    status: (params.get('status') as Status) || undefined,
    priority: (params.get('priority') as Priority) || undefined,
    type: (params.get('type') as ItemType) || undefined,
    teamId: params.get('teamId') || undefined,
    assigneeId: params.get('assigneeId') || undefined,
    q: params.get('q') || undefined,
  };

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  // Search input debounced 300ms
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search, 300);
  useEffect(() => {
    if (debounced.trim() !== (params.get('q') ?? '')) {
      setParam('q', debounced.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = useInfiniteItems(filters);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  const hasFilters = Object.values(filters).some(Boolean);
  const assigneeChip =
    filters.assigneeId === 'null'
      ? 'Unassigned'
      : filters.assigneeId === user?.id
        ? 'Assigned to me'
        : filters.assigneeId
          ? 'Specific assignee'
          : null;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Work Items</h1>
        <div className="page-actions">
          <button id="export-btn" className="btn-outline" title="Export (coming soon)">
            <DownloadIcon />
            Export
          </button>
          <button id="list-new-item" className="btn-primary" onClick={() => navigate('/items')}>
            <PlusIcon />
            New Work Item
          </button>
        </div>
      </div>

      <div className="filter-row">
        <div className="search-box filter-search">
          <span className="search-box-icon">
            <SearchIcon />
          </span>
          <input
            id="filter-search"
            className="search-input"
            placeholder="Search work items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          id="filter-priority"
          className={`filter-select${filters.priority ? ' has-value' : ''}`}
          value={filters.priority ?? ''}
          onChange={(e) => setParam('priority', e.target.value)}
        >
          <option value="">Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>

        <select
          id="filter-status"
          className={`filter-select${filters.status ? ' has-value' : ''}`}
          value={filters.status ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>

        <select
          id="filter-type"
          className={`filter-select${filters.type ? ' has-value' : ''}`}
          value={filters.type ?? ''}
          onChange={(e) => setParam('type', e.target.value)}
        >
          <option value="">Type</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>

        <select
          id="filter-team"
          className={`filter-select${filters.teamId ? ' has-value' : ''}`}
          value={filters.teamId ?? ''}
          onChange={(e) => setParam('teamId', e.target.value)}
        >
          <option value="">Filters: Team</option>
          {teams.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {assigneeChip && (
          <button
            className="filter-chip"
            onClick={() => setParam('assigneeId', '')}
            title="Clear assignee filter"
          >
            {assigneeChip} ×
          </button>
        )}

        {hasFilters && (
          <button
            id="filter-clear"
            className="filter-clear"
            onClick={() => {
              setSearch('');
              setParams({}, { replace: true });
            }}
          >
            Clear all
          </button>
        )}

        <span className="filter-count">
          {query.isLoading
            ? 'Loading…'
            : `Showing ${items.length.toLocaleString()} of ${total.toLocaleString()} items`}
        </span>
      </div>

      {query.isLoading ? (
        <div className="items-table">
          <Spinner />
        </div>
      ) : (
        <>
          <ItemsTable
            items={query.isError ? [] : items}
            empty={query.isError ? "Couldn't load items." : 'No items match these filters.'}
          />

          {items.length > 0 &&
            (query.hasNextPage ? (
              <button
                id="load-more"
                className="load-more-btn"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            ) : (
              <div className="load-more-end">End of results · {items.length} items shown</div>
            ))}
        </>
      )}
    </div>
  );
}
