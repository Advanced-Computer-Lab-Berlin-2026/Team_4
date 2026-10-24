// ALL ITEM LISTINGS - Owner: Member 9 - Requirements: 23
// Route: /admin/items - Access: admin
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllItems } from '../../api/adminItems.api';
import { getErrorMessage } from '../../api/axios';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import { formatDateTime } from '../../utils/format';

export default function AdminItemsPage() {
  const [result, setResult] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadItems = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const data = await listAllItems({ page, limit: 12 });
      if (requestId.current !== currentRequest) return;
      setResult(data);
    } catch (err) {
      if (requestId.current === currentRequest) setError(getErrorMessage(err));
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return (
    <div className="container">
      <h1>All item listings</h1>
      <Alert variant="error">{error}</Alert>
      {error && (
        <button type="button" className="btn btn-secondary" onClick={loadItems}>
          Try again
        </button>
      )}
      {loading ? (
        <Spinner label="Loading item listings..." />
      ) : !error && result.items.length === 0 ? (
        <p className="muted">There are no item listings yet.</p>
      ) : !error ? (
        <>
          <p className="muted">{result.total} listing{result.total === 1 ? '' : 's'} total</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <Link to={`/catalog/${item._id}`}>{item.title}</Link>
                    </td>
                    <td>{item.owner?.name || item.owner?.username || 'Unknown'}</td>
                    <td>{item.category?.name || 'Unknown'}</td>
                    <td>
                      <div className="row">
                        {item.isArchived && <StatusBadge status="archived" />}
                        <StatusBadge status={item.moderationStatus} />
                      </div>
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pages={result.pages} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
