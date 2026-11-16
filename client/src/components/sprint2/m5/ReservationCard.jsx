// ReservationCard - Owner: Member 5 - Requirements: 53, 54
// Props: { reservation, children? } - children = buttons under the card (the lender's answer). One booking in My reservations or Booking requests: item, status, dates, the other person,
// deposit, what's next. Opening it remembers the list (and its filters) so the details page can link straight back.
import { Link, useLocation } from 'react-router-dom';
import { formatMoney } from '../../../utils/format';
import { dayCount, showRange } from './borrowDates';
import { depositText, labelsOf, nextStep, statusOf } from './reservationText';
import s from '../../../styles/sprint2/member5.module.css';

export default function ReservationCard({ reservation: r, children }) {
  const location = useLocation();
  // The details page links back to this exact list, filters included.
  const from = { from: `${location.pathname}${location.search}`, fromLabel: location.pathname.startsWith('/lender/') ? 'Booking requests' : 'My reservations' };
  const title = r.item?.title || 'Unavailable item';
  const status = statusOf(r);
  const other = r.role === 'lender' ? { label: 'Borrower', person: r.borrower } : { label: 'Lender', person: r.lender };
  const url = `/reservations/${r._id}`;
  return (
    <li>
      <article className={`card ${s.resCard}`} aria-label={title}>
        <Link to={url} state={from} className={s.thumb} tabIndex={-1} aria-hidden="true">
          <img src={r.item?.photo || '/uploads/placeholder.svg'} alt="" loading="lazy" />
        </Link>
        <div className={s.resBody}>
          <div className={s.resHead}>
            <h3 className={s.entryTitle}><Link to={url} state={from}>{title}</Link></h3>
            <span className={`badge badge-${status.tone} ${s.badge} ${s.statusBadge}`}>{status.label}</span>
          </div>
          <p className={s.resDates}>{showRange(r.startDate, r.endDate)} <span className={s.days}>· {dayCount(r.days)}</span></p>
          <p className={s.resNext}>{nextStep(r)}</p>
          {labelsOf(r).length > 0 && (
            <ul className={s.labels} aria-label="Notes">
              {labelsOf(r).map((l) => <li key={l.key} className={`badge badge-${l.tone} ${s.badge}`}>{l.text}</li>)}
            </ul>
          )}
          <dl className={s.resFacts}>
            <div><dt>{other.label}</dt><dd>{other.person?.name || 'Unknown'}</dd></div>
            <div><dt>Deposit</dt><dd>{formatMoney(r.deposit?.amount)} <span className="muted">· {depositText(r.deposit)}</span></dd></div>
          </dl>
          {children}
        </div>
      </article>
    </li>
  );
}
