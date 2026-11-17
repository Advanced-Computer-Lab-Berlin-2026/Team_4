import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { createPromoCode, listPromoCodes } from '../../api/promoCodes.api';
import { formatEGP } from '../../components/sprint2/m6/FulfilmentSelector';
import { promoUsageFor, promoUsagePath } from '../../components/sprint2/m6/routesAvailability';
import styles from '../../styles/sprint2/member6.module.css';

function PromoCodeForm({ onCreated }) {
  const [discountType, setDiscountType] = useState('percent');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const validFrom = values.get('validFrom');
    const validUntil = values.get('validUntil');
    setError('');
    setCreated('');
    if (validFrom && validUntil && validFrom >= validUntil) {
      setError('Expiry must be after the start date.');
      return;
    }
    setSaving(true);
    try {
      const promo = await createPromoCode({
        code: values.get('code').trim(), discountType, discountValue: Number(values.get('discountValue')),
        ...(values.get('maxRedemptions') && { maxRedemptions: Number(values.get('maxRedemptions')) }),
        ...(validFrom && { validFrom: new Date(validFrom).toISOString() }),
        ...(validUntil && { validUntil: new Date(validUntil).toISOString() }),
        onePerMember: values.has('onePerMember'),
      });
      form.reset();
      setDiscountType('percent');
      setCreated(promo.code);
      onCreated();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`card ${styles.block}`} onSubmit={submit}>
      <fieldset className={`card-body ${styles.stack}`} disabled={saving}>
        <legend>Create a promo code</legend>
        <label className={styles.field}>Code
          <input name="code" type="text" maxLength={80} required autoComplete="off" spellCheck={false} />
        </label>
        <div className={styles.columns}>
          <label className={styles.field}>Discount type
            <select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value)}>
              <option value="percent">Percentage of deposit</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>
          <label className={styles.field}>Discount {discountType === 'percent' ? '(%)' : '(EGP)'}
            <input name="discountValue" type="number" required min="0.01" step="0.01" max={discountType === 'percent' ? '100' : undefined} />
          </label>
        </div>
        <div className={styles.columns}>
          <label className={styles.field}>Starts at (optional)
            <input name="validFrom" type="datetime-local" />
          </label>
          <label className={styles.field}>Expires at (optional)
            <input name="validUntil" type="datetime-local" />
          </label>
        </div>
        <label className={styles.field}>Maximum redemptions (optional)
          <input name="maxRedemptions" type="number" min="1" step="1" />
        </label>
        <label className={styles.choice}><input name="onePerMember" type="checkbox" /> One redemption per member</label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {created && <p role="status">Promo code {created} created.</p>}
        <div><button type="submit" className="btn">{saving ? 'Creating…' : 'Create promo code'}</button></div>
      </fieldset>
    </form>
  );
}

const dateLabel = (date) => date ? new Date(date).toLocaleString() : '—';

export default function AdminPromoCodesPage() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listPromoCodes(page, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    });
    return () => controller.abort();
  }, [page, revision]);

  function changePage(next) {
    setError('');
    setResult(null);
    setPage(next);
    setRevision((count) => count + 1);
  }

  return (
    <section className={`container ${styles.page} ${styles.stack}`}>
      <h1>Promo codes</h1>
      <div className={styles.actions}>
        <Link to={promoUsagePath}>View promo usage and redemptions</Link>
        <Link to="/admin/categories">Category deposit multipliers</Link>
      </div>
      <PromoCodeForm onCreated={() => changePage(1)} />
      <h2>Created codes</h2>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!error && !result && <p role="status">Loading promo codes…</p>}
      {result?.items.length === 0 && <p>No promo codes on this page.</p>}
      {!!result?.items.length && (
        <div className={`table-wrap ${styles.table}`} tabIndex={0} role="region" aria-label="Promo codes table">
          <table>
            <thead><tr><th>Code</th><th>Deposit discount</th><th>Starts</th><th>Expires</th><th>Redemptions</th></tr></thead>
            <tbody>{result.items.map((promo) => (
              <tr key={promo._id}>
                <th scope="row">{promo.code}</th>
                <td>{promo.discountType === 'percent' ? `${promo.discountValue}%` : formatEGP(promo.discountValue)}</td>
                <td>{dateLabel(promo.validFrom)}</td>
                <td>{dateLabel(promo.validUntil)}</td>
                <td><Link to={promoUsageFor(promo._id)} aria-label={`View redemptions for ${promo.code}`}>
                  {promo.redemptionCount}{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ''}
                </Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {result && result.pages > 1 && <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
        <span>Page {page} of {result.pages}</span>
        <button type="button" className="btn btn-secondary" disabled={page === result.pages} onClick={() => changePage(page + 1)}>Next</button>
      </div>}
    </section>
  );
}
