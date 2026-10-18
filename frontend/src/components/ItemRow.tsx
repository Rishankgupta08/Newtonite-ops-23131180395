import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkItem } from '../api/types';
import { formatDate, isOverdue } from '../utils';
import { Avatar } from './Avatar';
import { PriorityBadge, StatusBadge, TypeBadge } from './Badges';

export function ItemsTableHeader() {
  return (
    <div className="items-row items-head" role="row">
      <span>Title</span>
      <span>Type</span>
      <span>Priority</span>
      <span>Status</span>
      <span>Assigned to</span>
      <span>Due</span>
    </div>
  );
}

export function ItemTableRow({ item }: { item: WorkItem }) {
  const navigate = useNavigate();
  const overdue = isOverdue(item);
  const open = () => navigate(`/items/${item.id}`);

  return (
    <div
      className="items-row items-data"
      role="row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div>
        <div className="cell-title" title={item.title}>
          {item.title}
        </div>
        <div className="cell-team">{item.team?.name ?? '—'}</div>
      </div>
      <div>
        <TypeBadge type={item.type} />
      </div>
      <div>
        <PriorityBadge priority={item.priority} />
      </div>
      <div>
        <StatusBadge status={item.status} />
      </div>
      <div>
        {item.assignee ? (
          <span className="cell-assignee">
            <Avatar name={item.assignee.name} size={22} />
            <span className="cell-assignee-name">{item.assignee.name}</span>
          </span>
        ) : (
          <span className="cell-dash">—</span>
        )}
      </div>
      <div>
        {item.dueDate ? (
          <span className={`cell-due${overdue ? ' overdue' : ''}`} title={overdue ? 'Overdue' : undefined}>
            {formatDate(item.dueDate)}
          </span>
        ) : (
          <span className="cell-dash">—</span>
        )}
      </div>
    </div>
  );
}

/** Table container; pass a footer (e.g. "View all") if needed. */
export function ItemsTable({
  items,
  empty,
  footer,
}: {
  items: WorkItem[];
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="items-table">
      <div className="items-table-scroll">
        <div className="items-table-inner" role="table">
          <ItemsTableHeader />
          {items.length === 0 ? (
            <div className="empty-state">{empty ?? 'No items.'}</div>
          ) : (
            items.map((item) => <ItemTableRow key={item.id} item={item} />)
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}
