// FOUNDATION (NFR 5 + 6 on the client). Enforces the `access` level declared in routeConfig.jsx.
// NOTE: this only hides pages - the REAL security is the protect/requireRole middleware on the server.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';
import Alert from '../common/Alert';

export default function ProtectedRoute({ access = 'public', children }) {
  const { user, loading, isAdmin, isMember, isVerifiedLender } = useAuth();
  const location = useLocation();

  if (access === 'public') return children;
  if (loading) return <Spinner />;

  if (access === 'guest') return user ? <Navigate to={isAdmin ? '/admin' : '/'} replace /> : children;

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const allowed =
    access === 'auth' ||
    (access === 'member' && isMember) ||
    (access === 'lender' && isVerifiedLender) ||
    (access === 'admin' && isAdmin);

  if (!allowed) {
    return (
      <div className="container">
        <Alert variant="error">
          {access === 'lender'
            ? 'This page is only available to verified lenders. You can apply from "Become a lender".'
            : 'You do not have permission to view this page.'}
        </Alert>
      </div>
    );
  }
  return children;
}
