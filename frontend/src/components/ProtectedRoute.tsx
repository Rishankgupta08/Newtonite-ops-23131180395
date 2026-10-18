import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppLayout } from './AppLayout';

export function ProtectedRoute() {
  const { token, initializing } = useAuth();

  if (!token) return <Navigate to="/login" replace />;
  if (initializing) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
