// DAMAGE REPORTS - Owner: Member 3 (Sprint 2) - Requirements: 61, 63
// Routes (declared in src/routes/sprint2/member3.routes.jsx):
//   /damage-reports                         member  - my damage reports (as lender or borrower)
//   /damage-reports/new?reservation=:id     lender  - return an active reservation as damaged (Req 61)
//   /damage-reports/:id                     member  - view a case; the borrower can dispute the decision (Req 63)
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import ConditionPhotoPanel from '../../components/sprint2/m3/ConditionPhotoPanel';
import DamageReportDetails from '../../components/sprint2/m3/DamageReportDetails';
import { DamageStatusBadge } from '../../components/sprint2/m3/shared';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { createReport, disputeReport, getReport, listMyReports } from '../../api/damageReports.api';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, formatMoney } from '../../utils/format';
import styles from '../../styles/sprint2/member3.module.css';

const fieldErrors = (err) => Object.fromEntries(getFieldErrors(err).map((f) => [f.field, f.message]));

function NewReport({ reservationId }) {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!reservationId) {
    return <Alert variant="error">Open this page from an active reservation to report damage.</Alert>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (description.trim().length < 10) return setErrors({ description: 'Describe the damage in at least 10 characters' });
    setErrors({});
    setSaving(true);
    try {
      const { report } = await createReport({ reservationId, description: description.trim() });
      navigate(`/damage-reports/${report._id}`, { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <>
      <p className="muted">
        Use this instead of &quot;Returned in good condition&quot; when the item comes back damaged. It records the return and
        keeps the deposit held until an admin decides how much of it, if any, is kept.
      </p>
      <section className={`card ${styles.section}`} aria-labelledby="evidence-heading">
        <div className="card-body">
          <h2 id="evidence-heading">1. Add return photos</h2>
          <p className="muted">Photograph the damage now. Once you report, the photos are locked as evidence for the admin.</p>
          <ConditionPhotoPanel reservationId={reservationId} />
        </div>
      </section>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card-body">
          <h2>2. Describe the damage</h2>
          <FormField label="What is damaged?" error={errors.description} hint={`${description.length}/2000`}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </FormField>
          <Alert variant="error">{error}</Alert>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Reporting...' : 'Return as damaged'}</button>
        </div>
      </form>
    </>
  );
}

function DisputeForm({ report, onDisputed }) {
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (reason.trim().length < 10) return setErrors({ reason: 'Explain your dispute in at least 10 characters' });
    if (!window.confirm('Send this dispute? You can dispute a decision only once.')) return undefined;
    setErrors({});
    setSaving(true);
    try {
      const data = await disputeReport(report._id, { reason: reason.trim() });
      onDisputed(data.report);
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <form className={`card ${styles.section}`} onSubmit={submit} noValidate>
      <div className="card-body">
        <h2>Dispute this decision</h2>
        <p className="muted">
          {formatMoney(report.decision.forfeitAmount)} of your deposit was kept. If you disagree, explain why before{' '}
          {formatDateTime(report.disputeDeadline)}. An admin will review it and can lower the amount.
        </p>
        <FormField label="Why do you disagree?" error={errors.reason} hint={`${reason.length}/2000`}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </FormField>
        <Alert variant="error">{error}</Alert>
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Sending...' : 'Send dispute'}</button>
      </div>
    </form>
  );
}

function ReportView({ id }) {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setReport(null);
    setError('');
    getReport(id).then((d) => setReport(d.report)).catch((err) => setError(getErrorMessage(err)));
  }, [id]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!report) return <Spinner />;

  const isBorrower = String(report.borrower?._id) === String(user?._id);
  const canDispute = isBorrower && report.status === 'decided' && report.decision?.forfeitAmount > 0
    && new Date(report.disputeDeadline) > new Date();

  return (
    <>
      <Alert variant="success">{notice}</Alert>
      <DamageReportDetails report={report} />
      {canDispute && <DisputeForm report={report} onDisputed={(r) => { setReport(r); setNotice('Your dispute was sent to an admin.'); }} />}
    </>
  );
}

function MyReports() {
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || '';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    listMyReports({ role: role || undefined, page })
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)));
  }, [role, page]);

  return (
    <>
      <div className="row">
        <FormField label="Show">
          <select value={role} onChange={(e) => setParams(e.target.value ? { role: e.target.value } : {})}>
            <option value="">All my cases</option>
            <option value="lender">Reported by me (lender)</option>
            <option value="borrower">Against me (borrower)</option>
          </select>
        </FormField>
      </div>
      <Alert variant="error">{error}</Alert>
      {!data && !error && <Spinner />}
      {data?.items.length === 0 && <p className="muted">No damage reports.</p>}
      {data?.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Reported</th><th>Status</th><th>Amount kept</th><th>Actions</th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r._id}>
                    <td>{r.item?.title || 'Item'}</td>
                    <td>{formatDateTime(r.createdAt)}</td>
                    <td><DamageStatusBadge status={r.status} /></td>
                    <td>{r.resolution ? formatMoney(r.resolution.finalForfeitAmount) : r.decision ? formatMoney(r.decision.forfeitAmount) : '—'}</td>
                    <td><Link className="btn btn-small" to={`/damage-reports/${r._id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setParams({ ...(role ? { role } : {}), page: String(p) })} />
        </>
      )}
    </>
  );
}

export default function DamageReportPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const isNew = id === undefined && pathname.endsWith('/new');

  return (
    <div className="container">
      {id && <p><Link to="/damage-reports">← My damage reports</Link></p>}
      <h1>{isNew ? 'Report damage' : id ? 'Damage report' : 'My damage reports'}</h1>
      {isNew && <NewReport key={params.get('reservation')} reservationId={params.get('reservation')} />}
      {id && <ReportView key={id} id={id} />}
      {!id && !isNew && <MyReports />}
    </div>
  );
}
