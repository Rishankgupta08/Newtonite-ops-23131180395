import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from './Avatar';
import { ChevronRightIcon, GridIcon, ListIcon, UserIcon } from './Icons';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' active' : ''}`;

export function Sidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.memberships?.[0]?.role;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-diamond">◆</span>
        <span className="sidebar-logo-text">Newtonite Ops</span>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <NavLink id="nav-overview" to="/dashboard" className={navClass}>
          <GridIcon />
          <span>Overview</span>
        </NavLink>
        <NavLink id="nav-items" to="/items" className={navClass}>
          <ListIcon />
          <span>Work Items</span>
        </NavLink>

        <div className="sidebar-nav-spacer" />

        <NavLink id="nav-profile" to="/profile" className={navClass}>
          <UserIcon size={16} />
          <span>Profile</span>
        </NavLink>
      </nav>

      <button id="sidebar-user" className="sidebar-user" onClick={() => navigate('/profile')}>
        <Avatar name={user?.name} size={32} />
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.name}</div>
          <div className="sidebar-user-meta">
            {user?.email}
            {role ? ` · ${role.toLowerCase()}` : ''}
          </div>
        </div>
        <ChevronRightIcon className="sidebar-user-arrow" />
      </button>
    </aside>
  );
}
