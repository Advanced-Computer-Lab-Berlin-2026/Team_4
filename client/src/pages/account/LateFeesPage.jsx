// LATE FEES - Owner: Member 2 - Requirements: 78
// Route: /account/late-fees   Access: member   (declared in src/routes/sprint2/member2.routes.jsx, wired by Member 1)
// Lists the late fees charged to the logged-in member: item, dates, days late, fee, paid and still owed.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLateFees } from '../../api/payments.api';
import { getErrorMessage } from '../../api/axios';
import { formatDate, formatMoney } from '../../utils/format';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import Pagination from '../../components/common/Pagination';
import StatusBadge from '../../components/common/StatusBadge';
import styles from '../../styles/sprint2/member2.module.css';

const egp = (minor) => formatMoney(minor / 100);

export default function LateFeesPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    setError('');
    getLateFees({ page, limit: 10 })
      .then((result) => { if (!ignore) setData(result); })
      .catch((err) => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, [page]);

  return <div className="container"><div className={styles.page}>
    <section className="card"><div className="card-body">
      <div className={styles.header}>
        <h1>Late fees</h1>
        <Link to="/account/wallet">Back to wallet</Link>
      </div>
      <p className="muted">A late fee is charged automatically from your wallet when an item is returned after its due date.</p>
      <Alert variant="error">{error}</Alert>
      {data?.outstandingTotalMinor > 0 && (
        <Alert variant="error">
          You still owe {egp(data.outstandingTotalMinor)}. It will be taken automatically from your next wallet credit.
        </Alert>
      )}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && <p className={styles.empty}>You have no late fees. Thanks for returning items on time!</p>}
      {data && data.items.length > 0 && (
        <ol className={styles.list} aria-label="Late fees">
          {data.items.map((fee) => (
            <li key={fee._id} className={styles.row}>
              <div className={styles.main}>
                <div className={styles.title}>{fee.itemTitle}</div>
                <div className={styles.meta}>
                  Due {formatDate(fee.dueAt)}{fee.returnedAt ? ` · returned ${formatDate(fee.returnedAt)}` : ''}
                  {fee.daysLate ? ` · ${fee.daysLate} day${fee.daysLate === 1 ? '' : 's'} late` : ''}
                </div>
                <dl className={styles.facts}>
                  <div><dt>Late fee</dt><dd>{egp(fee.lateFeeMinor)}</dd></div>
                  <div><dt>Paid</dt><dd>{egp(fee.chargedMinor)}</dd></div>
                  <div><dt>Still owed</dt><dd>{egp(fee.outstandingMinor)}</dd></div>
                </dl>
              </div>
              <div className={styles.amounts}>
                {fee.outstandingMinor > 0
                  ? <StatusBadge status="pending">Partly paid</StatusBadge>
                  : <StatusBadge status="approved">Paid</StatusBadge>}
                <div className={styles.meta}>{formatDate(fee.chargedAt)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data && <Pagination page={data.page} pages={data.pages} onChange={setPage} />}
    </div></section>
  </div></div>;
}
