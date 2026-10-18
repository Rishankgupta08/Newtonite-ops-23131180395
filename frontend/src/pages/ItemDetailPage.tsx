import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorInfo } from '../api/client';
import type { UpdateItemInput } from '../api/resources';
import {
  NEXT_STATUSES,
  PRIORITIES,
  TYPES,
  type ActivityEntry,
  type ItemType,
  type Priority,
  type Status,
  type WorkItem,
} from '../api/types';
import { Avatar } from '../components/Avatar';
import { PriorityBadge, StatusBadge, TypeBadge } from '../components/Badges';
import { Banner, Spinner } from '../components/Feedback';
import { LockIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';
import {
  useActivity,
  useAddComment,
  useClaimItem,
  useItem,
  useTeamMembers,
  useTransitionItem,
  useUpdateItem,
} from '../hooks/useWorkItems';
import { formatDate, formatDateTime, isOverdue, label, toDateInput } from '../utils';

interface EditState {
  baseVersion: number; // version the user was looking at when they opened the form
  base: WorkItem;
  title: string;
  description: string;
  type: ItemType;
  priority: Priority;
  assigneeId: string;
  dueDate: string;
}

const EDIT_FORM_ID = 'item-edit-form';

const STATUS_COLOR: Record<Status, string> = {
  OPEN: 'var(--status-open)',
  IN_PROGRESS: 'var(--status-progress)',
  AWAITING_APPROVAL: 'var(--status-awaiting)',
  RESOLVED: 'var(--status-resolved)',
  CLOSED: 'var(--status-closed)',
};

export default function ItemDetailPage() {
  const { id = '' } = useParams();
  const { roleInTeam } = useAuth();
  const itemQuery = useItem(id);
  const item = itemQuery.data;

  const claim = useClaimItem(id);
  const update = useUpdateItem(id);
  const transition = useTransitionItem(id);

  const [conflict, setConflict] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);

  const members = useTeamMembers(edit ? item?.teamId : undefined);

  if (itemQuery.isLoading) return <Spinner />;
  if (itemQuery.isError || !item) {
    const info = getErrorInfo(itemQuery.error);
    return (
      <div className="card detail-error">
        <h2>Can't open this item</h2>
        <p>{info.message}</p>
        <Link to="/items">← Back to work items</Link>
      </div>
    );
  }

  const role = roleInTeam(item.teamId);
  const canWrite = role === 'MEMBER' || role === 'LEAD' || role === 'ADMIN';
  const canApprove = role === 'LEAD' || role === 'ADMIN';
  const canClaim = item.assigneeId === null && canWrite;
  const nextStatuses = NEXT_STATUSES[item.status];
  const overdue = isOverdue(item);

  // ---------- handlers ----------
  const onClaim = () => {
    setClaimError(null);
    setActionError(null);
    claim.mutate(undefined, {
      onError: (err) => {
        const info = getErrorInfo(err);
        setClaimError(
          info.code === 'ALREADY_CLAIMED' ? '❌ Someone else just claimed this item.' : `❌ ${info.message}`
        );
      },
    });
  };

  const onTransition = (nextStatus: Status) => {
    setActionError(null);
    setPendingStatus(nextStatus);
    transition.mutate(nextStatus, {
      onSettled: () => setPendingStatus(null),
      onError: (err) => setActionError(getErrorInfo(err).message),
    });
  };

  const openEdit = () => {
    setConflict(false);
    setActionError(null);
    setEdit({
      baseVersion: item.version,
      base: item,
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      assigneeId: item.assigneeId ?? '',
      dueDate: toDateInput(item.dueDate),
    });
  };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const b = edit.base;
    const changes: UpdateItemInput = {};
    if (edit.title.trim() !== b.title) changes.title = edit.title.trim();
    if (edit.description.trim() !== b.description) changes.description = edit.description.trim();
    if (edit.type !== b.type) changes.type = edit.type;
    if (edit.priority !== b.priority) changes.priority = edit.priority;
    if (edit.assigneeId !== (b.assigneeId ?? '')) changes.assigneeId = edit.assigneeId || null;
    if (edit.dueDate !== toDateInput(b.dueDate))
      changes.dueDate = edit.dueDate ? new Date(edit.dueDate).toISOString() : null;
    if (Object.keys(changes).length === 0) return setEdit(null);

    const m = members.data?.find((x) => x.userId === edit.assigneeId);
    const assignee =
      'assigneeId' in changes
        ? m
          ? { id: m.userId, name: m.userName, email: m.userEmail }
          : null
        : undefined;

    setConflict(false);
    setActionError(null);
    update.mutate(
      { version: edit.baseVersion, changes, assignee }, // version is sent automatically
      {
        onSuccess: () => setEdit(null),
        onError: (err) => {
          const info = getErrorInfo(err);
          if (info.status === 409) {
            setConflict(true); // cache already replaced with the server's latest copy
            setEdit(null);
          } else {
            setActionError(info.message);
          }
        },
      }
    );
  };

  return (
    <div>
      {(conflict || claimError || actionError) && (
        <div className="detail-alerts">
          {conflict && (
            <Banner tone="warning" onDismiss={() => setConflict(false)}>
              ⚠️ This item was changed by someone else. Showing latest version.
            </Banner>
          )}
          {claimError && (
            <Banner tone="error" onDismiss={() => setClaimError(null)}>
              {claimError}
            </Banner>
          )}
          {actionError && (
            <Banner tone="error" onDismiss={() => setActionError(null)}>
              {actionError}
            </Banner>
          )}
        </div>
      )}

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/items">Work Items</Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{item.title}</span>
      </nav>

      <div className="detail-layout">
        {/* ---------------- LEFT: content ---------------- */}
        <div>
          {edit ? (
            <input
              id="edit-title"
              form={EDIT_FORM_ID}
              className="panel-input detail-title"
              style={{ fontSize: '1.25rem', padding: '8px 12px' }}
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              required
            />
          ) : (
            <h1 className="detail-title">{item.title}</h1>
          )}

          <div className="detail-meta">
            <TypeBadge type={item.type} />
            <PriorityBadge priority={item.priority} />
            <StatusBadge status={item.status} />
          </div>

          <div className="section-label">Description</div>
          {edit ? (
            <textarea
              id="edit-description"
              form={EDIT_FORM_ID}
              className="panel-input"
              rows={6}
              value={edit.description}
              onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              required
            />
          ) : (
            <div className="detail-description">{item.description}</div>
          )}

          <Timeline itemId={id} canComment={canWrite} />
        </div>

        {/* ---------------- RIGHT: details + workflow ---------------- */}
        <aside>
          <section className="panel-card" id="item-details">
            <div className="panel-head">
              <span>Details</span>
              {canWrite && !edit && (
                <button id="edit-btn" className="panel-link" onClick={openEdit}>
                  Edit details
                </button>
              )}
            </div>

            {edit ? (
              <form id={EDIT_FORM_ID} className="panel-body" onSubmit={onSave}>
                <div className="detail-row">
                  <label className="detail-row-label" htmlFor="edit-priority">
                    Priority
                  </label>
                  <select
                    id="edit-priority"
                    className="panel-input"
                    value={edit.priority}
                    onChange={(e) => setEdit({ ...edit, priority: e.target.value as Priority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {label(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Status</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="detail-row">
                  <label className="detail-row-label" htmlFor="edit-type">
                    Type
                  </label>
                  <select
                    id="edit-type"
                    className="panel-input"
                    value={edit.type}
                    onChange={(e) => setEdit({ ...edit, type: e.target.value as ItemType })}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Team</span>
                  <span className="detail-row-value">{item.team.name}</span>
                </div>
                <div className="detail-row">
                  <label className="detail-row-label" htmlFor="edit-assignee">
                    Assignee
                  </label>
                  <select
                    id="edit-assignee"
                    className="panel-input"
                    value={edit.assigneeId}
                    onChange={(e) => setEdit({ ...edit, assigneeId: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.data
                      ?.filter((m) => m.role !== 'VIEWER' || m.userId === item.assigneeId)
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.userName} ({label(m.role)})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Created by</span>
                  <span className="detail-row-value">{item.createdBy.name}</span>
                </div>
                <div className="detail-row">
                  <label className="detail-row-label" htmlFor="edit-due">
                    Due Date
                  </label>
                  <input
                    id="edit-due"
                    type="date"
                    className="panel-input"
                    value={edit.dueDate}
                    onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })}
                  />
                </div>
                <p className="panel-hint">
                  Editing version {edit.baseVersion} — the server rejects the save if someone changed it
                  meanwhile.
                </p>
                <div className="panel-actions">
                  <button id="save-edit" type="submit" className="btn-primary" disabled={update.isPending}>
                    {update.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setEdit(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="panel-body">
                <DetailRow label="Priority">
                  <PriorityBadge priority={item.priority} />
                </DetailRow>
                <DetailRow label="Status">
                  <StatusBadge status={item.status} />
                </DetailRow>
                <DetailRow label="Type">{label(item.type)}</DetailRow>
                <DetailRow label="Team">{item.team.name}</DetailRow>
                <DetailRow label="Assignee" id="assignee-value">
                  {item.assignee ? (
                    <span className="detail-row-person">
                      <Avatar name={item.assignee.name} size={22} />
                      {item.assignee.name}
                    </span>
                  ) : (
                    <span className="cell-dash">Unassigned</span>
                  )}
                </DetailRow>
                <DetailRow label="Created by">
                  <span className="detail-row-person">
                    <Avatar name={item.createdBy.name} size={22} />
                    {item.createdBy.name}
                  </span>
                </DetailRow>
                <DetailRow label="Due Date" className={overdue ? 'overdue' : item.dueDate ? '' : 'muted'}>
                  {formatDate(item.dueDate)}
                  {overdue && ' · overdue'}
                </DetailRow>
                <DetailRow label="Version">
                  v{item.version}
                  <span className="cell-dash"> · updated {formatDateTime(item.updatedAt)}</span>
                </DetailRow>
              </div>
            )}
          </section>

          <section className="panel-card" id="item-workflow">
            <div className="panel-head">
              <span>Workflow</span>
            </div>
            <div className="workflow-body">
              <div className="workflow-current">
                <span className="workflow-current-label">Current</span>
                <StatusBadge status={item.status} />
              </div>

              {!canWrite ? (
                <p className="wf-note">
                  You have read-only access ({label(role ?? 'none')}) to this team.
                </p>
              ) : nextStatuses.length === 0 ? (
                <p className="wf-note">This item is closed. No further transitions.</p>
              ) : (
                <>
                  <div className="workflow-label">Transition to:</div>
                  <div className="workflow-buttons">
                    {nextStatuses.map((s) => {
                      const locked = item.status === 'AWAITING_APPROVAL' && s === 'RESOLVED' && !canApprove;
                      return (
                        <span
                          key={s}
                          className="wf-tooltip-wrap"
                          data-tip={locked ? 'Only team Leads can approve' : undefined}
                        >
                          <button
                            id={`transition-${s}`}
                            className="wf-btn"
                            style={{ ['--wf-color' as string]: STATUS_COLOR[s] }}
                            disabled={locked || transition.isPending}
                            onClick={() => onTransition(s)}
                          >
                            {locked && <LockIcon />}
                            {pendingStatus === s ? 'Updating…' : label(s)}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  {item.status === 'AWAITING_APPROVAL' && (
                    <div className="wf-lock-note">
                      <LockIcon />
                      {canApprove ? 'Lead approval — you can approve this item' : 'Lead approval required'}
                    </div>
                  )}
                </>
              )}

              {canClaim && (
                <button id="claim-btn" className="claim-btn" onClick={onClaim} disabled={claim.isPending}>
                  {claim.isPending ? 'Claiming…' : '✋ Claim this item'}
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DetailRow({
  label: text,
  children,
  className = '',
  id,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className="detail-row">
      <span className="detail-row-label">{text}</span>
      <div className={`detail-row-value ${className}`} id={id}>
        {children}
      </div>
    </div>
  );
}

// ---------------- activity timeline ----------------

function EventText({ e }: { e: Extract<ActivityEntry, { kind: 'event' }> }) {
  switch (e.eventType) {
    case 'CREATED':
      return <span>created this item</span>;
    case 'CLAIMED':
      return <span>claimed this item</span>;
    case 'STATUS_CHANGED':
      return (
        <>
          <span>changed status from</span>
          {e.fromValue ? <StatusBadge status={e.fromValue as Status} /> : <span>?</span>}
          <span>to</span>
          {e.toValue ? <StatusBadge status={e.toValue as Status} /> : <span>?</span>}
        </>
      );
    case 'PRIORITY_CHANGED':
      return (
        <>
          <span>changed priority from</span>
          {e.fromValue ? <PriorityBadge priority={e.fromValue as Priority} /> : <span>?</span>}
          <span>to</span>
          {e.toValue ? <PriorityBadge priority={e.toValue as Priority} /> : <span>?</span>}
        </>
      );
    case 'ASSIGNEE_CHANGED':
      return <span>{e.toValue ? 'changed the assignee' : 'unassigned this item'}</span>;
    case 'UPDATED':
      return <span>edited details</span>;
    default:
      return <span>{label(e.eventType).toLowerCase()}</span>;
  }
}

function Timeline({ itemId, canComment }: { itemId: string; canComment: boolean }) {
  const { user } = useAuth();
  const activity = useActivity(itemId);
  const addComment = useAddComment(itemId);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const entries = (activity.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (e) => !(e.kind === 'event' && e.eventType === 'COMMENT_ADDED') // comments render as their own entries
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment.mutate(text.trim(), { onSuccess: () => setText('') });
  };

  return (
    <section className="activity-section" id="activity">
      <div className="activity-head">
        <h2 className="activity-title">Activity &amp; comments</h2>
        {canComment && (
          <button
            id="comment-focus-btn"
            className="btn-outline btn-sm accent-hover"
            onClick={() => inputRef.current?.focus()}
          >
            Comment
          </button>
        )}
      </div>

      {canComment && (
        <form className="comment-compose" onSubmit={submit}>
          <Avatar name={user?.name} size={28} />
          <div className="comment-compose-body">
            <textarea
              id="comment-input"
              ref={inputRef}
              className="comment-textarea"
              placeholder="Add a comment…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
            <div className="comment-actions">
              <button
                id="comment-submit"
                type="submit"
                className="btn-primary btn-sm"
                disabled={!text.trim() || addComment.isPending}
              >
                {addComment.isPending ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </div>
        </form>
      )}

      {activity.isLoading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <p className="empty-state">No activity yet.</p>
      ) : (
        <ol className="activity-list">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="activity-entry">
              <Avatar name={e.user.name} size={24} />
              <div className="activity-entry-body">
                <div className="activity-line">
                  <span className="activity-user">{e.user.name}</span>
                  {e.kind === 'event' ? <EventText e={e} /> : <span>commented</span>}
                  <span className="activity-time">· {formatDateTime(e.createdAt)}</span>
                </div>
                {e.kind === 'comment' && <div className="activity-comment">{e.content}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {activity.hasNextPage && (
        <button
          className="load-more-btn"
          onClick={() => activity.fetchNextPage()}
          disabled={activity.isFetchingNextPage}
        >
          {activity.isFetchingNextPage ? 'Loading…' : 'Load older activity'}
        </button>
      )}
    </section>
  );
}
