// DocumentPreview - Owner: Member 3 - Requirements: 3, 8
// Props: { doc, load } — `load()` resolves to a Blob from an authenticated endpoint.
// Private documents are never exposed by a public URL, so we fetch them and show/download a blob: URL.
import { useEffect, useRef, useState } from 'react';
import Alert from '../common/Alert';
import { getErrorMessage } from '../../api/axios';
import './lender.css';

export const DOC_LABELS = { id_document: 'ID document', proof_of_address: 'Proof of address' };
// mid-sentence form ("Upload your ID document and proof of address")
export const DOC_NOUNS = { id_document: 'ID document', proof_of_address: 'proof of address' };

export const formatSize = (bytes = 0) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function DocumentPreview({ doc, load }) {
  return <DocumentPreviewContent key={doc._id} doc={doc} load={load} />;
}

function DocumentPreviewContent({ doc, load }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = useRef(false);
  const blobUrl = useRef('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);

  const getUrl = async () => {
    if (url) return url;
    const blob = await load();
    if (!active.current) return null;
    const next = URL.createObjectURL(blob);
    blobUrl.current = next;
    setUrl(next);
    return next;
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { if (active.current) setError(getErrorMessage(err)); } finally { if (active.current) setBusy(false); }
  };

  const toggle = () => (open ? setOpen(false) : run(async () => { if (await getUrl()) setOpen(true); }));

  const download = () => run(async () => {
    const a = document.createElement('a');
    const downloadUrl = await getUrl();
    if (!downloadUrl) return;
    a.href = downloadUrl;
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
