import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getCheckoutQuote, getCheckoutStatus, submitCheckout } from '../../api/checkout.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import routes from '../../routes/routeConfig';
import Icon from '../../components/common/Icon';
import CheckoutSummary from '../../components/sprint2/m1/CheckoutSummary';
import FulfilmentSelector from '../../components/sprint2/m6/FulfilmentSelector';
import PromoCodeInput from '../../components/sprint2/m6/PromoCodeInput';
import styles from '../../styles/sprint2/member1.module.css';

// Member 2 ships independently. Keep checkout usable until its picker is merged.
const { '../../components/sprint2/m2/PaymentMethodPicker.jsx': PaymentMethodPicker } = import.meta.glob(
  '../../components/sprint2/m2/PaymentMethodPicker.jsx', { eager: true, import: 'default' },
);

const reservationPath = routes.some((route) => route.path === '/reservations/:id')
  ? '/reservations/' : '/my-reservations/';

const checkoutStorageKey = (id) => `shareshed-checkout-attempt:${id}`;
const checkoutEnded = (status) => status === 'completed' || status === 'failed';

function forgetCheckout(id) {
  const attemptKey = checkoutStorageKey(id);
  const stored = sessionStorage.getItem(attemptKey);
  if (!stored) return;
  const [key, operationKey] = JSON.parse(stored);
  if (sessionStorage.getItem(key) === operationKey) sessionStorage.removeItem(key);
  sessionStorage.removeItem(attemptKey);
}

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
        if (checkoutEnded(data.status)) forgetCheckout(id);
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
            <li key={reservationId}><Link to={reservationPath + reservationId}>View reservation {index + 1}</Link></li>
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

const pickup = { method: 'pickup' };

function CheckoutForm({ selection }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [fulfilment, setFulfilment] = useState(pickup);
  const [byEntry, setByEntry] = useState({});
  const [promoCode, setPromoCode] = useState('');
  const [response, setResponse] = useState(null);
  const [method, setMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [submitError, setSubmitError] = useState('');

  const cart = selection.source === 'borrowList';
  const request = useMemo(() => ({
    ...selection,
    ...(cart ? { fulfilmentByEntry: byEntry } : { fulfilment }),
    ...(promoCode && { promoCode }),
  }), [selection, cart, byEntry, fulfilment, promoCode]);
  const missingAddress = (cart ? Object.values(byEntry) : [fulfilment])
    .some((choice) => choice.method === 'delivery' && !choice.deliveryAddress?.trim());
  const current = response?.request === request && response.refresh === refresh;
  const quote = current ? response.quote : null;
  const loading = !current && !missingAddress;
  const error = (current && response.error) || submitError;
  const discount = quote?.lines.reduce((sum, line) => sum + (line.deposit.promoDiscount || 0), 0);

  useEffect(() => {
    if (missingAddress) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const data = await getCheckoutQuote(request);
        if (!active) return;
        setResponse({ request, refresh, quote: data, lines: data.lines });
        setMethod((previous) => data.paymentMethods.includes(previous) ? previous : (data.paymentMethods[0] || ''));
      } catch (failure) {
        if (!active) return;
        setResponse((previous) => ({ request, refresh, error: getErrorMessage(failure), lines: previous?.lines }));
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [request, refresh, missingAddress]);

  function changeFulfilment(line, choice) {
    setSubmitError('');
    if (!cart) {
      setFulfilment(choice);
      return;
    }
    setByEntry((previous) => {
      const next = { ...previous };
      if (choice.method === 'delivery') next[line.entryId] = choice;
      else delete next[line.entryId];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting || !quote?.paymentMethods.includes(method)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const key = ['shareshed-checkout', user._id || user.id, selection.source, quote.quoteHash, method].join(':');
      let operationKey = sessionStorage.getItem(key);
      if (!operationKey) {
        operationKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
          byte.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(key, operationKey);
      }
      const result = await submitCheckout({ ...request, method, operationKey, quoteHash: quote.quoteHash });
      if (checkoutEnded(result.status)) {
        sessionStorage.removeItem(key);
        forgetCheckout(result.id);
      } else {
        sessionStorage.setItem(checkoutStorageKey(result.id), JSON.stringify([key, operationKey]));
      }
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate('/checkout/status/' + result.id, { replace: true });
    } catch (failure) {
      setSubmitError(getErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="workspace-heading">
        <h1>{cart ? 'Checkout borrow list' : 'Review reservation'}</h1>
        <Link to="/reserve" className="text-link">Browse reservable items <Icon name="arrow" size={16} /></Link>
      </div>
      {loading && <p role="status">Checking availability and pricing…</p>}
      {missingAddress && <p role="status">Enter or select a delivery address to update checkout.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {quote && !quote.paymentMethods.length && <p role="status">Payment is temporarily unavailable for this checkout.</p>}
      <div className={styles.checkoutGrid}>
        {quote && (
          <aside className={'card card-body ' + styles.checkoutSummary} aria-label="Reservation summary">
            <CheckoutSummary quote={quote} />
          </aside>
        )}
        {response?.lines?.length > 0 && (
          <form className={'card card-body ' + styles.checkoutForm} onSubmit={submit}>
            {response.lines.map((line) => (
              <FulfilmentSelector key={line.entryId ?? line.itemId} itemIds={[line.itemId]} savedAddress={user?.address}
                label={cart ? line.title + ' · ' + line.startDate.slice(0, 10) : undefined}
                value={cart ? byEntry[line.entryId] ?? pickup : fulfilment}
                onChange={(choice) => changeFulfilment(line, choice)} disabled={submitting} />
            ))}
            <PromoCodeInput value={promoCode} onApply={(code) => { setPromoCode(code); setSubmitError(''); }}
              discount={discount} disabled={submitting} />
            {quote?.amountMinor > 0 && quote.paymentMethods.length > 0 && (PaymentMethodPicker ? (
              <PaymentMethodPicker
                amountMinor={quote.amountMinor} methods={quote.paymentMethods} value={method}
                onChange={setMethod} disabled={submitting}
              />
            ) : (
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
            ))}
            <button className={styles.button} disabled={submitting || !quote?.paymentMethods.includes(method)}>
              {submitting ? 'Submitting…' : 'Submit reservation requests'}
            </button>
          </form>
        )}
      </div>
      {error && !submitting && <button className={styles.button} onClick={() => {
        setSubmitError(''); setRefresh((count) => count + 1);
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
    <section className={checkoutId ? 'container ' + styles.section : 'container ' + styles.checkoutPage}>
      {checkoutId ? <CheckoutResult key={checkoutId} id={checkoutId} /> : <CheckoutForm key={serialized} selection={selection} />}
    </section>
  );
}

function readSelection(params) {
  if (params.get('source') !== 'single') return { source: 'borrowList' };
  const { itemId, startDate, endDate, holdId } = Object.fromEntries(params);
  return { source: 'single', itemId, startDate, endDate, ...(holdId && { holdId }) };
}
