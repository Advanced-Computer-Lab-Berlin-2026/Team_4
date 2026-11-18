// TRUST PROFILE - Owner: Member 3 (Sprint 2) - Requirement: 91
// Route: /users/:userId/trust   Access: auth   (declared in src/routes/sprint2/member3.routes.jsx)
// A lender's or borrower's trust score and the reviews they have received.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import ReviewCard from '../../components/sprint2/m3/ReviewCard';
import TrustSummary from '../../components/sprint2/m3/TrustSummary';
import { getErrorMessage } from '../../api/axios';
import { getTrustProfile } from '../../api/trustProfiles.api';
import { listUserReviews } from '../../api/reviews.api';
import { formatDate } from '../../utils/format';
import styles from '../../styles/sprint2/member3.module.css';

export default function TrustProfilePage() {
  const { userId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');
  const [loadingReviews, setLoadingReviews] = useState(true);

  useEffect(() => {
    setProfile(null);
    setError('');
    getTrustProfile(userId).then((d) => setProfile(d.profile)).catch((err) => setError(getErrorMessage(err)));
  }, [userId]);

  useEffect(() => {
    setLoadingReviews(true);
    listUserReviews(userId, { page })
      .then(setReviews)
      .catch(() => setReviews(null))
      .finally(() => setLoadingReviews(false));
  }, [userId, page]);

  if (error) {
    return <div className="container"><h1>Trust profile</h1><Alert variant="error">{error}</Alert></div>;
  }
  if (!profile) return <div className="container"><Spinner /></div>;

  const { user } = profile;
  return (
    <div className="container">
      <h1>{user.name}</h1>
      <p className="muted">
        @{user.username}{user.isVerifiedLender && ' · Verified lender'} · Member since {formatDate(user.memberSince)}
      </p>

      <section className={`card ${styles.section}`} aria-labelledby="trust-heading">
        <div className="card-body">
          <h2 id="trust-heading">Trust score</h2>
          <TrustSummary userId={user._id} hideLink />
          <p className="muted">
            The score is based mostly on completed reservations, on-time returns and damage history. Ratings count for a smaller part.
          </p>
        </div>
      </section>

      <section aria-labelledby="reviews-heading">
        <h2 id="reviews-heading">Reviews received</h2>
        {loadingReviews && <Spinner />}
        {!loadingReviews && !reviews && <Alert variant="error">Could not load reviews.</Alert>}
        {!loadingReviews && reviews?.items.length === 0 && <p className="muted">No reviews yet.</p>}
        {!loadingReviews && reviews?.items.length > 0 && (
          <>
            <div className={styles.reviewList}>
              {reviews.items.map((r) => <ReviewCard key={r._id} review={r} show="reviewer" />)}
            </div>
            <Pagination page={reviews.page} pages={reviews.pages} onChange={(p) => setParams({ page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
