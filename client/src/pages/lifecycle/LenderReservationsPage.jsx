// BOOKING REQUESTS (lender) - Owner: Member 5 - Requirements: 56, 59, 60 (list; the buttons come in Parts 10-12)
// Requests can be approved or declined (Req 56), pickups (Req 59) and returns (Req 60) marked, and requests for
// more time answered (Req 75) right on their card.
// Route: /lender/reservations   Access: lender   (registered in src/routes/sprint2/member5.routes.jsx)
// Every booking of my items. "Needs my answer" shows pending requests and open extension requests, oldest first.
// Filters (tab, item, dates, page) are kept in the address, so reload and the Back arrow keep them.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { listLendingItems, listLendingReservations } from '../../api/reservationLifecycle.api';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Pagination from '../../components/common/Pagination';
import ReservationCard from '../../components/sprint2/m5/ReservationCard';
import RequestAnswer from '../../components/sprint2/m5/RequestAnswer';
import PickupButton from '../../components/sprint2/m5/PickupButton';
import ReturnActions from '../../components/sprint2/m5/ReturnActions';
import ExtensionAnswer from '../../components/sprint2/m5/ExtensionAnswer';
import { isDay, showDay } from '../../components/sprint2/m5/borrowDates';
import { OPEN_STATUSES } from '../../components/sprint2/m5/reservationText';
import s from '../../styles/sprint2/member5.module.css';

const PAGE_SIZE = 12;
const TABS = [
  { key: 'action', label: 'Needs my answer', empty: 'You\'re all caught up: nothing is waiting for your answer.' },
  { key: 'all', label: 'All', empty: 'Nobody has booked your items yet.' },
  { key: 'pending', label: 'Pending', empty: 'No requests are waiting.' },
  { key: 'upcoming', label: 'Upcoming', empty: 'Nothing is booked to be picked up.' },
  { key: 'active', label: 'Active', empty: 'None of your items is out right now.' },
  { key: 'completed', label: 'Completed', empty: 'No completed bookings yet.' },
  { key: 'cancelled', label: 'Cancelled', empty: 'No cancelled bookings.' },
  { key: 'rejected', label: 'Rejected', empty: 'You haven\'t declined any requests.' },
];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function waitingText({ requests, extensions }) {
  const parts = [];
  if (requests) parts.push(plural(requests, 'request'));
  if (extensions) parts.push(plural(extensions, 'extension request'));
  return `${parts.join(' and ')} ${requests + extensions === 1 ? 'is' : 'are'} waiting for your answer.`;
}

