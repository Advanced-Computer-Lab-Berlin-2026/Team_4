import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { captureReferral, getMyReferrals, recordReferralShare } from '../../api/referrals.api';
import styles from '../../styles/sprint2/member9.module.css';

export default function MyReferralsPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const captureAttempt = useRef(false);
  const shareKey = useRef(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      let captureError = '';
      try {
        const code = searchParams.get('ref');
        if (code && !captureAttempt.current) {
          captureAttempt.current = true;
          await captureReferral(code);
          if (active) {
            setMessage('Referral linked to your account.');
            navigate('/referrals', { replace: true });
          }
        }
      } catch (err) {
        captureError = getErrorMessage(err);
      }
      try {
        const result = await getMyReferrals();
        if (active) {
          setSummary(result);
          setError(captureError);
        }
      } catch (err) {
        if (active) setError(captureError || getErrorMessage(err));
      }
    }
    load();
    return () => { active = false; };
  }, [searchParams, navigate]);

  async function copyLink() {
    setCopying(true);
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(new URL(summary.referralLink, window.location.origin).toString());
      setMessage('Referral link copied.');
      shareKey.current ??= globalThis.crypto.randomUUID();
      await recordReferralShare(shareKey.current);
      shareKey.current = null;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCopying(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1>My referrals</h1>
      <p className={styles.muted}>Your reward is credited after a referred member completes their first reservation.</p>
      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{message}</Alert>
      {!summary && !error && <Spinner />}
      {summary && (
        <>
          <section className={styles.referralShare}>
            <div><strong>Your referral link</strong><code>{new URL(summary.referralLink, window.location.origin).toString()}</code></div>
            <button type="button" className={styles.primaryButton} onClick={copyLink} disabled={copying}>Copy link</button>
          </section>
          <section className={styles.summaryGrid} aria-label="Referral summary">
            <div><span>Referrals</span><strong>{summary.total}</strong></div>
            <div><span>Completed conversions</span><strong>{summary.converted}</strong></div>
            <div><span>Credits issued</span><strong>{(summary.totalCreditsMinor / 100).toFixed(2)} {summary.currency}</strong></div>
          </section>
          <h2>Referral activity</h2>
          {summary.items.length === 0
            ? <p className={styles.emptyState}>No referrals have registered with your link yet.</p>
            : <ul className={styles.referralList}>{summary.items.map((item) => (
              <li key={item._id}>
                <span>{item.referee?.name || 'Member'} <small>{item.createdAt && new Date(item.createdAt).toLocaleDateString()}</small></span>
                <span className={styles.status}>{item.status}</span>
                {item.status === 'converted' && <strong>{(item.creditAmountMinor / 100).toFixed(2)} {summary.currency}</strong>}
              </li>
            ))}</ul>}
        </>
      )}
    </main>
  );
}
