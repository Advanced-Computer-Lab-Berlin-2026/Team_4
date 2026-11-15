// ReviewCard - Owner: Member 3 - Requirements: 91, 97 — one review in a list.
// Props: { review, show: 'reviewer' | 'reviewee' }
import { formatDate } from '../../../utils/format';
import { Stars, personName } from './shared';
import styles from '../../../styles/sprint2/member3.module.css';

export default function ReviewCard({ review, show = 'reviewer' }) {
  const who = show === 'reviewee' ? `To ${personName(review.reviewee)}` : `From ${personName(review.reviewer)}`;
  const role = review.direction === 'borrower_to_lender' ? 'as lender' : 'as borrower';
  return (
    <article className="card">
      <div className="card-body">
        <div className={styles.reviewHead}>
          <Stars value={review.rating} />
          <span className="muted">{formatDate(review.createdAt)}</span>
        </div>
        <div className="muted">
          {who} · reviewed {role}{review.item ? ` · ${review.item.title}` : ''}
        </div>
        {review.comment
          ? <p className={styles.reviewComment}>{review.comment}</p>
          : <p className={`muted ${styles.reviewComment}`}>No comment.</p>}
      </div>
    </article>
  );
}
