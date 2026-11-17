// MY RESERVATIONS - Owner: Member 5 - Requirements: 53, 54. Contract: docs/sprint2/member5.md §4
// Route: /reservations   Access: member   (registered in src/routes/sprint2/member5.routes.jsx)
// All my bookings as the borrower: open ones first (soonest first), then past ones (newest first).
// Filter by status (tabs) and by dates (bookings that overlap the chosen days). The filters and the page are kept in
// the address (?status=active&from=2026-12-01&page=2), so reload and the Back arrow keep them.
// Chat and cancellation are Member 1's (/my-reservations/:id); the details page links there.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { listMyReservations } from '../../api/reservationLifecycle.api';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Pagination from '../../components/common/Pagination';
import ReservationCard from '../../components/sprint2/m5/ReservationCard';
import { isDay, showDay } from '../../components/sprint2/m5/borrowDates';
import { OPEN_STATUSES } from '../../components/sprint2/m5/reservationText';
import s from '../../styles/sprint2/member5.module.css';

const PAGE_SIZE = 12;
const TABS = [
  { key: 'all', label: 'All', empty: 'You have no reservations yet.' },
  { key: 'pending', label: 'Pending', empty: 'No requests are waiting for a lender.' },
  { key: 'upcoming', label: 'Upcoming', empty: 'You have nothing to pick up.' },
  { key: 'active', label: 'Active', empty: 'You are not borrowing anything right now.' },
  { key: 'completed', label: 'Completed', empty: 'You have no completed reservations.' },
  { key: 'cancelled', label: 'Cancelled', empty: 'You have no cancelled reservations.' },
  { key: 'rejected', label: 'Rejected', empty: 'None of your requests were declined.' },
];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function MyReservationsPage() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'all';
  const from = isDay(params.get('from')) ? params.get('from') : '';
  const to = isDay(params.get('to')) ? params.get('to') : '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const rangeError = from && to && to < from ? 'The "to" date must be on or after the "from" date' : '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const go = (next, replace = false) => {
    const p = new URLSearchParams();
    const v = { status, from, to, page, ...next };
    if (v.status !== 'all') p.set('status', v.status);
    if (v.from) p.set('from', v.from);
    if (v.to) p.set('to', v.to);
    if (v.page > 1) p.set('page', String(v.page));
    setParams(p, { replace });
  };

  useEffect(() => {
    if (rangeError) { setLoading(false); return undefined; }
    let ignore = false; // a slower, older request must not overwrite a newer one
    setLoading(true);
    setError('');
    setFieldErrors({});
    listMyReservations({ status: status === 'all' ? undefined : status, from: from || undefined, to: to || undefined, page, limit: PAGE_SIZE })
      .then((d) => {
        if (ignore) return;
        if (d.items.length === 0 && d.total > 0 && page > d.pages) { go({ page: d.pages }, true); return; }
        setData(d);
      })
      .catch((e) => {
        if (ignore) return;
        const fe = {}; getFieldErrors(e).forEach((x) => { fe[x.field] = x.message; });
        setFieldErrors(fe);
        setError(getErrorMessage(e));
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [status, from, to, page, reloadKey, rangeError]); // eslint-disable-line react-hooks/exhaustive-deps

  const tab = TABS.find((t) => t.key === status);
  const items = data?.items || [];
  const open = items.filter((r) => OPEN_STATUSES.includes(r.status));
  const past = items.filter((r) => !OPEN_STATUSES.includes(r.status));
  const filtered = !!(from || to);
  let rangeText = '';
  if (from && to) rangeText = from === to ? ` on ${showDay(from)}` : ` between ${showDay(from)} and ${showDay(to)}`;
  else if (from) rangeText = ` from ${showDay(from)} on`;
  else if (to) rangeText = ` until ${showDay(to)}`;

  return (
    <div className="container">
      <h1 className={s.pageTitle}>My reservations</h1>
      <p className={`muted ${s.lead}`}>Everything you have booked, what happens next, and what you borrowed before.</p>

      <div className="tabs" role="group" aria-label="Show reservations">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab ${status === t.key ? 'active' : ''}`} aria-pressed={status === t.key}
            onClick={() => go({ status: t.key, page: 1 })}>{t.label}</button>
        ))}
      </div>

      <fieldset className={s.dateFilter}>
        <legend className={s.dateFilterLegend}>Dates</legend>
        <div className={s.dateRow}>
          <FormField label="From" error={fieldErrors.from}>
            <input type="date" value={from} max={to || undefined} onChange={(e) => go({ from: e.target.value, page: 1 })} />
          </FormField>
          <FormField label="To" error={rangeError || fieldErrors.to}>
            <input type="date" value={to} min={from || undefined} onChange={(e) => go({ to: e.target.value, page: 1 })} />
          </FormField>
        </div>
        <div className={s.dateFilterFoot}>
          <p className="muted">Shows bookings that overlap these days.</p>
          {filtered && <button type="button" className="btn btn-secondary" onClick={() => go({ from: '', to: '', page: 1 })}>Clear dates</button>}
        </div>
      </fieldset>

      {loading && !data && !rangeError && <Spinner label="Loading your reservations..." />}

      {error && !rangeError && (
        <div className={s.loadError}>
          <Alert variant="error">{error}</Alert>
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && !rangeError && data && (
        <>
          <p className={`muted ${s.count}`} aria-live="polite">
            {loading ? 'Updating...' : `${plural(data.total, 'reservation')}${status === 'all' ? '' : ` · ${tab.label.toLowerCase()}`}${rangeText}`}
          </p>
          {items.length === 0 && !loading ? (
            <div className={`center ${s.empty}`}>
              <p className="muted">{filtered ? 'No reservations match these dates.' : tab.empty}</p>
              {filtered
                ? <button type="button" className="btn btn-secondary" onClick={() => go({ from: '', to: '', page: 1 })}>Clear dates</button>
                : status === 'all' && <Link to="/catalog" className="btn">Browse items</Link>}
            </div>
          ) : (
            <div className={`${s.resGroups} ${loading ? s.updating : ''}`} aria-busy={loading}>
              {open.length > 0 && (
                <section aria-labelledby="res-open-title">
                  <h2 id="res-open-title" className={s.groupTitle}>Open</h2>
                  <p className={`muted ${s.groupNote}`}>Waiting for approval, coming up, or with you now.</p>
                  <ul className={s.list}>{open.map((r) => <ReservationCard key={r._id} reservation={r} />)}</ul>
                </section>
              )}
              {past.length > 0 && (
                <section aria-labelledby="res-past-title">
                  <h2 id="res-past-title" className={s.groupTitle}>Past</h2>
                  <p className={`muted ${s.groupNote}`}>Returned, cancelled or declined.</p>
                  <ul className={s.list}>{past.map((r) => <ReservationCard key={r._id} reservation={r} />)}</ul>
                </section>
              )}
            </div>
          )}
          <Pagination page={data.page} pages={data.pages} onChange={(pg) => { go({ page: pg }); window.scrollTo(0, 0); }} />
        </>
      )}
    </div>
  );
}
