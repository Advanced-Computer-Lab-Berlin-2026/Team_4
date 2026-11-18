import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { getReferralReport } from '../../api/referrals.api';
import styles from '../../styles/sprint2/member9.module.css';

export default function AdminReferralReportPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getReferralReport()
      .then(setReport)
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  return (
    <main className={styles.page}>
      <h1>Referral report</h1>
      <p className={styles.muted}>Referral activity and wallet credits issued.</p>
      <Alert variant="error">{error}</Alert>
      {!report && !error && <Spinner />}
      {report && (
        <>
          <section className={styles.summaryGrid} aria-label="Referral totals">
            <div><span>Referrals sent</span><strong>{report.totals.referralsSent}</strong></div>
            <div><span>Conversions</span><strong>{report.totals.conversions}</strong></div>
            <div><span>Total credits issued</span><strong>{(report.totals.creditsIssuedMinor / 100).toFixed(2)} {report.totals.currency}</strong></div>
          </section>
          <div className={styles.tableWrap}>
            <table className={styles.reportTable}>
              <thead><tr><th>Referrer</th><th>Referred member</th><th>Status</th><th>Credit</th><th>Sent</th><th>Converted</th></tr></thead>
              <tbody>{report.items.map((item) => (
                <tr key={item._id}>
                  <td>{item.referrer?.name || 'Unknown'}</td>
                  <td>{item.referee?.name || 'Not registered'}</td>
                  <td>{item.status}</td>
                  <td>{(item.creditAmountMinor / 100).toFixed(2)} {report.totals.currency}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td>{item.convertedAt ? new Date(item.convertedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className={styles.muted}>Showing {report.items.length} of {report.total} referrals.</p>
        </>
      )}
    </main>
  );
}
