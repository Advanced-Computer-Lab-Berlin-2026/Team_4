// WalletLedger - Owner: Member 2 - Requirements: 36, 78
// Props: { pageSize? } - the logged-in member's wallet history (every credit/debit and the balance after it),
// newest first, with a type filter and pagination. Data comes from GET /api/wallet-ledger.
import { useEffect, useId, useState } from 'react';
import { getLedger } from '../../../api/walletLedger.api';
import { getErrorMessage } from '../../../api/axios';
import { formatDateTime, formatMoney } from '../../../utils/format';
import Alert from '../../common/Alert';
import Spinner from '../../common/Spinner';
import Pagination from '../../common/Pagination';
import styles from '../../../styles/sprint2/member2.module.css';

export const LEDGER_LABELS = {
  deposit_hold: 'Deposit paid',
  deposit_release: 'Deposit returned',
  refund: 'Cancellation refund',
  late_fee: 'Late fee',
  forfeit: 'Deposit kept for damage',
  lender_payout: 'Received from a borrower',
  membership: 'Membership payment',
  referral_credit: 'Referral reward',
  adjustment: 'Adjustment',
};

const egp = (minor) => formatMoney(minor / 100);

export default function WalletLedger({ pageSize = 10 }) {
  const filterId = useId();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false; // drop answers that arrive after the user changed page/filter again
    setError('');
    getLedger({ page, limit: pageSize, ...(type ? { type } : {}) })
      .then((result) => { if (!ignore) setData(result); })
      .catch((err) => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [page, type, pageSize]);

  return (
    <section className="card"><div className="card-body">
      <h2 id={`${filterId}-title`}>Wallet history</h2>
      <div className={styles.toolbar}>
        <div>
          <label htmlFor={filterId}>Show</label>
          <select id={filterId} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All activity</option>
            {Object.entries(LEDGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <Alert variant="error">{error}</Alert>
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <p className={styles.empty}>No wallet activity yet.</p>}
      {data && data.items.length > 0 && (
        <ol className={styles.list} aria-labelledby={`${filterId}-title`}>
          {data.items.map((t) => (
            <li key={t._id} className={styles.row}>
              <div className={styles.main}>
                <div className={styles.title}>{LEDGER_LABELS[t.type] || t.type}</div>
                <div className={styles.meta}>{formatDateTime(t.createdAt)}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className={styles.amounts}>
                <div className={t.amountMinor >= 0 ? styles.credit : styles.debit}>
                  {t.amountMinor >= 0 ? '+' : '−'}{egp(Math.abs(t.amountMinor))}
                </div>
                <div className={styles.meta}>Balance {egp(t.balanceAfterMinor)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div></section>
  );
}
