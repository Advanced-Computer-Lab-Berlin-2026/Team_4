// DocumentViewer - Owner: Member 3 - Requirements: 8
// Props: { applicationId, documents } — admin view/download of each document
import { downloadDocument } from '../../api/adminLenderApplications.api';
import { formatDateTime } from '../../utils/format';
import DocumentPreview, { DOC_LABELS, formatSize } from '../lender/DocumentPreview';
import '../lender/lender.css';

export default function DocumentViewer({ applicationId, documents = [] }) {
  if (!documents.length) return <p className="muted">No documents were uploaded.</p>;

  return (
    <div className="lender-doc-list">
      {documents.map((doc) => (
        <article key={doc._id} className="card">
          <div className="card-body">
            <h3>{DOC_LABELS[doc.type] || doc.type}</h3>
            <div className="lender-doc-file">
              <strong>{doc.originalName}</strong>
              <span className="muted">{doc.mimeType} · {formatSize(doc.size)} · uploaded {formatDateTime(doc.uploadedAt)}</span>
            </div>
            <DocumentPreview doc={doc} load={() => downloadDocument(applicationId, doc._id)} />
          </div>
        </article>
      ))}
    </div>
  );
}
