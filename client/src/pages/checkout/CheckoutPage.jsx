import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCheckoutQuote, getCheckoutStatus, submitCheckout } from '../../api/checkout.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import CheckoutSummary from '../../components/sprint2/m1/CheckoutSummary';
import styles from '../../styles/sprint2/member1.module.css';

function CheckoutResult({ id }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    let timer;
    async function refresh() {
      try {
        const data = await getCheckoutStatus(id);
        if (!current) return;
        setResult(data);
        setError('');
        if (data.status === 'awaiting_payment' || data.status === 'refund_due') timer = setTimeout(refresh, 8000);
      } catch (failure) {
        if (!current) return;
        setError(getErrorMessage(failure));
        if (!failure.response || failure.response.status >= 500) timer = setTimeout(refresh, 8000);
      }
    }
    refresh();
    return () => { current = false; clearTimeout(timer); };
  }, [id]);

  return (
    <>
      <h1>Checkout status</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {(!result && !error) && <p role="status">Looking up checkout…</p>}
      {result?.status === 'completed' && (
        <>
          <p role="status">Reservation requests submitted for lender approval.</p>
          <ul className={styles.list}>{result.reservationIds.map((reservationId, index) => (
            <li key={reservationId}><Link to={'/my-reservations/' + reservationId}>View reservation {index + 1}</Link></li>
          ))}</ul>
        </>
      )}
      {result?.status === 'awaiting_payment' && <p role="status">Waiting for card payment confirmation.</p>}
      {result?.status === 'awaiting_payment' && result.redirectUrl && <a href={result.redirectUrl}>Continue to Stripe</a>}
      {result?.status === 'refund_due' && <p role="status">Processing your refund.</p>}
      {result?.status === 'failed' && <p role="alert" className={styles.error}>{result.failure}</p>}
      <div className={styles.actions}><Link to="/reserve">Browse reservable items</Link></div>
    </>
  );
}

function CheckoutForm({ selection }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    getCheckoutQuote(selection).then((data) => {
      if (!current) return;
      setQuote(data);
      setMethod(data.paymentMethods[0] || '');
    }).catch((failure) => {
      if (current) setError(getErrorMessage(failure));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [selection, refresh]);

  async function submit(event) {
    event.preventDefault();
    if (submitting || !quote || !method) return;
    setSubmitting(true);
    setError('');
    try {
      const key = ['shareshed-checkout', user._id || user.id, selection.source, quote.quoteHash, method].join(':');
      let operationKey = sessionStorage.getItem(key);
      if (!operationKey) {
        operationKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
          byte.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(key, operationKey);
      }
      const result = await submitCheckout({ ...selection, method, operationKey, quoteHash: quote.quoteHash });
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.status === 'completed' || result.status === 'failed') sessionStorage.removeItem(key);
      navigate('/checkout/status/' + result.id, { replace: true });
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>{selection.source === 'single' ? 'Review reservation' : 'Checkout borrow list'}</h1>
      <Link to="/reserve">Browse reservable items</Link>
      {loading && <p role="status">Checking availability and pricing…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {quote && <CheckoutSummary quote={quote} />}
      {quote && !quote.paymentMethods.length && <p role="status">Payment is temporarily unavailable for this checkout.</p>}
      {quote?.paymentMethods.length > 0 && (
        <form className={styles.form} onSubmit={submit}>
          {quote.amountMinor > 0 && (
            <fieldset>
              <legend>Payment method</legend>
              <div className={styles.actions}>{quote.paymentMethods.map((choice) => (
                <label key={choice}>
                  <input type="radio" name="method" value={choice} checked={method === choice}
                    onChange={() => setMethod(choice)} disabled={submitting} />
                  {choice === 'wallet' ? 'Wallet' : 'Card (Stripe)'}
                </label>
              ))}</div>
            </fieldset>
          )}
          <button className={styles.button} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit reservation requests'}
          </button>
        </form>
      )}
      {error && !submitting && <button className={styles.button} onClick={() => {
        setQuote(null); setError(''); setLoading(true); setRefresh((count) => count + 1);
      }}>Refresh checkout quote</button>}
    </>
  );
}

export default function CheckoutPage() {
  const { checkoutId } = useParams();
  const [params] = useSearchParams();
  const serialized = params.toString();
  const selection = useMemo(() => readSelection(new URLSearchParams(serialized)), [serialized]);
  return (
    <section className={styles.section}>
      {checkoutId ? <CheckoutResult key={checkoutId} id={checkoutId} /> : <CheckoutForm key={serialized} selection={selection} />}
    </section>
  );
}

function readSelection(params) {
  if (params.get('source') !== 'single') return { source: 'borrowList' };
  const { itemId, startDate, endDate, holdId } = Object.fromEntries(params);
  return { source: 'single', itemId, startDate, endDate, ...(holdId && { holdId }) };
}
