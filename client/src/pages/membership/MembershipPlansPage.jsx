// MEMBERSHIP - Owner: Member 8 - Requirements: 83, 84, 85, 86, 87
// Route: /membership   Access: member   (declared in src/routes/sprint2/member8.routes.jsx)
// One page: current tier and renewal date (86), tier options (83), subscribe and pay (84, 85), cancel (87).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelSubscription, getMyMembership, listTiers, subscribe } from '../../api/memberships.api';
import { getErrorMessage } from '../../api/axios';
import { formatDate, formatMoney } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import StatusBadge from '../../components/common/StatusBadge';
import PaymentMethodPicker from '../../components/sprint2/m2/PaymentMethodPicker';
import { useAuth } from '../../context/AuthContext';
import styles from '../../styles/sprint2/member8.module.css';

// A payment attempt keeps one operation key until it finishes, so a retry or a return from the
// card provider can never be charged twice. It survives the redirect in sessionStorage.
const ATTEMPT_KEY = 'shareshed.membership.attempt';

function readAttempt(storageKey) {
  try {
    const attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    return attempt?.tierId && attempt?.method && attempt?.operationKey ? attempt : null;
  } catch {
    return null;
  }
}

function writeAttempt(storageKey, attempt) {
  try {
    if (attempt) sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Storage can be blocked; the page still works for wallet payments.
  }
}

function newOperationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const isWebUrl = (url) => /^https?:\/\//i.test(String(url || ''));

const PRIORITY_LABEL = { 1: 'Top waitlist priority', 2: 'Second waitlist priority' };

function perks(tier) {
  return [
    tier.depositDiscountPercent > 0 ? `${tier.depositDiscountPercent}% lower deposits` : 'Standard deposits',
    PRIORITY_LABEL[tier.waitlistPriority] || 'Standard waitlist priority',
    `Up to ${tier.maxConcurrentReservations} reservations at a time`,
  ];
}

function discountText(entitlements) {
  const { discountPercent, discountSource } = entitlements;
  if (!discountPercent) return 'None';
  if (discountSource?.type === 'household') {
    return `${discountPercent}% from ${discountSource.name || 'a household member'} (${discountSource.tierName})`;
  }
  return `${discountPercent}% from your ${discountSource?.tierName || ''} tier`.replace('  ', ' ');
}

export default function MembershipPlansPage() {
  const { user } = useAuth();
  const accountId = user?._id || user?.id;
  return <MembershipPlans key={accountId} storageKey={`${ATTEMPT_KEY}:${accountId}`} />;
}

