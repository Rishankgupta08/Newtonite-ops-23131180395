import type { ItemType, Priority, Role, Status } from '../api/types';
import { label } from '../utils';

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge status-badge status-${status}`}>{label(status)}</span>
);

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge priority-badge priority-${priority}`}>{label(priority)}</span>
);

export const TypeBadge = ({ type }: { type: ItemType }) => (
  <span className="badge type-badge">{label(type)}</span>
);

export const RoleBadge = ({ role }: { role: Role }) => (
  <span className={`badge role-badge role-${role}`}>{label(role)}</span>
);
