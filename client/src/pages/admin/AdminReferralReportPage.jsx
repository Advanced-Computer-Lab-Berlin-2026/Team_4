import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { getReferralReport } from '../../api/referrals.api';
import styles from '../../styles/sprint2/member9.module.css';

export default function AdminReferralReportPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setError('');
    getReferralReport({ page })
      .then((data) => { if (active) setReport(data); })
      .catch((err) => { if (active) setError(getErrorMessage(err)); });
    return () => { active = false; };
  }, [page]);

  return (
    <main className={styles.page}>
      <h1>Referral report</h1>
      <p className={styles.muted}>Referral activity and wallet credits issued.</p>
      <Alert variant="error">{error}</Alert>
      {!report && !error && <Spinner />}
      {report && (
        <>
          <section className={styles.summaryGrid} aria-label="Referral totals">
            <div><span>Referral links copied</span><strong>{report.totals.referralsSent}</strong></div>
            <div><span>Referral signups</span><strong>{report.totals.signups}</strong></div>
            <div><span>Conversions</span><strong>{report.totals.conversions}</strong></div>
            <div><span>Total credits issued</span><strong>{(report.totals.creditsIssuedMinor / 100).toFixed(2)} {report.totals.currency}</strong></div>
          </section>
          <div className={styles.tableWrap}>
            <table className={styles.reportTable}>
              <thead><tr><th>Referrer</th><th>Referred member</th><th>Status</th><th>Credit</th><th>Recorded</th><th>Converted</th></tr></thead>
              <tbody>{report.items.map((item) => (
                <tr key={item._id}>
                  <td>{item.referrer?.name || 'Unknown'}</td>
                  <td>{item.referee?.name || '—'}</td>
                  <td>{item.status === 'sent' ? 'Link copied' : item.status}</td>
                  <td>{(item.creditAmountMinor / 100).toFixed(2)} {report.totals.currency}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td>{item.convertedAt ? new Date(item.convertedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className={styles.muted}>Showing {report.items.length} of {report.total} records.</p>
          <Pagination page={report.page} pages={report.pages} onChange={setPage} />
        </>
      )}
    </main>
  );
}
