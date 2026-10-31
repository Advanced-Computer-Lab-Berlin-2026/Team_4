// ManualViewer - Owner: Member 6 - Requirements: 33
// Props: { item } - link/preview of the manual; renders null if none
import { formatDate } from '../../utils/format';

export default function ManualViewer({ item }) {
  const manual = item?.manual;
  if (!manual?.url) return null;

  const isImage = manual.mimeType?.startsWith('image/');
  const label = manual.originalName || 'Usage manual';

  return (
    <section className="card">
      <div className="card-body">
        <h2>Usage manual</h2>
        <p className="muted">
          Review this manual before reserving the item.
          {manual.uploadedAt ? ` Uploaded ${formatDate(manual.uploadedAt)}.` : ''}
        </p>
        {isImage && <img src={manual.url} alt={`Usage manual for ${item?.title || 'this item'}`} />}
        <p>
          <a className="btn btn-secondary" href={manual.url} target="_blank" rel="noreferrer">
            Open manual
          </a>
        </p>
        <p className="muted">{label}</p>
      </div>
    </section>
  );
}
