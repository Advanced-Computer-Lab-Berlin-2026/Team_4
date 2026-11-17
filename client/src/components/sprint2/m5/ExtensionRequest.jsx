// ExtensionRequest - Owner: Member 5 - Requirement: 74
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
// For the borrower of an active booking: ask for a later return date, see the pending request and withdraw it, or see
// how the last request was answered. Everything goes through Member 1's extend command.
import { useState } from 'react';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { cancelExtension, requestExtension } from '../../../api/reservationLifecycle.api';
import Alert from '../../common/Alert';
import FormField from '../../common/FormField';
import { addDays, dayCount, daysBetween, isDay, showDay } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

const HORIZON = 365; // longest total for an item without its own maximum (same as the borrow list)

export default function ExtensionRequest({ reservation: r, onDone, onStale }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  if (r.role !== 'borrower' || r.status !== 'active') return null;

  const ext = r.extension || {};
  const title = r.item?.title || 'this item';
  const min = addDays(r.endDate, 1);
  const max = addDays(r.startDate, r.item?.maxBorrowDays || HORIZON); // the item's maximum length in total
  const extra = isDay(date) && date > r.endDate ? daysBetween(r.endDate, date) : 0;

  const fail = (e) => {
    const f = getFieldErrors(e).find((x) => x.field === 'requestedEndDate');
    const message = getErrorMessage(e);
    if (f) setFieldError(f.message);
    else if ([404, 409].includes(e?.response?.status) && onStale && !/booked part of these extra days/.test(message)) {
      onStale(`${message.replace(/\.$/, '')}. This booking changed meanwhile; its current status is shown.`);
    } else setError(message);
  };

  const ask = async (e) => {
    e.preventDefault();
    setError(''); setFieldError('');
    if (!isDay(date) || date <= r.endDate) { setFieldError(`Choose a date after ${showDay(r.endDate)}`); return; }
    if (!window.confirm(`Ask to keep "${title}" until ${showDay(date)} (${dayCount(extra)} more)?`)) return;
    setBusy('ask');
    try {
      const { reservation } = await requestExtension(r._id, date);
      setDate('');
      onDone(reservation, `Request sent: you asked to return "${title}" on ${showDay(date)}. The lender will answer.`);
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  const withdraw = async () => {
    if (!window.confirm('Withdraw your request for more time?')) return;
    setBusy('withdraw'); setError('');
    try {
      const { reservation } = await cancelExtension(r._id, ext.requestId);
      onDone(reservation, `Request withdrawn. The return date stays ${showDay(r.endDate)}.`);
    } catch (err) { fail(err); } finally { setBusy(''); }
  };

  if (ext.status === 'pending') {
    return (
      <div className={s.answer} role="group" aria-label="Your request for more time">
        <Alert variant="error">{error}</Alert>
        <p className={s.extStatus}>You asked to return it on <strong>{showDay(ext.requestedEndDate)}</strong> ({dayCount(daysBetween(r.endDate, ext.requestedEndDate))} more). Waiting for the lender.</p>
        <p className={`muted ${s.answerNote}`}>If the lender doesn&apos;t answer by {showDay(r.endDate)}, the request expires and the return date stays.</p>
        <div className="row">
          <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={withdraw}>{busy === 'withdraw' ? 'Withdrawing...' : 'Withdraw request'}</button>
        </div>
      </div>
    );
  }

  const last = { approved: `Your last request was approved: the return date is now ${showDay(r.endDate)}.`, rejected: 'The lender declined your last request.',
    cancelled: 'You withdrew your last request.', expired: 'Your last request wasn\'t answered before the return date, so it expired.' }[ext.status];

  if (!r.actions?.requestExtension) {
    return <p className={`muted ${s.answerNote}`}>{last ? `${last} ` : ''}The return date has passed, so more time can&apos;t be requested.</p>;
  }

  return (
    <form onSubmit={ask} noValidate aria-label="Ask for more time" className={s.answer}>
      {last && <p className={`muted ${s.answerNote}`}>{last}</p>}
      <Alert variant="error">{error}</Alert>
      <FormField label="New return date" error={fieldError}>
        <input type="date" value={date} min={min} max={max} disabled={busy === 'ask'} onChange={(e) => { setDate(e.target.value); setFieldError(''); setError(''); }} />
      </FormField>
      <p className={`muted ${s.counter}`} aria-live="polite">{extra ? `${dayCount(extra)} more, return on ${showDay(date)}` : `Current return date: ${showDay(r.endDate)}`}</p>
      <div className="row">
        <button type="submit" className="btn" disabled={busy === 'ask'}>{busy === 'ask' ? 'Sending...' : 'Ask for more time'}</button>
      </div>
    </form>
  );
}
