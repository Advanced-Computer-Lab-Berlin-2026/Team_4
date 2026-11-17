// ADMIN MEMBERSHIP REPORT - Owner: Member 8 - Requirement: 108
// Route: /admin/membership-report   Access: admin   (declared in src/routes/sprint2/member8.routes.jsx)
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMembershipReport } from '../../api/memberships.api';
import { getErrorMessage } from '../../api/axios';
import { formatDateTime } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import styles from '../../styles/sprint2/member8.module.css';

export default function AdminMembershipReportPage() {
  const mounted = useRef(true);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMembershipReport();
      if (!mounted.current) return;
      setReport(data);
      setError('');
    } catch (err) {
      if (mounted.current) setError(getErrorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const paidMembers = report ? report.byStatus.active + report.byStatus.cancelled : 0;

  return (
    <div className={`container ${styles.report}`}>
      <div className={styles.reportHeader}>
        <h1>Membership distribution</h1>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className="muted">Active member accounts by the tier they are on right now. Expired tiers count as Basic.</p>

      <Alert variant="error">{error}</Alert>
      {loading && !report && <Spinner label="Loading report..." />}

      {report && (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{report.total}</span>
              <span className={styles.statLabel}>Active members</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{paidMembers}</span>
              <span className={styles.statLabel}>On a paid tier</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{report.byStatus.cancelled}</span>
              <span className={styles.statLabel}>Cancelled, still in paid period</span>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <caption className="muted">Generated {formatDateTime(report.generatedAt)}</caption>
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col" className={styles.number}>Members</th>
                  <th scope="col" className={styles.number}>Share</th>
                  <th scope="col" className={styles.shareCell}><span aria-hidden="true">Distribution</span></th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((row) => (
                  <tr key={row.tierId || row.name}>
                    <th scope="row">{row.name}</th>
                    <td className={styles.number}>{row.members}</td>
                    <td className={styles.number}>{row.percent}%</td>
                    <td className={styles.shareCell} aria-hidden="true">
                      <div className={styles.bar}><div className={styles.barFill} style={{ width: `${row.percent}%` }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
