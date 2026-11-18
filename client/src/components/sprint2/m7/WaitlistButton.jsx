// WaitlistButton - Owner: Member 7 - Req 65, 66, 67
// Props: { itemId, start, end } - join / leave the waitlist for the chosen dates; shows an open offer.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { joinWaitlist, leaveWaitlist, listMyWaitlists } from '../../../api/waitlists.api';
import { getErrorMessage } from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { formatDateTime } from '../../../utils/format';
import Alert from '../../common/Alert';
import { isoDay, offerUrl } from './dateUtils';

const live = (e) => e.status === 'waiting' || e.status === 'promoted';

export default function WaitlistButton({ itemId, start, end }) {
  const { user, isMember } = useAuth();
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    if (!isMember) return Promise.resolve();
    return listMyWaitlists({ item: itemId })
      .then((d) => setEntries(d.items || []))
      .catch((e) => setError(getErrorMessage(e)));
  }, [itemId, isMember]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!user) {
    return <p className="muted"><Link to="/login">Log in</Link> or <Link to="/register">register</Link> to join the waitlist for these dates.</p>;
  }
  if (!isMember) return null;

  const mine = entries.find((e) => live(e) && isoDay(e.startDate) < end && isoDay(e.endDate) > start);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await refresh(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <Alert variant="error">{error}</Alert>
      {mine?.status === 'promoted' && (
        <Alert variant="success">
          A spot opened up for {isoDay(mine.startDate)} to {isoDay(mine.endDate)}. Reserve it before {formatDateTime(mine.offerExpiresAt)}.
        </Alert>
      )}
      {mine?.status === 'waiting' && (
        <Alert variant="info">You are on the waitlist for these dates. We will notify you if they free up.</Alert>
      )}
      <div className="row">
        {mine?.status === 'promoted' && (
          <Link className="btn" to={offerUrl(itemId, mine)}>Reserve now</Link>
        )}
        {mine ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {
            if (window.confirm(mine.status === 'promoted' ? 'Give up this offer?' : 'Leave this waitlist?')) run(() => leaveWaitlist(mine._id));
          }}>{busy ? 'Working…' : mine.status === 'promoted' ? 'Give up offer' : 'Leave waitlist'}</button>
        ) : (
          <button type="button" className="btn" disabled={busy || !start || !end} onClick={() => run(() => joinWaitlist({ itemId, startDate: start, endDate: end }))}>
            {busy ? 'Joining…' : 'Join the waitlist for these dates'}
          </button>
        )}
      </div>
    </div>
  );
}
