// APPLICATION DETAIL - Owner: Member 3 - Requirements: 8, 9
// Route: /admin/lender-applications/:id   Access: admin   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import DocumentViewer from '../../components/admin/DocumentViewer';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { getApplication, decideApplication } from '../../api/adminLenderApplications.api';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../components/lender/lender.css';

const formatAddress = (a = {}) => [a.street, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(', ');

export default function AdminLenderApplicationDetailPage() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [deciding, setDeciding] = useState('');

  useEffect(() => {
    getApplication(id)
      .then((data) => setApplication(data.application))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const decide = async (decision) => {
    setError('');
    setSuccess('');
    setReasonError('');
    if (decision === 'reject' && reason.trim().length < 3) {
      setReasonError('Please give a reason for the rejection (at least 3 characters)');
      return;
    }
    const name = application.user?.name || 'this applicant';
    const question = decision === 'approve'
      ? `Approve ${name} as a verified lender?`
      : `Reject the application from ${name}?`;
    if (!window.confirm(question)) return;

    setDeciding(decision);
    try {
      const data = await decideApplication(id, { decision, ...(decision === 'reject' ? { reason: reason.trim() } : {}) });
      setApplication(data.application);
      setSuccess(decision === 'approve'
        ? `${name} is now a verified lender.`
        : 'The application was rejected. The applicant can see your reason and resubmit.');
    } catch (err) {
      const reasonErr = getFieldErrors(err).find((e) => e.field === 'reason');
      if (reasonErr) setReasonError(reasonErr.message);
      else setError(getErrorMessage(err));
    } finally {
      setDeciding('');
    }
  };

  if (loading) return <div className="container"><Spinner /></div>;

  if (!application) {
    return (
      <div className="container">
        <h1>Application detail</h1>
        <Alert variant="error">{error || 'Application not found'}</Alert>
        <Link to="/admin/lender-applications">Back to applications</Link>
      </div>
    );
  }

  const { user } = application;
  const pending = application.status === 'pending';

  return (
    <div className="container">
      <p><Link to="/admin/lender-applications">← Back to applications</Link></p>
      <h1>Application from {user?.name || 'deleted user'}</h1>

      <section className="card lender-section">
        <div className="card-body">
          <h2>Applicant</h2>
          {user ? (
            <dl className="lender-facts">
              <dt>Name</dt><dd>{user.name}</dd>
              <dt>Username</dt><dd>@{user.username}</dd>
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Phone</dt><dd>{user.phone}</dd>
              <dt>Address</dt><dd>{formatAddress(user.address)}</dd>
              <dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd>
              <dt>Trust score</dt><dd>{user.trustScore}</dd>
              <dt>Account</dt><dd><StatusBadge status={user.status} /></dd>
            </dl>
          ) : (
            <p className="muted">This user account no longer exists.</p>
          )}
        </div>
      </section>

      <section className="card lender-section">
        <div className="card-body">
          <h2>Application</h2>
          <dl className="lender-facts">
            <dt>Status</dt><dd><StatusBadge status={application.status} /></dd>
            <dt>Submitted</dt><dd>{formatDateTime(application.submittedAt)}</dd>
            {application.reviewedAt && (
              <>
                <dt>Reviewed</dt>
                <dd>{formatDateTime(application.reviewedAt)}{application.reviewedBy && ` by ${application.reviewedBy.name}`}</dd>
              </>
            )}
            {application.rejectionReason && (<><dt>Reason</dt><dd>{application.rejectionReason}</dd></>)}
          </dl>
        </div>
      </section>

      <h2>Documents</h2>
      <div className="lender-section">
        <DocumentViewer applicationId={application._id} documents={application.documents} />
      </div>

      <Alert variant="success">{success}</Alert>

      {pending && user && (
        <section className="card lender-section">
          <div className="card-body">
            <h2>Decision</h2>
            <p className="muted">Check that the ID and proof of address match the applicant&apos;s name and address.</p>
            <FormField label="Reason for rejection" hint="Required only when rejecting. The applicant will see it." error={reasonError}>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </FormField>
            <Alert variant="error">{error}</Alert>
            <div className="row">
              <button type="button" className="btn" onClick={() => decide('approve')} disabled={!!deciding}>
                {deciding === 'approve' ? 'Approving...' : 'Approve'}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => decide('reject')} disabled={!!deciding}>
                {deciding === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </section>
      )}
      {!pending && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
