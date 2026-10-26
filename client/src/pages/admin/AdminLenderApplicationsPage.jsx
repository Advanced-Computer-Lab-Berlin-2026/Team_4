// LENDER APPLICATIONS - Owner: Member 3 - Requirements: 9
// Route: /admin/lender-applications   Access: admin   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import { getErrorMessage } from '../../api/axios';
import { listApplications } from '../../api/adminLenderApplications.api';
import { formatDateTime } from '../../utils/format';

const FILTERS = [
  ['pending', 'Pending review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['', 'All'],
];

export default function AdminLenderApplicationsPage() {
  // filter + page live in the URL so "back" from the detail page keeps them
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const page = Number(params.get('page')) || 1;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listApplications({ status: status || undefined, page })
      .then(setData)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [status, page]);

  const update = (next) => setParams({ status, page: String(page), ...next });

  return (
    <div className="container">
      <h1>Lender applications</h1>

      <div className="row">
        <FormField label="Status">
          <select value={status} onChange={(e) => update({ status: e.target.value, page: '1' })}>
            {FILTERS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
          </select>
        </FormField>
      </div>

      <Alert variant="error">{error}</Alert>
      {loading && <Spinner />}
      {!loading && !error && data?.items.length === 0 && (
        <p className="muted">{status === 'pending' ? 'No applications are waiting for review.' : 'No applications found.'}</p>
      )}

      {!loading && data?.items.length > 0 && (
        <>
          <p className="muted">{data.total} application{data.total === 1 ? '' : 's'}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Submitted</th>
                  <th>Documents</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <Link to={`/admin/lender-applications/${a._id}`}>{a.user?.name || 'Deleted user'}</Link>
                      {a.user && <div className="muted">@{a.user.username}</div>}
                    </td>
                    <td>{a.user?.email}</td>
                    <td>{formatDateTime(a.submittedAt)}</td>
                    <td>{a.documents.length}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      <Link className="btn btn-small" to={`/admin/lender-applications/${a._id}`}>
                        {a.status === 'pending' ? 'Review' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: String(p) })} />
        </>
      )}
    </div>
  );
}
