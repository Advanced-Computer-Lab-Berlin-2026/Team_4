// PickupButton - Owner: Member 5 - Requirement: 59
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
// For the lender of an upcoming booking: "Mark as picked up" (or "Mark as handed over" for a delivery) once the start
// date has come, through Member 1's pickup command. Before that it says from when; after a missed pickup it shows nothing.
import { useState } from 'react';
import { getErrorMessage } from '../../../api/axios';
import { markPickedUp } from '../../../api/reservationLifecycle.api';
import Alert from '../../common/Alert';
import { showDay, todayUtc } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

export default function PickupButton({ reservation: r, onDone, onStale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (r.role !== 'lender' || r.status !== 'confirmed' || r.flags?.pickupMissed) return null;

  const title = r.item?.title || 'this item';
  const who = r.borrower?.name || 'the borrower';
  const delivery = r.fulfilment?.method === 'delivery';
  const verb = delivery ? 'handed over' : 'picked up';

  if (!r.actions?.pickup) {
    return r.startDate > todayUtc()
      ? <p className={`muted ${s.answerNote}`}>You can mark it {verb} from {showDay(r.startDate)}.</p>
      : null;
  }

  const mark = async () => {
    if (!window.confirm(`Mark "${title}" as ${verb} by ${who}? The return date is ${showDay(r.endDate)}.`)) return;
    setBusy(true);
    setError('');
    try {
      const { reservation } = await markPickedUp(r._id);
      onDone(reservation, `Marked as ${verb}. ${who} returns "${title}" on ${showDay(r.endDate)}.`);
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
      <p className={`muted ${s.answerNote}`}>Check the item with {who} and take photos of its condition before {delivery ? 'handing it over' : 'they take it'}.</p>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={mark} aria-label={`Mark ${title} as ${verb}`}>
          {busy ? 'Saving...' : `Mark as ${verb}`}
        </button>
      </div>
    </div>
  );
}