export default function LenderReservationsPage() {
  const [params, setParams] = useSearchParams();
  const tabKey = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'all';
  const itemId = /^[a-f0-9]{24}$/i.test(params.get('item') || '') ? params.get('item') : '';
  const from = isDay(params.get('from')) ? params.get('from') : '';
  const to = isDay(params.get('to')) ? params.get('to') : '';
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const rangeError = from && to && to < from ? 'The "to" date must be on or after the "from" date' : '';

  const [data, setData] = useState(null);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const go = (next, replace = false) => {
    const p = new URLSearchParams();
    const v = { tab: tabKey, item: itemId, from, to, page, ...next };
    if (v.tab !== 'all') p.set('tab', v.tab);
    if (v.item) p.set('item', v.item);
    if (v.from) p.set('from', v.from);
    if (v.to) p.set('to', v.to);
    if (v.page > 1) p.set('page', String(v.page));
    setParams(p, { replace });
  };

  useEffect(() => {
    let ignore = false;
    listLendingItems().then((d) => { if (!ignore) setItems(d.items); }).catch(() => { if (!ignore) setItems([]); });
    return () => { ignore = true; };
  }, [reloadKey]);

  useEffect(() => {
    if (rangeError) { setLoading(false); return undefined; }
    let ignore = false;
    setLoading(true);
    setError('');
    setFieldErrors({});
    const isStatus = !['all', 'action'].includes(tabKey);
    listLendingReservations({
      status: isStatus ? tabKey : undefined, needsAction: tabKey === 'action' ? 'true' : undefined,
      item: itemId || undefined, from: from || undefined, to: to || undefined, page, limit: PAGE_SIZE,
    })
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
  }, [tabKey, itemId, from, to, page, reloadKey, rangeError]); // eslint-disable-line react-hooks/exhaustive-deps

  const tab = TABS.find((t) => t.key === tabKey);
  const list = data?.items || [];
  const waiting = data?.waiting || { requests: 0, extensions: 0 };
  const hasWaiting = waiting.requests + waiting.extensions > 0;
  const grouped = tabKey !== 'action';
  const open = grouped ? list.filter((r) => OPEN_STATUSES.includes(r.status)) : list;
  const past = grouped ? list.filter((r) => !OPEN_STATUSES.includes(r.status)) : [];
  const filtered = !!(from || to || itemId);
  const itemName = items?.find((i) => i._id === itemId)?.title;
  let rangeText = '';
  if (from && to) rangeText = from === to ? ` on ${showDay(from)}` : ` between ${showDay(from)} and ${showDay(to)}`;
  else if (from) rangeText = ` from ${showDay(from)} on`;
  else if (to) rangeText = ` until ${showDay(to)}`;

  const stale = (message) => { setNotice(''); setProblem(message); setReloadKey((k) => k + 1); };
  const done = (_, message) => { setProblem(''); setNotice(message); setReloadKey((k) => k + 1); window.scrollTo(0, 0); };

  const section = (key, title, note, rows) => rows.length > 0 && (
    <section aria-labelledby={`lend-${key}-title`}>
      <h2 id={`lend-${key}-title`} className={s.groupTitle}>{title}</h2>
      <p className={`muted ${s.groupNote}`}>{note}</p>
      <ul className={s.list}>
        {rows.map((r) => (
          <ReservationCard key={r._id} reservation={r}>
            <RequestAnswer reservation={r} onStale={stale} onDone={done} />
            {r.actions?.pickup && <PickupButton reservation={r} onStale={stale} onDone={done} />}
            {r.actions?.decideExtension && <ExtensionAnswer reservation={r} onStale={stale} onDone={done} />}
            {r.actions?.returnGood && <ReturnActions reservation={r} onStale={stale} onDone={done} />}
          </ReservationCard>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="container">
      <p className={s.backLink}><Link to="/lender/items">← My items</Link></p>
      <div className={s.dashHead}>
        <h1 className={s.pageTitle}>Booking requests</h1>
        <Link to="/lender/dashboard" className="btn btn-secondary">Dashboard</Link>
      </div>
      <p className={`muted ${s.lead}`}>Every booking of your items: answer new requests, see what&apos;s coming up and what&apos;s out now.</p>

      {data && hasWaiting && tabKey !== 'action' && (
        <div className={`card ${s.waitingBanner}`} role="status">
          <p className={s.waitingText}><strong>{waitingText(waiting)}</strong></p>
          <button type="button" className="btn" onClick={() => go({ tab: 'action', page: 1 })}>Show them</button>
        </div>
      )}

      <div className="tabs" role="group" aria-label="Show bookings">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab ${tabKey === t.key ? 'active' : ''}`} aria-pressed={tabKey === t.key}
            onClick={() => { setNotice(''); setProblem(''); go({ tab: t.key, page: 1 }); }}>
            {t.label}{t.key === 'action' && data && hasWaiting ? ` (${waiting.requests + waiting.extensions})` : ''}
          </button>
        ))}
      </div>

      <fieldset className={s.dateFilter}>
        <legend className={s.dateFilterLegend}>Filter</legend>
        <div className={s.filterRow}>
          <FormField label="Item" error={fieldErrors.item}>
            <select value={itemId} onChange={(e) => go({ item: e.target.value, page: 1 })} disabled={!items}>
              <option value="">All my items</option>
              {(items || []).map((i) => (
                <option key={i._id} value={i._id}>{i.title}{i.isArchived ? ' (archived)' : ''} · {plural(i.bookings, 'booking')}</option>
              ))}
              {itemId && items && !itemName && <option value={itemId}>Unknown item</option>}
            </select>
          </FormField>
          <FormField label="From" error={fieldErrors.from}>
            <input type="date" value={from} max={to || undefined} onChange={(e) => go({ from: e.target.value, page: 1 })} />
          </FormField>
          <FormField label="To" error={rangeError || fieldErrors.to}>
            <input type="date" value={to} min={from || undefined} onChange={(e) => go({ to: e.target.value, page: 1 })} />
          </FormField>
        </div>
        <div className={s.dateFilterFoot}>
          <p className="muted">Dates show bookings that overlap these days.</p>
          {filtered && <button type="button" className="btn btn-secondary" onClick={() => go({ item: '', from: '', to: '', page: 1 })}>Clear filters</button>}
        </div>
      </fieldset>

      <Alert variant="success">{notice}</Alert>
      <Alert variant="error">{problem}</Alert>

      {loading && !data && !rangeError && <Spinner label="Loading bookings..." />}

      {error && !rangeError && (
        <div className={s.loadError}>
          <Alert variant="error">{error}</Alert>
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      )}

      {!error && !rangeError && data && (
        <>
          <p className={`muted ${s.count}`} aria-live="polite">
            {loading ? 'Updating...'
              : `${plural(data.total, 'booking')}${tabKey === 'all' ? '' : ` · ${tab.label.toLowerCase()}`}${itemName ? ` · ${itemName}` : ''}${rangeText}`}
          </p>
          {list.length === 0 && !loading ? (
            <div className={`center ${s.empty}`}>
              <p className="muted">{filtered ? 'No bookings match these filters.' : tab.empty}</p>
              {filtered && <button type="button" className="btn btn-secondary" onClick={() => go({ item: '', from: '', to: '', page: 1 })}>Clear filters</button>}
            </div>
          ) : (
            <div className={`${s.resGroups} ${loading ? s.updating : ''}`} aria-busy={loading}>
              {grouped
                ? <>{section('open', 'Open', 'Waiting for your answer, coming up, or out now.', open)}{section('past', 'Past', 'Returned, cancelled or declined.', past)}</>
                : section('action', 'Waiting for your answer', 'Oldest first, so nobody waits longest.', open)}
            </div>
          )}
          <Pagination page={data.page} pages={data.pages} onChange={(pg) => { go({ page: pg }); window.scrollTo(0, 0); }} />
        </>
      )}
    </div>
  );
}
