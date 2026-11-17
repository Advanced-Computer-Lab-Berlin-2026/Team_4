// LENDING DASHBOARD - Owner: Member 5 - Requirement: 106. Contract: docs/sprint2/member5.md §7
// Route: /lender/dashboard   Access: lender   (registered in src/routes/sprint2/member5.routes.jsx)
// The lender's own figures: items lent, deposits collected (and held now), damage incident rate, plus a table per item.
// "All time | Last 30 days" is kept in the address (?period=30d). Read only.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { getLendingDashboard } from '../../api/lendingDashboard.api';
import { formatMoney } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import s from '../../styles/sprint2/member5.module.css';

const PERIODS = [{ key: 'all', label: 'All time' }, { key: '30d', label: 'Last 30 days' }];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const percent = (rate) => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;

function Stat({ label, value, note }) {
  return (
    <div className={`card ${s.stat}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      <div className={`muted ${s.statNote}`}>{note}</div>
    </div>
  );
}

export default function LenderDashboardPage() {
  const [params, setParams] = useSearchParams();
  const period = PERIODS.some((p) => p.key === params.get('period')) ? params.get('period') : 'all';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    getLendingDashboard({ period })
      .then((d) => { if (!ignore) setData(d); })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [period, reloadKey]);

  const choose = (key) => setParams(key === 'all' ? {} : { period: key });
  const recent = period === '30d';
  const waiting = data ? data.needsAction.requests + data.needsAction.extensions : 0;
  const maxLent = data ? Math.max(1, ...data.items.map((i) => i.timesLent)) : 1;
  const nothingYet = data && data.items.length === 0;

  return (
    <div className="container">
      <p className={s.backLink}><Link to="/lender/items">← My items</Link></p>
      <div className={s.dashHead}>
        <div>
          <h1 className={s.pageTitle}>Lending dashboard</h1>
          <p className={`muted ${s.lead}`}>How your items are doing: what you lent, the deposits you collected and how often something came back damaged.</p>
        </div>
        <Link to="/lender/reservations" className="btn btn-secondary">Booking requests</Link>
      </div>

      <div className="tabs" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" className={`tab ${period === p.key ? 'active' : ''}`} aria-pressed={period === p.key}
            onClick={() => choose(p.key)}>{p.label}</button>
        ))}
      </div>

      {loading && !data && <Spinner label="Loading your dashboard..." />}

      {error && (
        <div className={s.loadError}>
          <Alert variant="error">{error}</Alert>
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && data && (
        <div className={`${s.dash} ${loading ? s.updating : ''}`} aria-busy={loading}>
          {waiting > 0 && (
            <div className={`card ${s.waitingBanner}`} role="status">
              <p className={s.waitingText}>
                <strong>Waiting for your answer:</strong>{' '}
                {[data.needsAction.requests && plural(data.needsAction.requests, 'request'), data.needsAction.extensions && plural(data.needsAction.extensions, 'extension request')].filter(Boolean).join(' and ')}.
              </p>
              <Link to="/lender/reservations?tab=action" className="btn">Answer now</Link>
            </div>
          )}

          <section aria-labelledby="dash-figures" className={s.dashSection}>
            <h2 id="dash-figures" className={s.srOnly}>{recent ? 'Last 30 days' : 'All time'}</h2>
            <div className={s.statGrid}>
              <Stat label="Times lent" value={data.loans.completed} note={recent ? 'Loans completed in the last 30 days' : 'Loans completed'} />
              <Stat label="Out now" value={data.loans.activeNow} note={data.loans.activeNow === 1 ? 'Item with a borrower right now' : 'Items with borrowers right now'} />
              <Stat label="Deposits collected" value={formatMoney(data.deposits.totalCollected)} note={recent ? 'From bookings made in the last 30 days' : 'From bookings that went ahead'} />
              <Stat label="Held now" value={formatMoney(data.deposits.heldNow)} note="Deposits held until items come back" />
              <Stat label="Damage rate" value={percent(data.damage.rate)}
                note={data.damage.completedLoans ? `${plural(data.damage.upheld, 'damage case')} in ${plural(data.damage.completedLoans, 'loan')}` : (recent ? 'No loans completed in the last 30 days' : 'No completed loans yet')} />
            </div>
          </section>

          <section aria-labelledby="dash-items" className={s.dashSection}>
            <h2 id="dash-items" className={s.groupTitle}>By item</h2>
            {nothingYet ? (
              <div className={`center ${s.empty}`}>
                <p className="muted">You haven&apos;t lent anything yet. Once members book your items, each one shows up here.</p>
                <Link to="/lender/items" className="btn">My items</Link>
              </div>
            ) : (
              <>
                <p className={`muted ${s.groupNote}`}>{recent ? 'Loans, deposits and damage in the last 30 days; "out now" is right now.' : 'Every item that has been booked, archived ones included.'}</p>
                <div className="table-wrap">
                  <table className={s.dashTable}>
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Times lent</th>
                        <th scope="col" className={s.num}>Out now</th>
                        <th scope="col" className={s.num}>Deposits collected</th>
                        <th scope="col" className={s.num}>Damage cases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row, n) => (
                        <tr key={row.item?._id || `deleted-${n}`}>
                          <th scope="row" className={s.dashItem}>
                            {row.item
                              ? <Link to={`/lender/reservations?item=${row.item._id}`}>{row.item.title}</Link>
                              : <span className="muted">Deleted item</span>}
                            {row.item?.isArchived && <span className={`badge badge-grey ${s.badge}`}>Archived</span>}
                          </th>
                          <td>
                            <div className={s.barCell}>
                              <span className={s.barValue}>{row.timesLent}</span>
                              <span className={s.barTrack} aria-hidden="true"><span className={s.bar} style={{ width: `${(row.timesLent / maxLent) * 100}%` }} /></span>
                            </div>
                          </td>
                          <td className={s.num}>{row.activeNow}</td>
                          <td className={s.num}>{formatMoney(row.depositsCollected)}</td>
                          <td className={s.num}>{row.damageUpheld}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
