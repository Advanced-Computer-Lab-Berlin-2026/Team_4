// ExtensionAnswer - Owner: Member 5 - Requirement: 75
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
// For the lender: a pending request for more time, with Approve new date (only when it can still work) / Decline (Member 1's extend command, which
// re-checks that the extra days are still free before moving the return date).
import { useState } from 'react';
import { getErrorMessage } from '../../../api/axios';
import { answerExtension } from '../../../api/reservationLifecycle.api';
import Alert from '../../common/Alert';
import { dayCount, daysBetween, showDay } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

export default function ExtensionAnswer({ reservation: r, onDone, onStale }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (r.role !== 'lender' || !r.actions?.decideExtension) return null;

  const ext = r.extension;
  const title = r.item?.title || 'this item';
  const who = r.borrower?.name || 'The borrower';
  const more = dayCount(daysBetween(r.endDate, ext.requestedEndDate));

  const answer = async (decision) => {
    const q = decision === 'approve'
      ? `Let ${who} keep "${title}" until ${showDay(ext.requestedEndDate)} (${more} more)?`
      : `Decline the request for more time? ${who} returns "${title}" on ${showDay(r.endDate)} as planned.`;
    if (!window.confirm(q)) return;
    setBusy(decision); setError('');
    try {
      const { reservation } = await answerExtension(r._id, decision, ext.requestId);
      onDone(reservation, decision === 'approve'
        ? `Approved: "${title}" now comes back on ${showDay(ext.requestedEndDate)}.`
        : `Declined: "${title}" still comes back on ${showDay(r.endDate)}.`);
    } catch (e) {
      const message = getErrorMessage(e);
      if ([404, 409].includes(e?.response?.status) && onStale && !/booked/.test(message)) {
        onStale(`${message.replace(/\.$/, '')}. This request changed meanwhile; its current status is shown.`);
      } else setError(message);
    } finally { setBusy(''); }
  };

  return (
    <div className={s.answer} role="group" aria-label={`Request for more time for ${title}`}>
      <Alert variant="error">{error}</Alert>
      <p className={s.extStatus}>{who} wants to keep it until <strong>{showDay(ext.requestedEndDate)}</strong> ({more} more).</p>
      <div className="row">
        {r.actions?.approveExtension && (
          <button type="button" className="btn" disabled={!!busy} onClick={() => answer('approve')} aria-label={`Approve the new return date for ${title}`}>
            {busy === 'approve' ? 'Approving...' : 'Approve new date'}
          </button>
        )}
        <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => answer('reject')} aria-label={`Decline more time for ${title}`}>
          {busy === 'reject' ? 'Declining...' : 'Decline'}
        </button>
      </div>
      {!r.actions?.approveExtension && (
        <p className={`muted ${s.answerNote}`}>This new date can&apos;t be approved any more: the extra days are booked, or the item or its rules changed. You can decline it.</p>
      )}
    </div>
  );
}
