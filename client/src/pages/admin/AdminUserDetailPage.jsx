import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { getUser } from '../../api/adminUsers.api';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setUser(null);
    getUser(id)
      .then(({ data }) => { if (active) setUser(data); })
      .catch((err) => { if (active) setError(getErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  return (
    <div className="container">
      <div className="workspace-heading">
        <h1>User details</h1>
        <Link to="/admin/users" className="btn btn-secondary">Back to users</Link>
      </div>
      {loading && <Spinner label="Loading user details..." />}
      <Alert variant="error">{error}</Alert>
      {!loading && !error && !user && <p className="empty-state">User not found.</p>}
      {user && (
        <section className="card card-body admin-user-info" aria-label="User information">
          <dl>
            <dt>Full name</dt><dd>{user.name}</dd>
            <dt>Username</dt><dd>{user.username}</dd>
            <dt>Email address</dt><dd>{user.email}</dd>
            <dt>Phone number</dt><dd>{user.phone || 'N/A'}</dd>
            <dt>Home address</dt>
            <dd>{[user.address?.street, user.address?.city, user.address?.state, user.address?.postalCode, user.address?.country].filter(Boolean).join(', ') || 'N/A'}</dd>
            <dt>System role</dt><dd>{user.role}</dd>
            <dt>Lender status</dt><dd><StatusBadge status={user.lenderStatus || 'Standard'} /></dd>
            <dt>Account status</dt><dd><StatusBadge status={user.status || 'active'} /></dd>
            <dt>Registered on</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}
