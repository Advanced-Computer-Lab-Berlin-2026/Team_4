// MY WAITLISTS - Owner: Member 7 - Requirements: 65, 66, 67
// Route: /waitlists   Access: member   (registered through client/src/routes/sprint2/member7.routes.jsx, wired by Member 1)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leaveWaitlist, listMyWaitlists } from '../../api/waitlists.api';
import { getErrorMessage } from '../../api/axios';
import { formatDateTime } from '../../utils/format';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import { formatDay, isoDay, offerUrl } from '../../components/sprint2/m7/dateUtils';
import styles from '../../styles/sprint2/member7.module.css';

// Map waitlist states onto the shared badge colours (text always carries the meaning).
const VIEW = {
  waiting: { tone: 'pending', label: 'Waiting' },
  promoted: { tone: 'active', label: 'Offer available' },
  fulfilled: { tone: 'accepted', label: 'Reserved' },
  expired: { tone: 'declined', label: 'Expired' },
  left: { tone: 'archived', label: 'Left' },
};

export default function MyWaitlistsPage() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    setError('');
    return listMyWaitlists()
      .then((d) => setEntries(d.items || []))
      .catch((e) => { setError(getErrorMessage(e)); setEntries((prev) => prev || []); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const leave = async (entry) => {
    if (!window.confirm(entry.status === 'promoted' ? 'Give up this offer?' : 'Leave this waitlist?')) return;
    setBusyId(entry._id);
    try { await leaveWaitlist(entry._id); await load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusyId(''); }
  };

  return (
    <div className="container">
      <h1>My waitlists</h1>
      <Alert variant="error">{error}</Alert>
      {!entries && <Spinner />}
      {entries && entries.length === 0 && (
        <p className="muted">You are not on any waitlist. <Link to="/catalog">Browse items</Link> and pick dates to join one.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className={styles.waitlistList}>
          {entries.map((e) => {
            const view = VIEW[e.status] || VIEW.left;
            const live = e.status === 'waiting' || e.status === 'promoted';
            const [s, en] = [isoDay(e.startDate), isoDay(e.endDate)];
            return (
              <li key={e._id} className="card">
                <div className="card-body">
                  <h3>{e.item ? <Link to={`/catalog/${e.item._id}?start=${s}&end=${en}`}>{e.item.title}</Link> : 'Item no longer available'}</h3>
                  <p>{formatDay(s)} to {formatDay(en)} <StatusBadge status={view.tone}>{view.label}</StatusBadge></p>
                  {e.status === 'promoted' && (
                    <Alert variant="success">A spot opened up. Reserve it before {formatDateTime(e.offerExpiresAt)}.</Alert>
                  )}
                  <div className="row">
                    {e.status === 'promoted' && e.item && <Link className="btn" to={offerUrl(e.item._id, e)}>Reserve now</Link>}
                    {live && (
                      <button type="button" className="btn btn-secondary" disabled={busyId === e._id} onClick={() => leave(e)}>
                        {busyId === e._id ? 'Working…' : e.status === 'promoted' ? 'Give up offer' : 'Leave waitlist'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
