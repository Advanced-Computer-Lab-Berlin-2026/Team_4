// AdminUsersPage — Member 4 — Requirements 7, 28, 29, 39.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listUsers, setUserStatus, removeUser } from '../../api/adminUsers.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Pagination from '../../components/common/Pagination';
import UserSearchBar from '../../components/admin/UserSearchBar';
import UserTable from '../../components/admin/UserTable';

export default function AdminUsersPage() {
  // Keep list state in the URL so detail navigation, Back and reload preserve it.
  const [urlParams, setUrlParams] = useSearchParams();
  const searchParams = useMemo(() => ({
    q: urlParams.get('q') || '',
    role: urlParams.get('role') || '',
    lenderStatus: urlParams.get('lenderStatus') || '',
    status: urlParams.get('status') || '',
  }), [urlParams]);
  const rawPage = urlParams.get('page') || '1';
  const page = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) && Number(rawPage) <= 1000000
    ? Number(rawPage) : 1;
  const setPage = useCallback((nextPage) => {
    setUrlParams(previous => {
      const next = new URLSearchParams(previous);
      if (nextPage > 1) next.set('page', String(nextPage));
      else next.delete('page');
      return next;
    }, { replace: true });
  }, [setUrlParams]);
  const setFilters = (filters) => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) next.set(key, value); });
    setUrlParams(next, { replace: true }); // new filters start at page 1
  };
  const [data, setData] = useState({ data: [], total: 0, totalPages: 1 });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    listUsers({ ...searchParams, page })
      .then(result => {
        if (ignore) return;
        if (page > result.totalPages) setPage(result.totalPages);
        else setData(result);
      })
      .catch(err => { if (!ignore) setError(getErrorMessage(err)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [searchParams, page, revision, setPage]);

  const mutate = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setRevision(value => value + 1);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const handleDelete = (id) => {
    if (!window.confirm('Remove this account? Its listings will be archived and related application and household records removed. This cannot be undone.')) return;
    return mutate(() => removeUser(id));
  };

  return (
    <div className="container" style={{ paddingBlock: '2rem' }}>
      <h1>Admin User Management</h1>
      <UserSearchBar value={searchParams} onChange={setFilters} />
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {loading ? <p role="status">Loading registered users...</p> : (
        <>
          <p aria-live="polite">{data.total} registered users found</p>
          <UserTable users={data.data} currentUserId={user?._id} busy={busy}
            onToggleStatus={(id, status) => mutate(() => setUserStatus(id, { status: status === 'suspended' ? 'active' : 'suspended' }))}
            onDelete={handleDelete} onViewDetails={selected => navigate(`/admin/users/${selected._id}`)} />
          <Pagination page={page} pages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
