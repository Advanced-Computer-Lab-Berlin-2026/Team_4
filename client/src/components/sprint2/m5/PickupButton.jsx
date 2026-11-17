// PickupButton - Owner: Member 5 - Requirement: 59
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
// For the lender of an upcoming booking:
//  - pickup: "Mark as picked up" once the start date has come (Member 1's pickup command); before that, from when.
//  - delivery: no pickup step. Member 1's pickup refuses deliveries; the booking starts when Member 6's delivery
//    tracking marks it delivered, so this links there ("Update delivery").
// After a missed pickup it shows nothing (the "Pickup missed" label says why).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../../api/axios';
import { markPickedUp } from '../../../api/reservationLifecycle.api';
import routes from '../../../routes/routeConfig';
import Alert from '../../common/Alert';
import { showDay, todayUtc } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

// Member 6's delivery tracking page, if its route is registered (never a broken link).
const hasDeliveryPage = routes.some((route) => route.path.startsWith('/delivery-tracking'));

export default function PickupButton({ reservation: r, onDone, onStale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (r.role !== 'lender' || r.status !== 'confirmed' || r.flags?.pickupMissed) return null;

  const title = r.item?.title || 'this item';
  const who = r.borrower?.name || 'the borrower';
  const early = r.startDate > todayUtc();

  if (r.fulfilment?.method === 'delivery') {
    return (
      <div className={s.answer} role="group" aria-label={`Delivery of ${title}`}>
        <p className={s.extStatus}>Bring the item to {who}, then mark it as delivered.</p>
        {early && <p className={`muted ${s.answerNote}`}>You can deliver it from {showDay(r.startDate)}.</p>}
        {hasDeliveryPage && (
          <div className={`row ${s.spaced}`}>
            <Link to={`/delivery-tracking/${r._id}`} className="btn" aria-label={`Update the delivery of ${title}`}>Update delivery</Link>
          </div>
        )}
      </div>
    );
  }

  if (!r.actions?.pickup) {
    return early ? <p className={`muted ${s.answerNote}`}>You can mark it picked up from {showDay(r.startDate)}.</p> : null;
  }

  const mark = async () => {
    if (!window.confirm(`Mark "${title}" as picked up by ${who}? The return date is ${showDay(r.endDate)}.`)) return;
    setBusy(true);
    setError('');
    try {
      const { reservation } = await markPickedUp(r._id);
      onDone(reservation, `Marked as picked up. ${who} returns "${title}" on ${showDay(r.endDate)}.`);
    } catch (e) {
      const message = getErrorMessage(e);
      if ([404, 409].includes(e?.response?.status) && onStale) {
        onStale(`${message.replace(/\.$/, '')}. This booking changed meanwhile; its current status is shown.`);
      } else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.answer} role="group" aria-label={`Pickup of ${title}`}>
      <Alert variant="error">{error}</Alert>
      <p className={`muted ${s.answerNote}`}>Check the item with {who} and take photos of its condition before they take it.</p>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={mark} aria-label={`Mark ${title} as picked up`}>
          {busy ? 'Saving...' : 'Mark as picked up'}
        </button>
      </div>
    </div>
  );
}
