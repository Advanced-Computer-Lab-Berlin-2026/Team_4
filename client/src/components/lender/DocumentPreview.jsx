// DocumentPreview - Owner: Member 3 - Requirements: 3, 8
// Props: { doc, load } — `load()` resolves to a Blob from an authenticated endpoint.
// Private documents are never exposed by a public URL, so we fetch them and show/download a blob: URL.
import { useEffect, useState } from 'react';
import Alert from '../common/Alert';
import { getErrorMessage } from '../../api/axios';
import './lender.css';

export const DOC_LABELS = { id_document: 'ID document', proof_of_address: 'Proof of address' };

export const formatSize = (bytes = 0) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function DocumentPreview({ doc, load }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  const getUrl = async () => {
    if (url) return url;
    const blob = await load();
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return next;
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };

  const toggle = () => (open ? setOpen(false) : run(async () => { await getUrl(); setOpen(true); }));

  const download = () => run(async () => {
    const a = document.createElement('a');
    a.href = await getUrl();
    a.download = doc.originalName || 'document';
    a.click();
  });

  const isImage = (doc.mimeType || '').startsWith('image/');

  return (
    <div className="lender-doc-preview">
      <div className="row">
        <button type="button" className="btn btn-small btn-secondary" onClick={toggle} disabled={busy} aria-expanded={open}>
          {busy && !open ? 'Loading...' : open ? 'Hide' : 'View'}
        </button>
        <button type="button" className="btn btn-small btn-secondary" onClick={download} disabled={busy}>Download</button>
      </div>
      <Alert variant="error">{error}</Alert>
      {open && url && (
        <div className="lender-doc-frame">
          {isImage
            ? <img src={url} alt={`${DOC_LABELS[doc.type] || 'Document'}: ${doc.originalName || ''}`} />
            : <iframe src={url} title={`${DOC_LABELS[doc.type] || 'Document'} preview`} />}
        </div>
      )}
    </div>
  );
}
