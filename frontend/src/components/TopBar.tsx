import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SearchIcon } from './Icons';
import { ProfileDropdown } from './ProfileDropdown';

function titleFor(pathname: string) {
  if (pathname.startsWith('/items')) return 'Work Items';
  if (pathname.startsWith('/profile')) return 'Settings';
  return 'Overview';
}

export function TopBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-title">{titleFor(pathname)}</div>

      {/* Cosmetic search — real search lives in the Work Items filter bar */}
      <div className="search-box topbar-search">
        <span className="search-box-icon">
          <SearchIcon />
        </span>
        <input id="topbar-search" className="search-input" placeholder="Search anything..." />
      </div>

      <div className="topbar-right">
        <button
          id="topbar-avatar"
          className="avatar avatar-34 topbar-avatar-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
          aria-label="User profile menu"
          aria-expanded={open}
        >
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </button>
        <ProfileDropdown isOpen={open} onClose={() => setOpen(false)} />
      </div>
    </header>
  );
}
