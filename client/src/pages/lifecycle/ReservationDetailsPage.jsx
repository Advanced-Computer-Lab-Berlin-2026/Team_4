// RESERVATION DETAILS - Owner: Member 5 - Requirements: 53 (and the screen for 56-60, 74, 75 in later parts)
// Route: /reservations/:id   Access: member (the borrower or the lender of this booking; the server checks)
// Status, progress, dates, deposit, the other person and any extension request. The lender answers a pending request
// here (Req 56), marks the pickup (Req 59) and the return (Req 60), and answers requests for more time (Req 75);
// the borrower asks for more time here (Req 74). Messages and cancellation are Member 1's page (/my-reservations/:id).
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { getReservation } from '../../api/reservationLifecycle.api';
import { formatDate, formatMoney } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import ReservationTimeline from '../../components/sprint2/m5/ReservationTimeline';
import RequestAnswer from '../../components/sprint2/m5/RequestAnswer';
import PickupButton from '../../components/sprint2/m5/PickupButton';
import ReturnActions from '../../components/sprint2/m5/ReturnActions';
import ExtensionRequest from '../../components/sprint2/m5/ExtensionRequest';
import ExtensionAnswer from '../../components/sprint2/m5/ExtensionAnswer';
import DeliveryStatusPanel from '../../components/sprint2/m6/DeliveryStatusPanel';
import { dayCount, showDay, showRange } from '../../components/sprint2/m5/borrowDates';
import { OPEN_STATUSES, depositText, labelsOf, nextStep, statusOf } from '../../components/sprint2/m5/reservationText';
import s from '../../styles/sprint2/member5.module.css';

const {
  '../../components/sprint2/m3/ConditionPhotoPanel.jsx': ConditionPhotoPanel,
  '../../components/sprint2/m3/ReviewForm.jsx': ReviewForm,
  '../../components/sprint2/m3/TrustSummary.jsx': TrustSummary,
} = import.meta.glob([
  '../../components/sprint2/m3/ConditionPhotoPanel.jsx',
  '../../components/sprint2/m3/ReviewForm.jsx',
  '../../components/sprint2/m3/TrustSummary.jsx',
], { eager: true, import: 'default' });

const EXTENSION = { pending: 'Waiting for the lender', approved: 'Approved', rejected: 'Declined', cancelled: 'Withdrawn', expired: 'Not answered in time' };
const EXTENSION_FOR_LENDER = { ...EXTENSION, pending: 'Waiting for your answer', rejected: 'You declined it' };
// Where the back link goes when the page wasn't opened from a list (typed address, reload): the viewer's own list.
const HOME = { borrower: { to: '/reservations', label: 'My reservations' }, lender: { to: '/lender/reservations', label: 'Booking requests' } };

