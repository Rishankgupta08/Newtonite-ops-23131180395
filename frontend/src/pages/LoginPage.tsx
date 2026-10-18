import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getErrorInfo } from '../api/client';
import { Banner } from '../components/Feedback';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('alice@ops.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to={(location.state as { from?: string })?.from ?? '/dashboard'} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorInfo(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left: editorial hero */}
      <section
        className="login-hero"
        aria-hidden="false"
        style={{ borderRight: '2px solid #dc2626' }}
      >
        <div className="login-hero-glow" />
        <div className="login-hero-content">
          <div className="login-hero-brand">
            <span>◆</span>
            <span>Newtonite Ops</span>
          </div>

          <h1 className="login-headline">
            Move critical work
            <br />
            forward.
            <br />
            <span className="red">
              Without losing
              <br />
              the details.
            </span>
          </h1>

          <p className="login-hero-sub">
            Configure for entire teams, squads and a reliable record of every decision ever made.
          </p>

          <div
            style={{
              marginTop: '40px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Main red accent rectangle */}
            <div
              style={{
                width: '200px',
                height: '4px',
                background: '#dc2626',
                borderRadius: '2px',
              }}
            />

            {/* Three stacked feature lines with red left border */}
            {[
              { label: 'Concurrent conflict detection', dot: true },
              { label: 'Role-enforced workflows', dot: true },
              { label: 'Append-only audit trail', dot: true },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: i === 0 ? '16px' : '0',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#dc2626',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: '#555555',
                    fontSize: '13px',
                    fontWeight: '400',
                  }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right: sign-in form */}
      <section className="login-panel">
        <div className="login-form-wrap">
          <h2 className="login-title">Welcome back</h2>
          <p className="login-subtitle">Sign in to access your team's operations.</p>

          <div className="login-divider" />

          {error && <Banner tone="error">{error}</Banner>}

          <form onSubmit={onSubmit} noValidate={false}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button id="login-submit" type="submit" className="login-submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner-inline" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="login-demo">Demo: alice@ops.com / password123</p>

          <div className="login-pills">
            <span className="login-pill">⚡ Concurrent</span>
            <span className="login-pill">🔒 Role-Based</span>
            <span className="login-pill">📋 Audit Trail</span>
          </div>
        </div>
      </section>
    </div>
  );
}
