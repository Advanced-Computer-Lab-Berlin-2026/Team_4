import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { listPromoRedemptions } from '../../api/promoCodes.api';
import { formatEGP } from '../../components/sprint2/m6/FulfilmentSelector';
import { promoCodesPath, promoUsagePath } from '../../components/sprint2/m6/routesAvailability';
import styles from '../../styles/sprint2/member6.module.css';

function PromoUsage({ promoCodeId }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listPromoRedemptions({ page, promoCodeId }, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    });
    return () => controller.abort();
  }, [page, promoCodeId]);

  function changePage(next) {
    setError('');
    setResult(null);
    setPage(next);
  }

  return (
    <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!error && !result && <p role="status">Loading redemptions…</p>}
      {result && <p role="status">{result.total} {result.total === 1 ? 'redemption' : 'redemptions'}{promoCodeId ? ' for the selected code' : ''}</p>}
      {!!result?.items.length && (
        <div className={`table-wrap ${styles.table}`} tabIndex={0} role="region" aria-label="Promo redemptions table">
          <table>
            <thead><tr><th>Code</th><th>Member ID</th><th>Reservation ID</th><th>Deposit discount</th><th>Redeemed at</th></tr></thead>
            <tbody>{result.items.map((record) => (
              <tr key={record._id}>
                <th scope="row">{record.code || '—'}</th>
                <td className={styles.identifier}>{record.userId || '—'}</td>
                <td className={styles.identifier}>{record.reservationId || '—'}</td>
                <td>{Number.isFinite(record.discountApplied) ? formatEGP(record.discountApplied) : '—'}</td>
                <td>{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</td>
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
    </>
  );
}

export default function AdminPromoUsagePage() {
  const [search] = useSearchParams();
  const promoCodeId = search.get('promoCodeId') || undefined;
  return (
    <section className={`container ${styles.page} ${styles.stack}`}>
      <h1>Promo usage and redemptions</h1>
      <div className={styles.actions}>
        <Link to={promoCodesPath}>Manage promo codes</Link>
        {promoCodeId && <Link to={promoUsagePath}>Show all redemptions</Link>}
      </div>
      <PromoUsage key={promoCodeId || 'all'} promoCodeId={promoCodeId} />
    </section>
  );
}
