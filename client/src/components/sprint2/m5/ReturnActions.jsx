// ReturnActions - Owner: Member 5 - Requirement: 60 (and the way into Req 61)
// Props: { reservation, onDone(updatedReservation, message), onStale?(message) }
// For the lender of an active booking: "Returned in good condition" through Member 1's return command (it completes the
// booking, releases the deposit and charges any late fee through Member 2), and "Report damage", a link to Member 3's
// form, shown only once that page is part of the app (so it is never a broken link).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../../api/axios';
import { markReturned } from '../../../api/reservationLifecycle.api';
import { formatMoney } from '../../../utils/format';
import routes from '../../../routes/routeConfig';
import Alert from '../../common/Alert';
import s from '../../../styles/sprint2/member5.module.css';

// Member 3's damage form, if its route is registered (src/routes/sprint2/member3.routes.jsx once merged).
const DAMAGE_FORM = '/damage-reports/new';
const hasDamageForm = routes.some((route) => route.path === DAMAGE_FORM);

export default function ReturnActions({ reservation: r, onDone, onStale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (r.role !== 'lender' || r.status !== 'active') return null;

  const title = r.item?.title || 'this item';
  const who = r.borrower?.name || 'the borrower';
  const deposit = Number(r.deposit?.amount) || 0;
  const fee = r.lateFeeIfReturnedNow; // null until Member 2's module is installed
  const caseOpen = !r.actions?.returnGood && !r.actions?.reportDamage;

  const confirmText = () => {
    const parts = [`Mark "${title}" as returned in good condition by ${who}?`];
    if (deposit > 0) parts.push(`The deposit of ${formatMoney(deposit)} goes back to ${who}.`);
    if (fee > 0) parts.push(`It's late, so a late fee of ${formatMoney(fee)} is charged.`);
    else if (fee === null && r.flags?.returnOverdue) parts.push('It\'s late, so a late fee may be charged.');
    return parts.join(' ');
  };

  const mark = async () => {
    if (!window.confirm(confirmText())) return;
    setBusy(true);
    setError('');
    try {
      const { reservation } = await markReturned(r._id);
      onDone(reservation, `Returned in good condition. "${title}" is back and the booking is completed.`);
    } catch (e) {
      const message = getErrorMessage(e);
      if ([404, 409].includes(e?.response?.status) && onStale) {
        onStale(`${message.replace(/\.$/, '')}. This booking changed meanwhile; its current status is shown.`);
      } else setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (caseOpen) {
    return <p className={`muted ${s.answerNote}`}>A damage report is open for this booking. The deposit stays held until an admin decides.</p>;
  }

  return (
    <div className={s.answer} role="group" aria-label={`Return of ${title}`}>
      <Alert variant="error">{error}</Alert>
      {fee > 0 && <p className={s.penaltyNote}>Late: returning now adds a late fee of {formatMoney(fee)}.</p>}
      <div className="row">
        {r.actions?.returnGood && (
          <button type="button" className="btn" disabled={busy} onClick={mark} aria-label={`Mark ${title} as returned in good condition`}>
            {busy ? 'Saving...' : 'Returned in good condition'}
          </button>
        )}
        {r.actions?.reportDamage && hasDamageForm && (
          <Link to={`${DAMAGE_FORM}?reservation=${r._id}`} className="btn btn-secondary" aria-label={`Report damage to ${title}`}>Report damage</Link>
        )}
      </div>
      {!hasDamageForm && <p className={`muted ${s.answerNote}`}>If it came back damaged, don&apos;t mark it as returned in good condition. Reporting damage isn&apos;t available yet.</p>}
    </div>
  );
}
