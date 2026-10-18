import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  addCommentRequest,
  claimItemRequest,
  fetchActivity,
  fetchItem,
  fetchItems,
  fetchTeamMembers,
  fetchTeams,
  transitionItemRequest,
  updateItemRequest,
  type UpdateItemInput,
} from '../api/resources';
import { getErrorInfo } from '../api/client';
import type { ItemFilters, PersonRef, Status, WorkItem } from '../api/types';
import { useAuth } from './useAuth';

// ---------- query keys ----------
export const itemKeys = {
  all: ['items'] as const,
  lists: () => ['items', 'list'] as const,
  list: (filters: ItemFilters, limit?: number) => ['items', 'list', filters, limit] as const,
  infinite: (filters: ItemFilters) => ['items', 'list', 'infinite', filters] as const,
  detail: (id: string) => ['items', 'detail', id] as const,
  activity: (id: string) => ['items', 'activity', id] as const,
};

// ---------- queries ----------

/** Single page (used by dashboard widgets: first N items only). */
export function useItemsList(filters: ItemFilters, limit = 5, enabled = true) {
  return useQuery({
    queryKey: itemKeys.list(filters, limit),
    queryFn: () => fetchItems(filters, undefined, limit),
    enabled,
  });
}

/** Cursor-paginated list. Never loads everything: each page asks the server for the next cursor. */
export function useInfiniteItems(filters: ItemFilters) {
  return useInfiniteQuery({
    queryKey: itemKeys.infinite(filters),
    queryFn: ({ pageParam }) => fetchItems(filters, pageParam, 20),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useItem(id: string) {
  return useQuery({ queryKey: itemKeys.detail(id), queryFn: () => fetchItem(id) });
}

export function useActivity(id: string) {
  return useInfiniteQuery({
    queryKey: itemKeys.activity(id),
    queryFn: ({ pageParam }) => fetchActivity(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: fetchTeams, staleTime: 5 * 60_000 });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: () => fetchTeamMembers(teamId!),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });
}

// ---------- optimistic mutation plumbing ----------

interface OptimisticContext {
  previous?: WorkItem;
}

function refreshItem(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: itemKeys.detail(id) });
  qc.invalidateQueries({ queryKey: itemKeys.activity(id) });
  qc.invalidateQueries({ queryKey: itemKeys.lists() });
}

/**
 * Shared onMutate / onError / onSettled wiring:
 *  - onMutate: cancel in-flight fetches, snapshot the cache, apply the optimistic change
 *  - onError:  roll back to the snapshot (or to the server's latest copy on a 409)
 *  - onSettled: refetch so the cache converges on server truth
 */
function useOptimisticItemMutation<TVars>(
  id: string,
  mutationFn: (vars: TVars) => Promise<WorkItem>,
  optimistic: (item: WorkItem, vars: TVars) => WorkItem
) {
  const qc = useQueryClient();
  return useMutation<WorkItem, unknown, TVars, OptimisticContext>({
    mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: itemKeys.detail(id) });
      const previous = qc.getQueryData<WorkItem>(itemKeys.detail(id));
      if (previous) qc.setQueryData(itemKeys.detail(id), optimistic(previous, vars));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      const info = getErrorInfo(err);
      if (info.status === 409 && info.currentItem) {
        qc.setQueryData(itemKeys.detail(id), info.currentItem); // show latest server version
      } else if (ctx?.previous) {
        qc.setQueryData(itemKeys.detail(id), ctx.previous); // roll back
      }
    },
    onSuccess: (serverItem) => {
      qc.setQueryData(itemKeys.detail(id), (old: WorkItem | undefined) =>
        old ? { ...old, ...serverItem } : serverItem
      );
    },
    onSettled: () => refreshItem(qc, id),
  });
}

export function useClaimItem(id: string) {
  const { user } = useAuth();
  return useOptimisticItemMutation<void>(
    id,
    () => claimItemRequest(id),
    (item) => ({
      ...item,
      assigneeId: user!.id,
      assignee: { id: user!.id, name: user!.name, email: user!.email },
      status: 'IN_PROGRESS',
    })
  );
}

export interface UpdateVars {
  /** version the user was looking at when they started editing */
  version: number;
  changes: UpdateItemInput;
  /** resolved assignee for the optimistic render */
  assignee?: PersonRef | null;
}

export function useUpdateItem(id: string) {
  return useOptimisticItemMutation<UpdateVars>(
    id,
    ({ version, changes }) => updateItemRequest(id, version, changes),
    (item, { changes, assignee }) => ({
      ...item,
      ...changes,
      ...(assignee !== undefined ? { assignee } : {}),
    })
  );
}

export function useTransitionItem(id: string) {
  return useOptimisticItemMutation<Status>(
    id,
    (newStatus) => transitionItemRequest(id, newStatus),
    (item, newStatus) => ({ ...item, status: newStatus })
  );
}

export function useAddComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => addCommentRequest(id, content),
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.activity(id) }),
  });
}
