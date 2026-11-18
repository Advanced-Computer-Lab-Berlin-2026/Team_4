// TrustSummary - Owner: Member 3 - Requirement: 91
// Props: { userId, compact?, hideLink? } — owner's trust score, rating and history. Member 7 embeds it on ItemDetailsPage.
// Public endpoint, so it also works for guests.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrustProfile } from '../../../api/trustProfiles.api';
import { Stars, trustBand } from './shared';
import styles from '../../../styles/sprint2/member3.module.css';

export default function TrustSummary({ userId, compact = false, hideLink = false }) {
  const [profile, setProfile] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    setProfile(null);
    setFailed(false);
    getTrustProfile(userId)
      .then((data) => active && setProfile(data.profile))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [userId]);

  if (!userId || failed) return <span className="muted">Trust score unavailable</span>;
  if (!profile) return <span className="muted" role="status">Loading trust score...</span>;

  const { trustScore, stats } = profile;
  const band = trustBand(trustScore);
  const rating = stats.ratingCount > 0
    ? <span><Stars value={stats.ratingAverage} /> {stats.ratingAverage.toFixed(1)} ({stats.ratingCount} review{stats.ratingCount === 1 ? '' : 's'})</span>
    : <span className="muted">No reviews yet</span>;
  const profileLink = hideLink ? null : <Link to={`/users/${profile.user._id}/trust`}>View trust profile</Link>;

  if (compact) {
    return (
      <div className={styles.trustCompact}>
        <strong>Trust score {trustScore}/100</strong>
        <span className={`badge badge-${band.tone}`}>{band.label}</span>
        {rating}
        {profileLink}
      </div>
    );
  }

  return (
    <div className={styles.trust}>
      <div className={styles.score} aria-label={`Trust score ${trustScore} out of 100`}>
        <span className={styles.scoreValue}>{trustScore}</span>
        <span className={styles.scoreOutOf}>out of 100</span>
      </div>
      <div className={styles.trustFacts}>
        <span className={`badge badge-${band.tone}`}>{band.label}</span>
        {rating}
        <span className="muted">
          {stats.completedReservations} completed reservation{stats.completedReservations === 1 ? '' : 's'}
          {stats.onTimeRate !== null && ` · ${Math.round(stats.onTimeRate * 100)}% returned on time`}
          {stats.upheldDamageReports > 0 && ` · ${stats.upheldDamageReports} upheld damage report${stats.upheldDamageReports === 1 ? '' : 's'}`}
        </span>
        {profileLink}
      </div>
    </div>
  );
}
