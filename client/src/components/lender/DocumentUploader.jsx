// DocumentUploader - Owner: Member 3 - Requirements: 3
// Props: { type, label, documents, onUploaded, onRemoved, disabled } — upload/remove one doc type
//   onUploaded(application) / onRemoved(application) receive the updated application from the server.
import { useId, useState } from 'react';
import Alert from '../common/Alert';
import { getErrorMessage } from '../../api/axios';
import { uploadDocument, removeDocument, previewDocument } from '../../api/lenderApplications.api';
import { ALLOWED_FILE_TYPES, MAX_UPLOAD_MB } from '../../utils/validators';
import { formatDateTime } from '../../utils/format';
import DocumentPreview, { DOC_NOUNS, formatSize } from './DocumentPreview';
import './lender.css';

export default function DocumentUploader({ type, label, documents = [], onUploaded, onRemoved, disabled = false }) {
  const inputId = useId();
  const [progress, setProgress] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  const doc = documents.find((d) => d.type === type);
  const busy = progress !== null || removing;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again after an error
    if (!file) return;
    setError('');
    if (!ALLOWED_FILE_TYPES.includes(file.type)) return setError('Unsupported file type. Allowed: PDF, JPG, JPEG or PNG');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return setError(`File too large (max ${MAX_UPLOAD_MB} MB)`);

    setProgress(0);
    try {
      const { application } = await uploadDocument(type, file, setProgress);
      onUploaded?.(application);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove your ${DOC_NOUNS[type] || label}?`)) return;
    setRemoving(true);
    setError('');
    try {
      const { application } = await removeDocument(doc._id);
      onRemoved?.(application);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="card" aria-labelledby={`${inputId}-title`}>
      <div className="card-body">
        <h3 id={`${inputId}-title`}>{label}</h3>

        {doc ? (
          <>
            <div className="lender-doc-file">
              <strong>{doc.originalName}</strong>
              <span className="muted">{formatSize(doc.size)} · uploaded {formatDateTime(doc.uploadedAt)}</span>
            </div>
            <DocumentPreview doc={doc} load={() => previewDocument(doc._id)} />
          </>
        ) : (
          <p className="muted">Not uploaded yet.</p>
        )}

        {!disabled && (
          <div className="field">
            <label htmlFor={inputId}>{doc ? 'Replace file' : 'Choose a file'}</label>
            <input
              id={inputId}
              className="lender-upload-input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handleFile}
              disabled={busy}
            />
            <div className="field-hint">PDF, JPG, JPEG or PNG · max {MAX_UPLOAD_MB} MB</div>
          </div>
        )}

        {progress !== null && (
          <progress className="lender-progress" max="100" value={progress} aria-label={`Uploading ${label}`}>{progress}%</progress>
        )}
        <Alert variant="error">{error}</Alert>

        {doc && !disabled && (
          <button type="button" className="btn btn-small btn-danger" onClick={handleRemove} disabled={busy}>
            {removing ? 'Removing...' : 'Remove'}
          </button>
        )}
      </div>
    </section>
  );
}