function MembershipPlans({ storageKey }) {
  const mounted = useRef(true);
  const payRef = useRef(null);
  const [tiers, setTiers] = useState([]);
  const [methods, setMethods] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [choice, setChoice] = useState(null); // { tierId, method, operationKey }
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [cardUrl, setCardUrl] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      const [tierData, mineData] = await Promise.all([listTiers(), getMyMembership()]);
      if (!mounted.current) return;
      setTiers(tierData.items || []);
      setMethods(tierData.paymentMethods || []);
      setMine(mineData);
      setLoadError('');
    } catch (err) {
      if (mounted.current) setLoadError(getErrorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const pay = useCallback(async (selected, { resume = false } = {}) => {
    const attempt = { tierId: selected.tierId, method: selected.method, operationKey: selected.operationKey };
    setBusy(true);
    setCardUrl('');
    setError('');
    setSuccess('');
    const saved = { ...attempt, awaitingCard: attempt.method === 'card' };
    writeAttempt(storageKey, saved);
    try {
      const result = await subscribe(attempt);
      if (!mounted.current) return;
      if (result.payment) {
        const url = isWebUrl(result.payment.redirectUrl) ? result.payment.redirectUrl : '';
        if (url && !resume) {
          window.location.assign(url);
          return;
        }
        setChoice(saved);
        setCardUrl(url);
        setPending(true);
        return;
      }
      writeAttempt(storageKey, null);
      setChoice(null);
      setPending(false);
      setMine(result);
      setSuccess(`You are now on ${result.membership.tier?.name}. It renews on ${formatDate(result.membership.renewsAt)}.`);
    } catch (err) {
      if (!mounted.current) return;
      const status = err?.response?.status;
      const cardEnded = err?.response?.data?.errors?.some(({ code }) => code === 'card_not_completed');
      if (cardEnded || (attempt.method === 'wallet' && status && status < 500)) {
        writeAttempt(storageKey, null);
        setChoice(null);
        setPending(false);
      } else {
        setChoice(saved);
        setPending(attempt.method === 'card');
      }
      setError(getErrorMessage(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    load().then(() => {
      if (!active) return;
      const attempt = readAttempt(storageKey);
      if (attempt?.awaitingCard) pay(attempt, { resume: true });
    });
    return () => { active = false; mounted.current = false; };
  }, [load, pay, storageKey]);

  // The payment form opens above the tier cards: bring it into view and move focus to it,
  // otherwise choosing a tier further down the page looks like nothing happened.
  const openTierId = choice?.tierId;
  useEffect(() => {
    const panel = payRef.current;
    if (!openTierId || !panel) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    panel.focus({ preventScroll: true });
  }, [openTierId, loading]);

  function choose(tier) {
    const saved = readAttempt(storageKey);
    setError('');
    setSuccess('');
    setPending(false);
    setConfirmCancel(false);
    if (saved?.awaitingCard) {
      setChoice(saved);
      setPending(true);
      return;
    }
    setChoice(saved?.tierId === tier.id ? saved : { tierId: tier.id, method: methods[0], operationKey: newOperationKey() });
  }

  function changeMethod(method) {
    // A different method is a different payment, so it gets its own key.
    setChoice((current) => ({ ...current, method, operationKey: newOperationKey() }));
    setPending(false);
  }

  function closePayment() {
    setChoice(null);
    setPending(false);
    setError('');
  }

  async function cancel() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await cancelSubscription();
      if (!mounted.current) return;
      setMine(result);
      setConfirmCancel(false);
      setSuccess(`Subscription cancelled. Your benefits stay until ${formatDate(result.membership.renewsAt)}.`);
    } catch (err) {
      if (mounted.current) setError(getErrorMessage(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (loading) return <div className="container"><Spinner label="Loading membership..." /></div>;
  if (loadError || !mine) {
    return (
      <div className="container">
        <h1>Membership</h1>
        <Alert variant="error">{loadError || 'Membership could not be loaded.'}</Alert>
        <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); load(); }}>Try again</button>
      </div>
    );
  }

  const { membership, entitlements, usage } = mine;
  const currentTierId = membership.tier?.id;
  const paid = Boolean(membership.renewsAt);
  const chosenTier = choice ? tiers.find((tier) => tier.id === choice.tierId) : null;
  const showPayment = choice && (pending || chosenTier);

  const actionLabel = (tier) => {
    if (tier.id !== currentTierId) return paid ? `Switch to ${tier.name}` : `Subscribe to ${tier.name}`;
    return membership.cancelAtPeriodEnd ? `Resubscribe to ${tier.name}` : 'Renew for another year';
  };

  return (
    <div className="container">
      <h1>Membership</h1>

      <Alert variant="success">{success}</Alert>
      {!showPayment && <Alert variant="error">{error}</Alert>}

      <section className={styles.current} aria-labelledby="m8-current">
        <div className={styles.currentHeader}>
          <h2 id="m8-current">Your tier: {membership.tier?.name || 'Basic'}</h2>
          {paid && (
            <StatusBadge status={membership.cancelAtPeriodEnd ? 'pending' : 'active'}>
              {membership.cancelAtPeriodEnd ? 'Cancelled' : 'Active'}
            </StatusBadge>
          )}
          {membership.status === 'expired' && <StatusBadge status="none">Expired</StatusBadge>}
        </div>

        {membership.status === 'expired' && (
          <p className={styles.note}>Your paid tier has ended, so you are back on Basic. Subscribe below to get your benefits back.</p>
        )}

        <dl className={styles.facts}>
          <div>
            <dt>{membership.cancelAtPeriodEnd ? 'Benefits end on' : 'Renewal date'}</dt>
            <dd>{paid ? formatDate(membership.renewsAt) : 'No renewal — Basic is free'}</dd>
          </div>
          <div>
            <dt>Deposit discount</dt>
            <dd>{discountText(entitlements)}</dd>
          </div>
          <div>
            <dt>Reservations in use</dt>
            <dd>{usage.limit == null ? `${usage.counted}` : `${usage.counted} of ${usage.limit}`}</dd>
          </div>
          <div>
            <dt>Waitlist priority</dt>
            <dd>{PRIORITY_LABEL[entitlements.waitlistPriority]?.replace(' waitlist priority', '') || 'Standard'}</dd>
          </div>
        </dl>

        <p className={styles.note}>
          Pending, confirmed and active reservations count toward your limit.{' '}
          <Link to="/household">Household members</Link> with an accepted link share the best available deposit discount and waitlist priority.
        </p>

        {paid && !membership.cancelAtPeriodEnd && (
          <div className={styles.actions}>
            {confirmCancel ? (
              <>
                <span>Cancel your subscription? You keep your benefits until {formatDate(membership.renewsAt)}. No refund is made.</span>
                <button type="button" className="btn btn-danger" onClick={cancel} disabled={busy}>
                  {busy ? 'Cancelling...' : 'Yes, cancel subscription'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>
                  Keep subscription
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => { setConfirmCancel(true); setChoice(null); }}>
                Cancel subscription
              </button>
            )}
          </div>
        )}
      </section>

      {showPayment && (
        <section ref={payRef} tabIndex={-1} className={styles.pay} aria-labelledby="m8-pay">
          <h2 id="m8-pay">{chosenTier ? `${chosenTier.name} — ${formatMoney(chosenTier.annualFee)} for one year` : 'Card payment'}</h2>
          <Alert variant="error">{error}</Alert>
          {pending ? (
            <>
              <p role="status">Your card payment has not been confirmed yet. You will not be charged twice.</p>
              <div className={styles.actions}>
                <button type="button" className="btn" onClick={() => pay(choice, { resume: true })} disabled={busy}>
                  {busy ? 'Checking...' : 'Check payment again'}
                </button>
                {cardUrl && <a className="btn btn-secondary" href={cardUrl}>Continue to Stripe</a>}
                <button type="button" className="btn btn-secondary" onClick={closePayment} disabled={busy}>Close</button>
              </div>
            </>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); pay(choice); }}>
              <PaymentMethodPicker amountMinor={Math.round(chosenTier.annualFee * 100)} methods={methods}
                value={choice.method} onChange={changeMethod} disabled={busy} showReservationPolicy={false} />
              <p className={styles.note}>
                {chosenTier.id === currentTierId && paid
                  ? `This adds one year after ${formatDate(membership.renewsAt)}.`
                  : paid
                    ? 'Your new year starts today. The time left on your current tier is not credited.'
                    : 'Your year starts as soon as the payment succeeds.'}
              </p>
              <div className={styles.actions}>
                <button type="submit" className="btn" disabled={busy || !methods.includes(choice.method)}>
                  {busy ? 'Processing...' : `Pay ${formatMoney(chosenTier.annualFee)}`}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closePayment} disabled={busy}>Back</button>
              </div>
            </form>
          )}
        </section>
      )}

      <h2>Tier options</h2>
      {!methods.length && <p role="status">Membership payments are temporarily unavailable.</p>}
      {tiers.length === 0 ? (
        <Alert variant="info">No membership tiers are available right now.</Alert>
      ) : (
        <ul className={styles.plans}>
          {tiers.map((tier) => {
            const isCurrent = tier.id === currentTierId;
            return (
              <li key={tier.id} className={`${styles.plan} ${isCurrent ? styles.planCurrent : ''}`}>
                <div className={styles.planHeader}>
                  <h3>{tier.name}</h3>
                  {isCurrent && <span className="badge badge-green">Your tier</span>}
                </div>
                <div className={styles.price}>
                  {tier.annualFee > 0 ? <>{formatMoney(tier.annualFee)} <small>per year</small></> : 'Free'}
                </div>
                <ul className={styles.perks}>
                  {perks(tier).map((perk) => <li key={perk}>{perk}</li>)}
                </ul>
                {tier.annualFee > 0 ? (
                  <button type="button" className="btn" onClick={() => choose(tier)} disabled={busy || !methods.length}>
                    {actionLabel(tier)}
                  </button>
                ) : (
                  <p className={styles.note}>
                    {isCurrent ? 'Included with every account.' : 'You return to this tier when your paid period ends.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
