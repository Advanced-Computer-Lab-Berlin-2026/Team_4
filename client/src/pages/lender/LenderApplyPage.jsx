// BECOME A VERIFIED LENDER - Owner: Member 3 - Requirements: 2, 3
// Route: /lender/apply   Access: member   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// API calls: src/api/*.api.js   Shared UI: src/components/common/*
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import DocumentUploader from '../../components/lender/DocumentUploader';
import { DOC_LABELS, DOC_NOUNS } from '../../components/lender/DocumentPreview';
import { getErrorMessage } from '../../api/axios';
import { getMyApplication, submitApplication } from '../../api/lenderApplications.api';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/format';
import '../../components/lender/lender.css';

const DOC_TYPES = ['id_document', 'proof_of_address'];

export default function LenderApplyPage() {
  const { user, refreshUser } = useAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getMyApplication()
      .then((data) => setApplication(data.application))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const onChanged = (next) => { setApplication(next); setSuccess(''); };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const data = await submitApplication();
      setApplication(data.application);
      setSuccess('Application submitted. An admin will review your documents soon.');
      refreshUser();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container"><Spinner /></div>;

  // seeded verified lenders may have no application record
  const status = application?.status || (user?.lenderStatus === 'verified' ? 'approved' : 'none');
  const documents = application?.documents || [];
  const editable = status === 'none' || status === 'draft' || status === 'rejected';
  const missing = DOC_TYPES.filter((t) => !documents.some((d) => d.type === t));

  return (
    <div className="container">
      <h1>Become a verified lender</h1>

      {status !== 'none' && (
        <p className="row">
          <span>Application status:</span> <StatusBadge status={status} />
          {application?.submittedAt && <span className="muted">Submitted {formatDateTime(application.submittedAt)}</span>}
        </p>
      )}

      {status === 'approved' && (
        <Alert variant="success">
          You are a verified lender. <Link to="/lender/items">List your first item</Link>.
        </Alert>
      )}
      {status === 'pending' && (
        <Alert variant="info">Your application is being reviewed. You will be able to list items once an admin approves it.</Alert>
      )}
      {status === 'rejected' && (
        <Alert variant="error">
          Your application was rejected.
          {application.rejectionReason && <> Reason: <strong>{application.rejectionReason}</strong>.</>} You can replace
          your documents and submit again.
        </Alert>
      )}
      {editable && (
        <p className="muted">
          To lend items on ShareShed, upload a valid ID document and a proof of address (for example a recent utility
          bill). Your documents are private and only seen by ShareShed admins.
        </p>
      )}

      <div className="lender-doc-list lender-doc-list-2 lender-section">
        {DOC_TYPES.map((type) => (
          <DocumentUploader
            key={type}
            type={type}
            label={DOC_LABELS[type]}
            documents={documents}
            onUploaded={onChanged}
            onRemoved={onChanged}
            disabled={!editable}
          />
        ))}
      </div>

      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{success}</Alert>

      {editable && (
        <div className="lender-section">
          <button type="button" className="btn" onClick={handleSubmit} disabled={submitting || missing.length > 0}>
            {submitting ? 'Submitting...' : status === 'rejected' ? 'Resubmit application' : 'Submit application'}
          </button>
          {missing.length > 0 && (
            <div className="field-hint">Upload your {missing.map((t) => DOC_NOUNS[t]).join(' and ')} to submit.</div>
          )}
        </div>
      )}
    </div>
  );
}
