// POST COMMUNITY NOTICE - Owner: Member 9 - Requirements: 41
// Route: /admin/notices - Access: admin
import { useState } from 'react';
import { createNotice } from '../../api/notices.api';
import { getErrorMessage } from '../../api/axios';
import Alert from '../../components/common/Alert';
import FormField from '../../components/common/FormField';
import NoticeCard from '../../components/notices/NoticeCard';

export default function AdminNoticesPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdNotice, setCreatedNotice] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { notice } = await createNotice({ title, body, pinned });
      setCreatedNotice(notice);
      setSuccess('Community notice posted successfully.');
      setTitle('');
      setBody('');
      setPinned(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <h1>Post community notice</h1>
      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{success}</Alert>
      <form className="form-card" onSubmit={handleSubmit}>
        <FormField label="Title">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={150}
            required
          />
        </FormField>
        <FormField label="Notice">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            required
          />
        </FormField>
        <label className="row" style={{ marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          Pin this notice to the top of the board
        </label>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Posting...' : 'Post notice'}
        </button>
      </form>
      {createdNotice && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Posted notice</h2>
          <NoticeCard notice={createdNotice} />
        </section>
      )}
    </div>
  );
}
