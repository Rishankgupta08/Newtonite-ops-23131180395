import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from './Avatar';
import { GearIcon, LogOutIcon, UserIcon } from './Icons';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileDropdown({ isOpen, onClose }: ProfileDropdownProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const primaryRole = user.memberships?.[0]?.role ?? 'MEMBER';
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="profile-dropdown" ref={dropdownRef} role="menu">
      <div className="profile-dropdown-header">
        <Avatar name={user.name} size={40} />
        <div className="profile-dropdown-info">
          <div className="profile-dropdown-name">{user.name}</div>
          <div className="profile-dropdown-email">{user.email}</div>
          <span className="profile-dropdown-role">{primaryRole}</span>
        </div>
      </div>

      <div className="profile-dropdown-menu">
        <button id="dropdown-profile" className="profile-dropdown-item" onClick={() => go('/profile')}>
          <UserIcon />
          <span>Profile</span>
        </button>
        <button id="dropdown-settings" className="profile-dropdown-item" onClick={() => go('/profile')}>
          <GearIcon size={15} />
          <span>Settings</span>
        </button>
      </div>

      <div className="profile-dropdown-sep" />

      <div className="profile-dropdown-menu">
        <button
          id="dropdown-signout"
          className="profile-dropdown-item signout"
          onClick={() => {
            onClose();
            logout();
          }}
        >
          <LogOutIcon />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
