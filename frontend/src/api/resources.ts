import { api } from './client';
import type {
  ActivityPage,
  ItemFilters,
  ItemPage,
  ItemType,
  Priority,
  Status,
  TeamMember,
  TeamRef,
  User,
  WorkItem,
} from './types';

// ---- auth ----
export const loginRequest = (email: string, password: string) =>
  api.post<{ token: string; user: User }>('/auth/login', { email, password }).then((r) => r.data);

export const fetchMe = () => api.get<User>('/auth/me').then((r) => r.data);

// ---- teams ----
export const fetchTeams = () => api.get<TeamRef[]>('/teams').then((r) => r.data);

export const fetchTeamMembers = (teamId: string) =>
  api.get<TeamMember[]>(`/teams/${teamId}/members`).then((r) => r.data);

// ---- items ----
export const fetchItems = (filters: ItemFilters, cursor?: string, limit = 20) =>
  api
    .get<ItemPage>('/items', { params: { ...filters, cursor, limit } })
    .then((r) => r.data);

export const fetchItem = (id: string) => api.get<WorkItem>(`/items/${id}`).then((r) => r.data);

export interface UpdateItemInput {
  title?: string;
  description?: string;
  type?: ItemType;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export const updateItemRequest = (id: string, clientVersion: number, changes: UpdateItemInput) =>
  api.patch<WorkItem>(`/items/${id}`, { clientVersion, ...changes }).then((r) => r.data);

export const claimItemRequest = (id: string) =>
  api
    .post<WorkItem>(`/items/${id}/claim`, undefined, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    .then((r) => r.data);

export const transitionItemRequest = (id: string, newStatus: Status) =>
  api.post<WorkItem>(`/items/${id}/transition`, { newStatus }).then((r) => r.data);

export const fetchActivity = (id: string, cursor?: string, limit = 15) =>
  api.get<ActivityPage>(`/items/${id}/activity`, { params: { cursor, limit } }).then((r) => r.data);

export const addCommentRequest = (id: string, content: string) =>
  api.post(`/items/${id}/comments`, { content }).then((r) => r.data);
