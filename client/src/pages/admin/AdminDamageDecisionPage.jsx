// DAMAGE DECISIONS - Owner: Member 3 (Sprint 2) - Requirements: 62, 64, 80
// Routes (declared in src/routes/sprint2/member3.routes.jsx):
//   /admin/damage-reports        admin - work queue by status
//   /admin/damage-reports/:id    admin - evidence + decide the forfeit (Req 62) or resolve a dispute (Req 64)
// Member 4's cross-platform damage report (Req 96) links its rows to /admin/damage-reports/:id.
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import DamageReportDetails from '../../components/sprint2/m3/DamageReportDetails';
import { DamageStatusBadge, personName } from '../../components/sprint2/m3/shared';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { decideReport, getReport, listReports, resolveReport } from '../../api/damageReports.api';
import { formatDateTime, formatMoney } from '../../utils/format';
import styles from '../../styles/sprint2/member3.module.css';

const STATUS_FILTERS = [['open', 'Open - needs a decision'], ['disputed', 'Disputed - needs a resolution'], ['decided', 'Decided'], ['resolved', 'Resolved'], ['', 'All']];

/** Amount form used for both the decision and the resolution. */
function AmountForm({ title, intro, amountLabel, max, submitLabel, confirmText, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    const next = {};
    if (amount === '' || Number.isNaN(value) || value < 0) next.amount = 'Enter an amount of 0 or more';
    else if (value > max) next.amount = `At most ${formatMoney(max)}`;
    if (note.trim().length < 3) next.note = 'Add a note of at least 3 characters';
    setErrors(next);
    if (Object.keys(next).length || !window.confirm(confirmText(value))) return;

    setSaving(true);
    try {
      await onSubmit(Math.round(value * 100) / 100, note.trim());
    } catch (err) {
      const fields = Object.fromEntries(getFieldErrors(err).map((f) => [f.field === 'note' ? 'note' : 'amount', f.message]));
      if (Object.keys(fields).length) setErrors(fields);
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={`card ${styles.section}`} onSubmit={submit} noValidate>
      <div className="card-body">
        <h2>{title}</h2>
        <p className="muted">{intro}</p>
        <FormField label={amountLabel} error={errors.amount} hint={`Between ${formatMoney(0)} and ${formatMoney(max)}`}>
          <input type="number" min="0" max={max} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Note (visible to both members)" error={errors.note}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <Alert variant="error">{error}</Alert>
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button>
      </div>
    </form>
  );
}

function CaseView({ id }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getReport(id).then((d) => setReport(d.report)).catch((err) => setError(getErrorMessage(err)));
  }, [id]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!report) return <Spinner />;

  const held = report.reservation?.deposit?.amount ?? 0;
  const decided = report.decision?.forfeitAmount ?? 0;

  return (
    <>
      <Alert variant="success">{notice}</Alert>
      <DamageReportDetails report={report} />

      {report.status === 'open' && (
        <AmountForm
          title="Decide"
          intro={`Compare the pickup and return photos, then decide how much of the ${formatMoney(held)} deposit to keep. The rest goes back to the borrower's wallet. Enter 0 to release everything.`}
          amountLabel="Amount to keep (EGP)"
          max={held}
          submitLabel="Save decision"
          confirmText={(v) => `Keep ${formatMoney(v)} and release ${formatMoney(held - v)} to ${personName(report.borrower)}?`}
          onSubmit={async (forfeitAmount, note) => {
            const d = await decideReport(id, { forfeitAmount, note });
            setReport(d.report);
            setNotice('Decision saved.');
          }}
        />
      )}

      {report.status === 'disputed' && (
        <AmountForm
          title="Resolve the dispute"
          intro={`The decision kept ${formatMoney(decided)}. The final amount can stay the same or go down; the difference is refunded to the borrower's wallet.`}
          amountLabel="Final amount to keep (EGP)"
          max={decided}
          submitLabel="Save final outcome"
          confirmText={(v) => `Final amount ${formatMoney(v)}: refund ${formatMoney(decided - v)} to ${personName(report.borrower)}?`}
          onSubmit={async (finalForfeitAmount, note) => {
            const d = await resolveReport(id, { finalForfeitAmount, note });
            setReport(d.report);
            setNotice('Dispute resolved.');
          }}
        />
      )}
    </>
  );
}

function Queue() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    listReports({ status: status || undefined, page }).then(setData).catch((err) => setError(getErrorMessage(err)));
  }, [status, page]);

  return (
    <>
      <div className="row">
        <FormField label="Status">
          <select value={status} onChange={(e) => setParams({ status: e.target.value })}>
            {STATUS_FILTERS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
          </select>
        </FormField>
      </div>
      <Alert variant="error">{error}</Alert>
      {!data && !error && <Spinner />}
      {data?.items.length === 0 && <p className="muted">No damage reports here.</p>}
      {data?.items.length > 0 && (
        <>
          <p className="muted">{data.total} report{data.total === 1 ? '' : 's'}, oldest first</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Lender</th><th>Borrower</th><th>Reported</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r._id}>
                    <td>{r.item?.title || 'Item'}</td>
                    <td>{r.reportedBy?.name}</td>
                    <td>{r.borrower?.name}</td>
                    <td>{formatDateTime(r.createdAt)}</td>
                    <td><DamageStatusBadge status={r.status} /></td>
                    <td>
                      <Link className="btn btn-small" to={`/admin/damage-reports/${r._id}`}>
                        {r.status === 'open' ? 'Decide' : r.status === 'disputed' ? 'Resolve' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setParams({ status, page: String(p) })} />
        </>
      )}
    </>
  );
}

export default function AdminDamageDecisionPage() {
  const { id } = useParams();
  return (
    <div className="container">
      {id && <p><Link to="/admin/damage-reports">← Damage reports</Link></p>}
      <h1>{id ? 'Damage case' : 'Damage reports'}</h1>
      {id ? <CaseView id={id} /> : <Queue />}
    </div>
  );
}
