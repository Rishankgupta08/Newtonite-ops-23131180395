export type Role = 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ItemType = 'INCIDENT' | 'CUSTOMER_ISSUE' | 'PAYMENT' | 'COMPLIANCE' | 'TASK';

export const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'];
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TYPES: ItemType[] = ['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK'];

/** Mirrors the server's workflow map (server remains the source of truth). */
export const NEXT_STATUSES: Record<Status, Status[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'OPEN'],
  AWAITING_APPROVAL: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export interface Membership {
  teamId: string;
  teamName: string;
  role: Role;
}

export interface User {
  id: string;
  name: string;
  email: string;
  memberships: Membership[];
}

export interface PersonRef {
  id: string;
  name: string;
  email: string;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: ItemType;
  priority: Priority;
  status: Status;
  teamId: string;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  assignee: PersonRef | null;
  createdBy: PersonRef;
  team: { id: string; name: string };
}

export interface ItemFilters {
  status?: Status;
  priority?: Priority;
  type?: ItemType;
  teamId?: string;
  assigneeId?: string; // user id or the literal "null" for unassigned
  q?: string;
}

export interface ItemPage {
  items: WorkItem[];
  nextCursor: string | null;
  total: number;
}

export type ActivityEntry =
  | {
      kind: 'event';
      id: string;
      eventType: string;
      fromValue: string | null;
      toValue: string | null;
      createdAt: string;
      user: { id: string; name: string };
    }
  | {
      kind: 'comment';
      id: string;
      content: string;
      createdAt: string;
      user: { id: string; name: string };
    };

export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null;
}

export interface TeamRef {
  id: string;
  name: string;
  role: Role;
}

export interface TeamMember {
  userId: string;
  userName: string;
  userEmail: string;
  role: Role;
}