export default function ReservationDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const cameFrom = typeof location.state?.from === 'string' && location.state.from.startsWith('/') ? { to: location.state.from, label: location.state.fromLabel || 'Back' } : null;
  const [r, setR] = useState(null);
  const [error, setError] = useState({ text: '', notFound: false });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  // Quiet refresh after an action was refused because the booking changed elsewhere: no loading screen, message kept.
  const refresh = () => { getReservation(id).then((d) => setR(d.reservation)).catch((e) => setProblem(getErrorMessage(e))); };

  useEffect(() => {
    let ignore = false;
    setProblem('');
    setNotice('');
    setR(null);
    setError({ text: '', notFound: false });
    getReservation(id)
      .then((d) => { if (!ignore) setR(d.reservation); })
      .catch((e) => {
        if (ignore) return;
        const code = e?.response?.status;
        setError({ text: getErrorMessage(e), notFound: code === 404 || code === 400 });
      });
    return () => { ignore = true; };
  }, [id, reloadKey]);

  const home = cameFrom || (r ? HOME[r.role] : HOME.borrower);
  const back = <p className={s.backLink}><Link to={home.to}>← {home.label}</Link></p>;

  if (error.text) {
    return (
      <div className="container">
        {back}
        {error.notFound ? (
          <div className={`center ${s.empty}`}>
            <h1>Reservation not found</h1>
            <p className="muted">It doesn&apos;t exist, or it isn&apos;t one of your bookings.</p>
            <Link to={home.to} className="btn">{home.label}</Link>
          </div>
        ) : (
          <div className={s.loadError}>
            <Alert variant="error">{error.text}</Alert>
            <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
          </div>
        )}
      </div>
    );
  }
  if (!r) return <Spinner label="Loading the reservation..." />;

  const title = r.item?.title || 'Unavailable item';
  const status = statusOf(r);
  const lender = r.role === 'lender';
  const delivery = r.fulfilment?.method === 'delivery';
  const other = lender ? { label: 'Borrower', person: r.borrower } : { label: 'Lender', person: r.lender };
  const labels = labelsOf(r);
  const open = OPEN_STATUSES.includes(r.status);

  return (
    <div className="container">
      {back}
      <div className={s.detailHead}>
        <h1 className={s.detailTitle}>{title}</h1>
        <span className={`badge badge-${status.tone} ${s.badge} ${s.statusBadge}`}>{status.label}</span>
      </div>
      <p className={`muted ${s.lead}`}>{lender ? 'A booking of your item.' : 'Your booking.'} {nextStep(r)}</p>
      {labels.length > 0 && (
        <ul className={s.labels} aria-label="Notes">
          {labels.map((l) => <li key={l.key} className={`badge badge-${l.tone} ${s.badge}`}>{l.text}</li>)}
        </ul>
      )}

      <Alert variant="success">{notice}</Alert>
      <Alert variant="error">{problem}</Alert>
      {lender && (r.actions?.approve || r.actions?.reject) && (
        <section className={`card ${s.answerCard}`} aria-labelledby="res-answer-title">
          <div className="card-body">
            <h2 id="res-answer-title" className={s.cardTitle}>Answer this request</h2>
            <RequestAnswer reservation={r} onStale={(message) => { setNotice(''); setProblem(message); refresh(); }}
              onDone={(updated, message) => { setR(updated); setProblem(''); setNotice(message); }} />
          </div>
        </section>
      )}

      {lender && !delivery && r.status === 'confirmed' && !r.flags?.pickupMissed && (
        <section className={`card ${s.answerCard}`} aria-labelledby="res-pickup-title">
          <div className="card-body">
            <h2 id="res-pickup-title" className={s.cardTitle}>Pickup</h2>
            <PickupButton reservation={r} onStale={(message) => { setNotice(''); setProblem(message); refresh(); }}
              onDone={(updated, message) => { setR(updated); setProblem(''); setNotice(message); }} />
          </div>
        </section>
      )}

      {lender && r.actions?.decideExtension && (
        <section className={`card ${s.answerCard}`} aria-labelledby="res-extanswer-title">
          <div className="card-body">
            <h2 id="res-extanswer-title" className={s.cardTitle}>Request for more time</h2>
            <ExtensionAnswer reservation={r} onStale={(message) => { setNotice(''); setProblem(message); refresh(); }}
              onDone={(updated, message) => { setR(updated); setProblem(''); setNotice(message); }} />
          </div>
        </section>
      )}
      {!lender && r.status === 'active' && (
        <section className={`card ${s.answerCard}`} aria-labelledby="res-extask-title">
          <div className="card-body">
            <h2 id="res-extask-title" className={s.cardTitle}>Need it longer?</h2>
            <ExtensionRequest reservation={r} onStale={(message) => { setNotice(''); setProblem(message); refresh(); }}
              onDone={(updated, message) => { setR(updated); setProblem(''); setNotice(message); }} />
          </div>
        </section>
      )}
      {lender && r.status === 'active' && (
        <section className={`card ${s.answerCard}`} aria-labelledby="res-return-title">
          <div className="card-body">
            <h2 id="res-return-title" className={s.cardTitle}>Return</h2>
            <ReturnActions reservation={r} onStale={(message) => { setNotice(''); setProblem(message); refresh(); }}
              onDone={(updated, message) => { setR(updated); setProblem(''); setNotice(message); }} />
          </div>
        </section>
      )}

      <div className={s.detailLayout}>
        <div className={s.detailMain}>
          <section className="card" aria-labelledby="res-progress-title">
            <div className="card-body">
              <h2 id="res-progress-title" className={s.cardTitle}>Progress</h2>
              <ReservationTimeline reservation={r} />
            </div>
          </section>

          {delivery && <DeliveryStatusPanel reservationId={r._id} onChange={refresh} />}
          {ConditionPhotoPanel && ['confirmed', 'active', 'completed'].includes(r.status) && (
            <ConditionPhotoPanel key={`photos-${r._id}`} reservationId={r._id} readOnly={!lender} onChange={refresh} />
          )}
          {ReviewForm && r.status === 'completed' && (
            <ReviewForm key={`review-${r._id}`} reservationId={r._id} otherPartyName={other.person?.name} />
          )}

          {/* while the booking is active, the extension cards above already show the request */}
          {r.status !== 'active' && r.extension?.status && r.extension.status !== 'none' && (
            <section className="card" aria-labelledby="res-ext-title">
              <div className="card-body">
                <h2 id="res-ext-title" className={s.cardTitle}>Extension request</h2>
                <dl className={s.summaryFacts}>
                  <div><dt>New return date asked</dt><dd>{r.extension.requestedEndDate ? showDay(r.extension.requestedEndDate) : '—'}</dd></div>
                  <div><dt>Answer</dt><dd>{(lender ? EXTENSION_FOR_LENDER : EXTENSION)[r.extension.status] || r.extension.status}</dd></div>
                  {r.extension.decidedAt && <div><dt>Answered on</dt><dd>{formatDate(r.extension.decidedAt)}</dd></div>}
                </dl>
              </div>
            </section>
          )}
        </div>

        <aside className={`card ${s.detailSide}`} aria-labelledby="res-facts-title">
          <div className={s.detailPhoto}>
            <img src={r.item?.photo || '/uploads/placeholder.svg'} alt={r.item ? title : ''} />
          </div>
          <div className="card-body">
            <h2 id="res-facts-title" className={s.cardTitle}>Details</h2>
            <dl className={s.summaryFacts}>
              <div><dt>Dates</dt><dd>{showRange(r.startDate, r.endDate)}</dd></div>
              <div><dt>Length</dt><dd>{dayCount(r.days)}</dd></div>
              <div><dt>Return date</dt><dd>{showDay(r.endDate)}</dd></div>
              <div><dt>{other.label}</dt><dd>{other.person?.name || 'Unknown'}</dd></div>
              <div><dt>Handover</dt><dd>{r.fulfilment?.method === 'delivery' ? 'Delivery' : 'Pickup'}</dd></div>
              {r.item?.category?.name && <div><dt>Category</dt><dd>{r.item.category.name}</dd></div>}
              <div className={s.summaryTotal}><dt>Deposit</dt><dd>{formatMoney(r.deposit?.amount)}</dd></div>
              <div><dt>Deposit status</dt><dd>{depositText(r.deposit)}</dd></div>
              {r.lateFee > 0 && <div><dt>Late fee</dt><dd className={s.penalty}>{formatMoney(r.lateFee)}</dd></div>}
            </dl>
            {TrustSummary && other.person?._id && <TrustSummary userId={other.person._id} compact />}
            <div className={s.summaryActions}>
              {/* the lender edits their own item (works even when archived); a borrower sees the public page only when it exists */}
              {r.item && lender && <Link to={`/lender/items/${r.item._id}/edit`} className="btn btn-secondary">Edit item</Link>}
              {r.item && !lender && r.item.available && <Link to={`/catalog/${r.item._id}`} className="btn btn-secondary">View item</Link>}
              {/* only the borrower can cancel (Member 1's rule); both can message */}
              <Link to={`/my-reservations/${r._id}`} className="btn btn-secondary">{open && !lender ? 'Messages and cancellation' : 'Messages'}</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
