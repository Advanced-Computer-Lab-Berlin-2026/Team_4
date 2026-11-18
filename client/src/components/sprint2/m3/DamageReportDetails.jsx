// DamageReportDetails - Owner: Member 3 - Requirements: 61-64, 80
// Props: { report } — read-only case view shared by DamageReportPage (participants) and AdminDamageDecisionPage.
import { formatDateTime, formatMoney } from '../../../utils/format';
import ConditionPhotoPanel from './ConditionPhotoPanel';
import { DamageStatusBadge, personName } from './shared';
import styles from '../../../styles/sprint2/member3.module.css';

export default function DamageReportDetails({ report }) {
  const { reservation, decision, dispute, resolution } = report;
  const steps = [
    { done: true, title: `Reported by ${personName(report.reportedBy)}`, when: report.createdAt, body: report.description },
    decision
      ? { done: true, title: `Decision: ${formatMoney(decision.forfeitAmount)} kept from the deposit`, when: decision.decidedAt, body: decision.note, by: decision.decidedBy }
      : { done: false, title: 'Waiting for an admin decision' },
  ];
  if (dispute) steps.push({ done: true, title: 'Disputed by the borrower', when: dispute.at, body: dispute.reason });
  if (resolution) {
    steps.push({ done: true, title: `Final outcome: ${formatMoney(resolution.finalForfeitAmount)} kept`, when: resolution.resolvedAt, body: resolution.note, by: resolution.resolvedBy });
  } else if (dispute) {
    steps.push({ done: false, title: 'Waiting for an admin to resolve the dispute' });
  }

  return (
    <>
      <section className={`card ${styles.section}`}>
        <div className="card-body">
          <dl className={styles.facts}>
            <dt>Status</dt><dd><DamageStatusBadge status={report.status} /></dd>
            <dt>Item</dt><dd>{report.item?.title || 'Item'}</dd>
            <dt>Lender</dt><dd>{personName(report.reportedBy)}</dd>
            <dt>Borrower</dt><dd>{personName(report.borrower)}</dd>
            {reservation?.startDate && (
              <><dt>Reservation</dt><dd>{formatDateTime(reservation.startDate)} to {formatDateTime(reservation.endDate)}</dd></>
            )}
            {reservation?.returnedAt && <><dt>Returned</dt><dd>{formatDateTime(reservation.returnedAt)}</dd></>}
            {reservation?.deposit && (
              <><dt>Deposit</dt><dd>{formatMoney(reservation.deposit.amount)} <span className="muted">({reservation.deposit.status})</span></dd></>
            )}
            {report.status === 'decided' && report.disputeDeadline && decision?.forfeitAmount > 0 && (
              <><dt>Dispute until</dt><dd>{formatDateTime(report.disputeDeadline)}</dd></>
            )}
          </dl>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">History</h2>
        <ol className={styles.timeline}>
          {steps.map((s, i) => (
            <li key={i} className={s.done ? styles.timelineDone : ''}>
              <strong>{s.title}</strong>
              {s.when && <div className="muted">{formatDateTime(s.when)}{s.by ? ` · ${s.by.name}` : ''}</div>}
              {s.body && <p className={styles.reviewComment}>{s.body}</p>}
            </li>
          ))}
        </ol>
      </section>

      {reservation?._id && (
        <section className={styles.section} aria-labelledby="photos-heading">
          <h2 id="photos-heading">Condition photos</h2>
          <p className="muted">Compare the photos taken at pickup with those taken at return. Select a photo to open it full size.</p>
          <ConditionPhotoPanel reservationId={reservation._id} readOnly />
        </section>
      )}
    </>
  );
}
