// MY REVIEWS - Owner: Member 3 (Sprint 2) - Requirements: 89, 90, 97
// Route: /reviews/mine   Access: member   (declared in src/routes/sprint2/member3.routes.jsx)
// Own trust score, reservations waiting for a review, and reviews given/received.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import ReviewCard from '../../components/sprint2/m3/ReviewCard';
import ReviewForm from '../../components/sprint2/m3/ReviewForm';
import TrustSummary from '../../components/sprint2/m3/TrustSummary';
import { getErrorMessage } from '../../api/axios';
import { listMyReviews, listPendingReviews } from '../../api/reviews.api';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/format';
import styles from '../../styles/sprint2/member3.module.css';

const TABS = [['received', 'Received'], ['given', 'Given']];

export default function MyReviewsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') === 'given' ? 'given' : 'received';
  const page = Number(params.get('page')) || 1;

  const [pending, setPending] = useState([]);
  const [openForm, setOpenForm] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trustKey, setTrustKey] = useState(0); // remount TrustSummary after posting

  const loadPending = useCallback(() => listPendingReviews().then((d) => setPending(d.items)).catch(() => setPending([])), []);
  useEffect(() => { loadPending(); }, [loadPending]);

  useEffect(() => {
    setLoading(true);
    setError('');
    listMyReviews({ type, page })
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [type, page, trustKey]);

  const onPosted = () => {
    setOpenForm(null);
    loadPending();
    setTrustKey((k) => k + 1);
  };

  return (
    <div className="container">
      <h1>My reviews</h1>

      <section className={`card ${styles.section}`} aria-labelledby="my-trust">
        <div className="card-body">
          <h2 id="my-trust">My trust score</h2>
          {user && <TrustSummary key={trustKey} userId={user._id} />}
        </div>
      </section>

      {pending.length > 0 && (
        <section className={styles.section} aria-labelledby="to-review">
          <h2 id="to-review">Waiting for your review</h2>
          <div className={styles.reviewList}>
            {pending.map((p) => (
              <article key={p.reservationId} className="card">
                <div className="card-body">
                  <div className={styles.pendingItem}>
                    <div>
                      <strong>{p.item?.title || 'Reservation'}</strong>
                      <div className="muted">
                        {p.direction === 'borrower_to_lender' ? 'Lender' : 'Borrower'}: {p.otherParty?.name} · review by {formatDate(p.reviewBy)}
                      </div>
                    </div>
                    {openForm !== p.reservationId && (
                      <button type="button" className="btn btn-secondary" onClick={() => setOpenForm(p.reservationId)}>Write a review</button>
                    )}
                  </div>
                  {openForm === p.reservationId && (
                    <div className={styles.section}>
                      <ReviewForm reservationId={p.reservationId} pending={p} onSuccess={onPosted} />
                      <button type="button" className="btn btn-link" onClick={() => setOpenForm(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-reviews">
        <h2 id="all-reviews">Reviews</h2>
        <div className="tabs" role="tablist">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={type === value}
              className={`tab ${type === value ? 'active' : ''}`}
              onClick={() => setParams({ type: value })}
            >
              {label}
            </button>
          ))}
        </div>

        <Alert variant="error">{error}</Alert>
        {loading && <Spinner />}
        {!loading && !error && data?.items.length === 0 && (
          <p className="muted">
            {type === 'given' ? "You haven't reviewed anyone yet." : 'Nobody has reviewed you yet. Reviews appear after completed reservations.'}
          </p>
        )}
        {!loading && data?.items.length > 0 && (
          <>
            <div className={styles.reviewList}>
              {data.items.map((r) => <ReviewCard key={r._id} review={r} show={type === 'given' ? 'reviewee' : 'reviewer'} />)}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(p) => setParams({ type, page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
