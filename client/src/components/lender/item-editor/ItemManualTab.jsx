// ItemManualTab - Owner: Member 6 - Requirements: 32
// Props: { item, onSaved } - upload / replace / remove manual
import { useRef, useState } from 'react';
import { getErrorMessage } from '../../../api/axios';
import { removeManual, uploadManual } from '../../../api/itemPolicies.api';
import Alert from '../../common/Alert';

export default function ItemManualTab({ item, onSaved }) {
  const busyRef = useRef(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState('');

  if (!item?._id) return <Alert variant="info">Save the item details before uploading a usage manual.</Alert>;

  const handleUpload = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (!file) {
      setError('Choose a PDF, JPG, JPEG or PNG manual to upload.');
      return;
    }

    busyRef.current = true;
    const formElement = event.currentTarget || event.target;
    setSubmitting('upload');
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await uploadManual(item._id, formData);
      onSaved?.(data.item);
      setFile(null);
      formElement.reset();
      setSuccess('Usage manual uploaded.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      busyRef.current = false;
      setSubmitting('');
    }
  };

  const handleRemove = async () => {
    if (busyRef.current || !window.confirm('Remove this usage manual?')) return;
    busyRef.current = true;

    setSubmitting('remove');
    setError('');
    setSuccess('');
    try {
      const data = await removeManual(item._id);
      onSaved?.(data.item);
      setSuccess('Usage manual removed.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      busyRef.current = false;
      setSubmitting('');
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <h2>Usage manual</h2>
        <p className="muted">Upload one manual so borrowers can review safe setup and operating steps before reserving.</p>
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{success}</Alert>

        {item.manual?.url ? (
          <p>
            <strong>Current manual:</strong>{' '}
            <a href={item.manual.url} target="_blank" rel="noreferrer">
              {item.manual.originalName || 'Open manual'}
            </a>
          </p>
        ) : (
          <p className="muted">No usage manual has been uploaded yet.</p>
        )}

        <form onSubmit={handleUpload}>
          <div className="field">
            <label htmlFor="manual-file">Manual file</label>
            <input
              id="manual-file"
              type="file"
              disabled={!!submitting}
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <div className="field-hint">Accepted types: PDF, JPG, JPEG or PNG. Max size: 5 MB.</div>
          </div>
          {file && <p className="muted">Selected: {file.name}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={!!submitting}>
              {submitting === 'upload' ? 'Uploading...' : item.manual?.url ? 'Replace manual' : 'Upload manual'}
            </button>
            {item.manual?.url && (
              <button className="btn btn-danger" type="button" onClick={handleRemove} disabled={!!submitting}>
                {submitting === 'remove' ? 'Removing...' : 'Remove manual'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
