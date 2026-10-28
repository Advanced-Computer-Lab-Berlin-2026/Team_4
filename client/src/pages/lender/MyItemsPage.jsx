// MY ITEMS - Owner: Member 5 - Requirements: 15, 21
// Route: /lender/items   Access: lender   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Shows ALL my items (incl. archived, Req 21) with a filter, and Archive / Unarchive on each one (Req 15).
// The filter and page are kept in the address (?status=archived&page=2) so reload and the Back arrow keep them.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listMyItems, archiveItem, unarchiveItem } from '../../api/items.api';
import { getErrorMessage } from '../../api/axios';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import ItemRow from '../../components/lender/ItemRow';
import './my-items.css';

const PAGE_SIZE = 12;
const FILTERS = [
  { key: 'all', label: 'All', empty: "You haven't listed any items yet." },
  { key: 'active', label: 'Active', empty: 'You have no active items.' },
  { key: 'archived', label: 'Archived', empty: 'You have no archived items.' },
];

const countText = (total, status) => {
  const word = status === 'all' ? '' : `${status} `;
  return `${total} ${word}${total === 1 ? 'item' : 'items'}`;
};

export default function MyItemsPage() {
  const [params, setParams] = useSearchParams();
  const status = FILTERS.some((f) => f.key === params.get('status')) ? params.get('status') : 'all';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  const [data, setData] = useState(null); // { items, total, page, pages }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState({ variant: '', text: '' });

  const go = useCallback((next) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    const pg = next.page ?? page;
    if (s !== 'all') p.set('status', s);
    if (pg > 1) p.set('page', String(pg));
    setParams(p, { replace: !!next.replace });
  }, [status, page, setParams]);

  useEffect(() => {
    let ignore = false; // a slower, older request must not overwrite a newer one
    setLoading(true);
    setLoadError('');
    listMyItems({ status: status === 'all' ? undefined : status, page, limit: PAGE_SIZE })
      .then((d) => {
        if (ignore) return;
        // Page past the end (e.g. the last item on the last page was archived): go to the last page that exists.
        if (d.items.length === 0 && d.pages > 0 && page > d.pages) { go({ page: d.pages, replace: true }); return; }
        setData(d);
      })
      .catch((e) => { if (!ignore) setLoadError(getErrorMessage(e)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [status, page, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeFilter = (key) => { setMessage({ variant: '', text: '' }); go({ status: key, page: 1 }); };
  const changePage = (pg) => { go({ page: pg }); window.scrollTo(0, 0); };

  const onArchiveToggle = async (item) => {
    const archiving = !item.isArchived;
    if (archiving && !window.confirm(`Archive "${item.title}"? It will be hidden from the catalog. You can unarchive it at any time.`)) return;
    setMessage({ variant: '', text: '' });
    setBusyId(item._id);
    try {
      await (archiving ? archiveItem(item._id) : unarchiveItem(item._id));
      setMessage({ variant: 'success', text: `"${item.title}" ${archiving ? 'archived' : 'unarchived'}` });
    } catch (e) {
      setMessage({ variant: 'error', text: getErrorMessage(e) });
    } finally {
      setBusyId('');
      setReloadKey((k) => k + 1); // refresh the list, counts and pages either way
    }
  };

  const filter = FILTERS.find((f) => f.key === status);
  const items = data?.items || [];

  return (
    <div className="container">
      <div className="my-items-header">
        <h1>My items</h1>
        <Link to="/lender/items/new" className="btn">New item</Link>
      </div>

      <div className="tabs" role="group" aria-label="Show items">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`tab ${status === f.key ? 'active' : ''}`}
            aria-pressed={status === f.key} onClick={() => changeFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <Alert variant={message.variant || 'info'}>{message.text}</Alert>

      {loading && !data && <Spinner label="Loading your items..." />}

      {loadError && (
        <div className="my-items-error">
          <Alert variant="error">{loadError}</Alert>
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!loadError && data && (
        <>
          <p className="muted my-items-count" aria-live="polite">
            {loading ? 'Updating...' : countText(data.total, status)}
          </p>
          {items.length === 0 && !loading ? (
            <div className="my-items-empty">
              <p className="muted">{filter.empty}</p>
              {status === 'all' && <Link to="/lender/items/new" className="btn">New item</Link>}
            </div>
          ) : (
            <div className={`grid ${loading ? 'my-items-loading' : ''}`} aria-busy={loading}>
              {items.map((item) => (
                <ItemRow key={item._id} item={item} busy={busyId === item._id} onArchiveToggle={onArchiveToggle} />
              ))}
            </div>
          )}
          <Pagination page={data.page} pages={data.pages} onChange={changePage} />
        </>
      )}
    </div>
  );
}
