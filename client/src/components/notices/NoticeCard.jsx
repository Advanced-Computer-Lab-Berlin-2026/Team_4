// NoticeCard - Owner: Member 9 - Requirements: 41, 42
// Props: { notice } - single community notice
import { formatDateTime } from '../../utils/format';

export default function NoticeCard({ notice }) {
  return (
    <article className="card">
      <div className="card-body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{notice.title}</h2>
          {notice.pinned && <span className="badge badge-amber">Pinned</span>}
        </div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{notice.body}</p>
        <div className="muted">
          Posted by {notice.postedBy?.name || 'ShareShed admin'}
          {notice.createdAt && ` · ${formatDateTime(notice.createdAt)}`}
        </div>
      </div>
    </article>
  );
}
