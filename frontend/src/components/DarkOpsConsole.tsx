import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const now = () => new Date().toTimeString().slice(0, 8); // HH:MM:SS

const SERVICES: Array<[string, string]> = [
  ['backend ...........', '✓ online'],
  ['database ..........', '✓ connected'],
  ['outbox worker .....', '✓ running'],
  ['auth ..............', '✓ active'],
];

export function DarkOpsConsole() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(now);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const email = user?.email ?? 'unauthenticated';
  const role = user?.memberships?.[0]?.role ?? 'GUEST';

  return (
    <div ref={rootRef}>
      {open && (
        <div className="ops-console" role="dialog" aria-label="Dark Ops Console">
          <div className="ops-console-head">
            <span className="ops-dot" style={{ background: '#dc2626' }} />
            <span className="ops-dot" style={{ background: '#f59e0b' }} />
            <span className="ops-dot" style={{ background: '#22c55e' }} />
            <span className="ops-console-title">Dark Ops Console</span>
          </div>

          <div className="ops-console-body">
            <div>
              <span className="ops-ts">[{time}]</span> <span className="ops-prompt">$</span>{' '}
              <span className="ops-cmd">system status</span>
            </div>
            {SERVICES.map(([name, state]) => (
              <div key={name}>
                &gt; <span className="ops-label">{name}</span> <span className="ops-ok">{state}</span>
              </div>
            ))}

            <div className="ops-gap">
              <span className="ops-ts">[{time}]</span> <span className="ops-prompt">$</span>{' '}
              <span className="ops-cmd">session info</span>
            </div>
            <div>
              &gt; <span className="ops-label">user:</span> <span className="ops-val">{email}</span>
            </div>
            <div>
              &gt; <span className="ops-label">role:</span> <span className="ops-val">{role}</span>
            </div>
            <div>
              &gt; <span className="ops-label">session:</span> <span className="ops-ok">active</span>
            </div>

            <div className="ops-gap">
              <span className="ops-ts">[{time}]</span> <span className="ops-prompt">$</span>{' '}
              <span className="ops-cursor">▋</span>
            </div>
          </div>
        </div>
      )}

      <button
        id="ops-console-toggle"
        className={`ops-console-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle Dark Ops Console"
        aria-expanded={open}
        title="Dark Ops Console"
      >
        &gt;
      </button>
    </div>
  );
}
