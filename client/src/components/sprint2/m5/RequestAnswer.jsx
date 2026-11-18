// RequestAnswer - Owner: Member 5 - Requirement: 56
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
//   onStale: the request was answered or changed elsewhere (404/409); the page keeps the message and refreshes quietly.
// The lender's Approve / Decline for a pending request. Shown only when the server says the lender may use them
// (reservation.actions). Both go through Member 1's command; refunds and events happen there.
// Decline opens a short form with an optional reason (shown to the borrower). Both ask for confirmation first.
import { useState } from 'react';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { approveReservation, rejectReservation } from '../../../api/reservationLifecycle.api';
import { formatMoney } from '../../../utils/format';
import Alert from '../../common/Alert';
import FormField from '../../common/FormField';
import { showDay, showRange } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

const MAX = 500;

export default function RequestAnswer({ reservation: r, onDone, onStale }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const canApprove = !!r.actions?.approve;
  const canReject = !!r.actions?.reject;
  if (!canApprove && !canReject) return null;

  const title = r.item?.title || 'this item';
  const who = r.borrower?.name || 'the borrower';
  const when = showRange(r.startDate, r.endDate);
  const totalRefund = (r.deposit?.amount || 0) + (r.fulfilment?.deliveryFee || 0);
  const refund = totalRefund > 0 ? ` ${who} gets ${formatMoney(totalRefund)} back in full.` : '';

  const run = async (kind, call, message) => {
    setBusy(kind);
    setError('');
    setReasonError('');
    try {
      const { reservation } = await call();
      setDeclining(false);
      setReason('');
      onDone(reservation, message);
    } catch (e) {
      const field = getFieldErrors(e).find((x) => x.field === 'reason');
      const message = getErrorMessage(e);
      if (field) setReasonError(field.message);
      else if ([404, 409].includes(e?.response?.status) && onStale) {
        // Answered or changed meanwhile (another tab, the borrower cancelled...). This piece may disappear when the page
        // refreshes, so the page shows the message itself.
        onStale(`${message.replace(/\.$/, '')}. This request changed meanwhile; its current status is shown.`);
      } else setError(message);
    } finally {
      setBusy('');
    }
  };

  const approve = () => {
    if (!window.confirm(`Approve the request from ${who} for "${title}", ${when}?`)) return;
    const handover = r.fulfilment?.method === 'delivery'
      ? `Arrange delivery for "${title}" from ${showDay(r.startDate)}.`
      : `${who} can pick up "${title}" from ${showDay(r.startDate)}.`;
    run('approve', () => approveReservation(r._id), `Approved. ${handover}`);
  };
  const decline = (e) => {
    e.preventDefault();
    if (reason.trim().length > MAX) { setReasonError(`Keep the reason under ${MAX} characters`); return; }
    if (!window.confirm(`Decline the request from ${who} for "${title}"?${refund}`)) return;
    run('reject', () => rejectReservation(r._id, reason.trim() || undefined), `Declined the request for "${title}".${refund}`);
  };

  return (
    <div className={s.answer} aria-label={`Answer the request for ${title}`} role="group">
      <Alert variant="error">{error}</Alert>
      {!declining ? (
        <div className="row">
          {canApprove && (
            <button type="button" className="btn" disabled={!!busy} onClick={approve} aria-label={`Approve the request for ${title}`}>
              {busy === 'approve' ? 'Approving...' : 'Approve'}
            </button>
          )}
          {canReject && (
            <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => { setDeclining(true); setError(''); }} aria-label={`Decline the request for ${title}`}>
              Decline
            </button>
          )}
          {!canApprove && canReject && <p className={`muted ${s.answerNote}`}>This request can no longer be approved, but you can decline it.</p>}
        </div>
      ) : (
        <form onSubmit={decline} noValidate className={s.declineForm} aria-label={`Decline the request for ${title}`}>
          <FormField label="Reason (optional)" error={reasonError} hint={`Shown to ${who}.${refund}`}>
            <textarea value={reason} maxLength={MAX + 50} disabled={busy === 'reject'} onChange={(e) => { setReason(e.target.value); setReasonError(''); }} />
          </FormField>
          <p className={`muted ${s.counter}`} aria-live="polite">{reason.trim().length} / {MAX}</p>
          <div className="row">
            <button type="submit" className="btn btn-danger" disabled={busy === 'reject'}>{busy === 'reject' ? 'Declining...' : 'Decline request'}</button>
            <button type="button" className="btn btn-secondary" disabled={busy === 'reject'} onClick={() => { setDeclining(false); setReasonError(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
