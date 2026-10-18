import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Membership } from '../api/types';
import { LogOutIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Full access • Can manage team',
  LEAD: 'Can approve • Manage items',
  MEMBER: 'Create & edit items',
  VIEWER: 'Read-only access',
};

function getHighestRole(memberships?: Membership[]): string {
  if (!memberships || memberships.length === 0) return 'Viewer';
  const roles = memberships.map((m) => m.role);
  if (roles.includes('ADMIN')) return 'Admin';
  if (roles.includes('LEAD')) return 'Lead';
  if (roles.includes('MEMBER')) return 'Member';
  return 'Viewer';
}

function getRoleBadgeStyle(role: string): React.CSSProperties {
  switch (role) {
    case 'ADMIN':
      return {
        background: 'rgba(220,38,38,0.12)',
        color: '#dc2626',
        border: '1px solid rgba(220,38,38,0.2)',
      };
    case 'LEAD':
      return {
        background: 'rgba(249,115,22,0.12)',
        color: '#f97316',
        border: '1px solid rgba(249,115,22,0.2)',
      };
    case 'MEMBER':
      return {
        background: 'rgba(255,255,255,0.06)',
        color: '#f0f0f0',
        border: '1px solid rgba(255,255,255,0.1)',
      };
    case 'VIEWER':
    default:
      return {
        background: '#1a1a1a',
        color: '#888888',
        border: '1px solid #2a2a2a',
      };
  }
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [signoutHover, setSignoutHover] = useState(false);

  if (!user) return null;

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  const accountIdShort = user.id ? `${user.id.slice(0, 8)}...` : '—';
  const highestRole = getHighestRole(user.memberships);
  const teamsCount = user.memberships?.length ?? 0;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* ================= HERO SECTION ================= */}
      <section
        style={{
          background: '#161616',
          border: '1px solid #1f1f1f',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decoration inside hero card */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(220,38,38,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Content row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* LEFT: Avatar */}
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)',
              border: '3px solid rgba(220,38,38,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              fontWeight: 800,
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            {user.name?.[0]?.toUpperCase() ?? 'U'}
          </div>

          {/* RIGHT */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                color: '#ffffff',
                fontSize: '22px',
                fontWeight: 700,
                marginBottom: '4px',
                lineHeight: 1.3,
              }}
            >
              {user.name}
            </h1>
            <p
              style={{
                color: '#888888',
                fontSize: '14px',
                marginBottom: '12px',
              }}
            >
              {user.email}
            </p>

            {/* Row of role badges (one per membership) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {user.memberships && user.memberships.length > 0 ? (
                user.memberships.map((m) => (
                  <span
                    key={m.teamId}
                    style={{
                      background: 'rgba(220,38,38,0.1)',
                      color: '#dc2626',
                      border: '1px solid rgba(220,38,38,0.2)',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginRight: '6px',
                    }}
                  >
                    {m.role} · {m.teamName}
                  </span>
                ))
              ) : (
                <span
                  style={{
                    background: 'rgba(220,38,38,0.1)',
                    color: '#dc2626',
                    border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Member
                </span>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM of hero card: Stats row */}
        <div
          style={{
            borderTop: '1px solid #1f1f1f',
            marginTop: '24px',
            paddingTop: '20px',
            display: 'flex',
            gap: '40px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700 }}>
              {teamsCount}
            </div>
            <div style={{ color: '#666666', fontSize: '12px', marginTop: '2px' }}>
              Teams joined
            </div>
          </div>

          <div>
            <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700 }}>
              Oct 2026
            </div>
            <div style={{ color: '#666666', fontSize: '12px', marginTop: '2px' }}>
              Member since
            </div>
          </div>

          <div>
            <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700 }}>
              {highestRole}
            </div>
            <div style={{ color: '#666666', fontSize: '12px', marginTop: '2px' }}>
              Role
            </div>
          </div>
        </div>
      </section>

      {/* ================= DETAILS SECTION (two columns, gap 16px) ================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* LEFT CARD — Account Info */}
        <div
          style={{
            background: '#161616',
            border: '1px solid #1f1f1f',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #111111',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Account Information
          </div>

          <div style={{ padding: '0 20px' }}>
            <div
              style={{
                padding: '14px 0',
                borderBottom: '1px solid #111111',
              }}
            >
              <div
                style={{
                  color: '#666666',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  marginBottom: '4px',
                }}
              >
                FULL NAME
              </div>
              <div style={{ color: '#f0f0f0', fontSize: '14px' }}>{user.name}</div>
            </div>

            <div
              style={{
                padding: '14px 0',
                borderBottom: '1px solid #111111',
              }}
            >
              <div
                style={{
                  color: '#666666',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  marginBottom: '4px',
                }}
              >
                EMAIL
              </div>
              <div style={{ color: '#f0f0f0', fontSize: '14px' }}>{user.email}</div>
            </div>

            <div
              style={{
                padding: '14px 0',
                borderBottom: '1px solid #111111',
              }}
            >
              <div
                style={{
                  color: '#666666',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  marginBottom: '4px',
                }}
              >
                ACCOUNT ID
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
                  color: '#888888',
                  fontSize: '12px',
                }}
              >
                {accountIdShort}
              </div>
            </div>

            <div
              style={{
                padding: '14px 0',
                borderBottom: 'none',
              }}
            >
              <div
                style={{
                  color: '#666666',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  marginBottom: '4px',
                }}
              >
                MEMBER SINCE
              </div>
              <div style={{ color: '#f0f0f0', fontSize: '14px' }}>October 2026</div>
            </div>
          </div>
        </div>

        {/* RIGHT CARD — Teams & Roles */}
        <div
          style={{
            background: '#161616',
            border: '1px solid #1f1f1f',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #111111',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Teams &amp; Access
          </div>

          <div style={{ padding: '12px 20px' }}>
            {user.memberships && user.memberships.length > 0 ? (
              user.memberships.map((m, index) => {
                const isLast = index === user.memberships.length - 1;
                const roleDesc =
                  ROLE_DESCRIPTIONS[m.role] ?? 'Team member with standard access';
                const badgeStyle = getRoleBadgeStyle(m.role);

                return (
                  <div
                    key={m.teamId}
                    style={{
                      padding: '10px 0',
                      borderBottom: isLast ? 'none' : '1px solid #111111',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    {/* LEFT */}
                    <div>
                      <div
                        style={{
                          color: '#ffffff',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {m.teamName}
                      </div>
                      <div
                        style={{
                          color: '#666666',
                          fontSize: '11px',
                          marginTop: '2px',
                        }}
                      >
                        {roleDesc}
                      </div>
                    </div>

                    {/* RIGHT: Role badge */}
                    <span
                      style={{
                        ...badgeStyle,
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.role}
                    </span>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: '#666666',
                  fontSize: '13px',
                }}
              >
                No teams assigned
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= SIGN OUT SECTION ================= */}
      <div style={{ marginTop: '20px' }}>
        <button
          id="profile-signout"
          type="button"
          onClick={handleSignOut}
          onMouseEnter={() => setSignoutHover(true)}
          onMouseLeave={() => setSignoutHover(false)}
          style={{
            width: '100%',
            padding: '13px',
            background: signoutHover ? 'rgba(220,38,38,0.08)' : 'transparent',
            border: signoutHover
              ? '1px solid rgba(220,38,38,0.4)'
              : '1px solid rgba(220,38,38,0.25)',
            color: '#dc2626',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transform: signoutHover ? 'translateY(-1px)' : 'none',
            transition: 'all 150ms ease',
          }}
        >
          <LogOutIcon size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
