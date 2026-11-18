// WaitlistButton - Owner: Member 7 - Req 65, 66, 67
// Props: { itemId, start, end } - join / leave the waitlist for the chosen dates; shows an open offer.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { joinWaitlist, leaveWaitlist, listMyWaitlists } from '../../../api/waitlists.api';
import { getErrorMessage } from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { formatDateTime } from '../../../utils/format';
import Alert from '../../common/Alert';
import LeaveWaitlistButton from './LeaveWaitlistButton';
import { isoDay, offerUrl } from './dateUtils';

const live = (e) => e.status === 'waiting' || e.status === 'promoted';

export default function WaitlistButton({ itemId, start, end, onChange }) {
  const { user, isMember } = useAuth();
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => listMyWaitlists({ item: itemId }), [itemId]);
  useEffect(() => {
    if (!isMember) return undefined;
    let active = true;
    setEntries(null);
    setError('');
    refresh()
      .then((d) => { if (active) setEntries(d.items || []); })
      .catch((e) => { if (active) setError(getErrorMessage(e)); });
    return () => { active = false; };
  }, [refresh, isMember, user?._id]);

  if (!user) {
    return <p className="muted"><Link to="/login">Log in</Link> or <Link to="/register">register</Link> to join the waitlist for these dates.</p>;
  }
  if (!isMember) return null;

  const mine = entries?.find((e) => live(e) && isoDay(e.startDate) < end && isoDay(e.endDate) > start);
  const claim = mine?.status === 'promoted' && offerUrl(itemId, mine);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      const data = await refresh();
      setEntries(data.items || []);
      onChange?.();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <Alert variant="error">{error}</Alert>
      {!entries && !error && <p role="status">Checking your waitlist…</p>}
      {claim && !mine.checkoutAttemptId && (
        <Alert variant="success">
          A spot opened up for {isoDay(mine.startDate)} to {isoDay(mine.endDate)}. Reserve it before {formatDateTime(mine.offerExpiresAt)}.
        </Alert>
      )}
      {mine?.status === 'waiting' && (
        <Alert variant="info">You are on the waitlist for these dates. We will notify you if they free up.</Alert>
      )}
      <div className="row">
        {mine?.checkoutAttemptId && <Link className="btn" to={`/checkout/status/${mine.checkoutAttemptId}`}>View checkout</Link>}
        {claim && !mine.checkoutAttemptId && <Link className="btn" to={claim}>Reserve now</Link>}
        {mine && !mine.checkoutAttemptId && (
          <LeaveWaitlistButton key={mine._id} promoted={mine.status === 'promoted'} busy={busy}
            onLeave={() => run(() => leaveWaitlist(mine._id))} />
        )}
        {entries && !mine && (
          <button type="button" className="btn" disabled={busy || !start || !end} onClick={() => run(() => joinWaitlist({ itemId, startDate: start, endDate: end }))}>
            {busy ? 'Joining…' : 'Join the waitlist for these dates'}
          </button>
        )}
      </div>
    </div>
  );
}
