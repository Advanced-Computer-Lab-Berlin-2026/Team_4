import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCheckoutQuote, submitCheckout } from '../../../api/checkout.api';
import { getErrorMessage } from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import FulfilmentSelector, { formatEGP } from './FulfilmentSelector';
import PromoCodeInput from './PromoCodeInput';
import styles from '../../../styles/sprint2/member6.module.css';

const pickup = { method: 'pickup' };
const checkoutPath = '/checkout/delivery-promos';

function ReservationDates({ itemId, onReview }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  function review(event) {
    event.preventDefault();
    if (end <= start) {
      setError('Choose a return date after the start date.');
      return;
    }
    onReview({ source: 'single', itemId, startDate: start, endDate: end });
  }

  return (
    <form className={styles.stack} onSubmit={review}>
      <div className={styles.columns}>
        <label className={styles.field}>Start date
          <input type="date" required min={today} value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className={styles.field}>Return date
          <input type="date" required min={start || today} value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div><button type="submit" className="btn">Review reservation</button></div>
    </form>
  );
}

function QuoteDetails({ quote }) {
  return (
    <section className={styles.stack} aria-label="Checkout totals">
      <h2>Checkout totals</h2>
      <ul className={styles.statusList}>
        {quote.lines.map((line, index) => <li key={`${line.itemId}-${line.startDate}-${index}`}>
          <strong>{line.title}</strong> · {line.startDate.slice(0, 10)} to {line.endDate.slice(0, 10)}
          <div>Deposit {formatEGP(line.deposit.amount)}</div>
          {line.fulfilment.method === 'delivery' && <div>Delivery {formatEGP(line.fulfilment.deliveryFee)}</div>}
        </li>)}
      </ul>
      <strong>Total {formatEGP(quote.amountMinor / 100)}</strong>
    </section>
  );
}

function checkoutOperationKey(storageKey) {
  let operationKey = sessionStorage.getItem(storageKey);
  if (!operationKey) {
    operationKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(storageKey, operationKey);
  }
  return operationKey;
}

function DeliveryCheckout({ selection, onEdit, user }) {
  const navigate = useNavigate();
  const [fulfilment, setFulfilment] = useState(pickup);
  const [promoCode, setPromoCode] = useState('');
  const [review, setReview] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    getCheckoutQuote({ ...selection, fulfilment: pickup }).then((quote) => {
      if (mounted) {
        setReview({ quote, fulfilment: pickup, promoCode: '' });
        setPaymentMethod(quote.paymentMethods[0] || '');
      }
    }).catch((failure) => {
      if (mounted) setError(getErrorMessage(failure));
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [selection]);

  const address = fulfilment.deliveryAddress?.trim() || '';
  const quote = review?.quote;
  const isCurrent = quote && !stale && review.promoCode === promoCode && review.fulfilment.method === fulfilment.method &&
    (fulfilment.method === 'pickup' || review.fulfilment.deliveryAddress === address);
  const discount = isCurrent && promoCode ? quote.lines.reduce((sum, line) => sum + (line.deposit.promoDiscount || 0), 0) : undefined;

  async function refresh(code) {
    if (loading || submitting) return;
    setError('');
    if (fulfilment.method === 'delivery' && !address) {
      setError('Enter or select a delivery address to update checkout.');
      return;
    }
    const nextFulfilment = fulfilment.method === 'delivery' ? { method: 'delivery', deliveryAddress: address } : pickup;
    setPromoCode(code);
    setLoading(true);
    setStale(true);
    try {
      const fresh = await getCheckoutQuote({ ...selection, fulfilment: nextFulfilment, ...(code && { promoCode: code }) });
      setReview({ quote: fresh, fulfilment: nextFulfilment, promoCode: code });
      setPaymentMethod((previous) => fresh.paymentMethods.includes(previous) ? previous : fresh.paymentMethods[0] || '');
      setStale(false);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!isCurrent || !paymentMethod || loading || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const storageKey = ['shareshed-checkout', user._id || user.id, selection.source, quote.quoteHash, paymentMethod].join(':');
      const result = await submitCheckout({
        ...selection, fulfilment: review.fulfilment, ...(review.promoCode && { promoCode: review.promoCode }),
        method: paymentMethod, quoteHash: quote.quoteHash,
        operationKey: checkoutOperationKey(storageKey),
      });
      if (result.status === 'completed' || result.status === 'failed') sessionStorage.removeItem(storageKey);
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
      } else {
        navigate(`/checkout/status/${result.id}`, { replace: true });
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.stack} onSubmit={submit}>
      {quote && <>
        <FulfilmentSelector itemIds={quote.lines.map((line) => line.itemId)} savedAddress={user?.address}
          value={fulfilment} onChange={setFulfilment} disabled={loading || submitting} />
        <PromoCodeInput value={promoCode} onApply={refresh} discount={discount} disabled={loading || submitting} />
      </>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {loading && <p role="status">Checking availability and pricing…</p>}
      {isCurrent && <QuoteDetails quote={quote} />}
      {isCurrent && !quote.paymentMethods.length && <p role="status">Payment is temporarily unavailable for this checkout.</p>}
      {isCurrent && quote.amountMinor > 0 && paymentMethod && <fieldset className={`${styles.fieldset} ${styles.actions}`}>
        <legend>Payment method</legend>
        {quote.paymentMethods.map((method) => <label className={styles.choice} key={method}>
          <input type="radio" name="payment" checked={paymentMethod === method} disabled={submitting}
            onChange={() => setPaymentMethod(method)} />{method === 'wallet' ? 'Wallet' : 'Card (Stripe)'}
        </label>)}
      </fieldset>}
      <div className={styles.actions}>
        {(!isCurrent || error) && <button type="button" className="btn" disabled={loading || submitting}
          onClick={() => refresh(promoCode)}>Update totals</button>}
        {isCurrent && paymentMethod && <button type="submit" className="btn" disabled={loading || submitting}>
          {submitting ? 'Submitting…' : 'Submit reservation requests'}
        </button>}
        {onEdit && <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onEdit}>Change dates</button>}
      </div>
    </form>
  );
}

export default function DeliveryCheckoutPage() {
  const [params] = useSearchParams();
  const itemId = params.get('itemId');
  const isBorrowList = params.get('source') === 'borrowList';
  const { user } = useAuth();
  const [selection, setSelection] = useState(null);
  const borrowList = useMemo(() => ({ source: 'borrowList' }), []);
  const currentSelection = isBorrowList ? borrowList : (selection?.itemId === itemId ? selection : null);

  return (
    <section className={`container ${styles.page} ${styles.stack}`}>
      <h1>{isBorrowList ? 'Checkout borrow list' : 'Reserve with delivery or a promo code'}</h1>
      <div className={styles.actions}>
        <Link to="/catalog">Browse items</Link>
        {!isBorrowList && <Link to={`${checkoutPath}?source=borrowList`}>Checkout borrow list</Link>}
        <Link to="/delivery-tracking">Track a delivery</Link>
      </div>
      {currentSelection ? <DeliveryCheckout key={JSON.stringify(currentSelection)} selection={currentSelection} user={user}
        onEdit={isBorrowList ? undefined : () => setSelection(null)} /> : itemId ? (
          <ReservationDates key={itemId} itemId={itemId} onReview={setSelection} />
        ) : <p>Choose an item from the catalog to reserve it.</p>}
    </section>
  );
}
