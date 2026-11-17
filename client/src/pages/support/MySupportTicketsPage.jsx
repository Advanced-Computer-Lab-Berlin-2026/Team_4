import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMySupportTickets, submitSupportTicket } from '../../api/supportTickets.api';
import styles from '../../styles/sprint2/member4.module.css';

export default function MySupportTicketsPage() {
    const [tickets, setTickets] = useState([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');

    const [form, setForm] = useState({
        subject: '',
        category: 'other',
        description: '',
        relatedTargetType: 'none',
        relatedTargetId: '',
    });

    const loadTickets = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getMySupportTickets(statusFilter ? { status: statusFilter } : {});
            setTickets(res.items || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load your support tickets.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTickets();
    }, [statusFilter]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setFeedback('');
        try {
            await submitSupportTicket(form);
            setForm({
                subject: '',
                category: 'other',
                description: '',
                relatedTargetType: 'none',
                relatedTargetId: '',
            });
            setFeedback('Support ticket submitted successfully.');
            loadTickets();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit support ticket.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h2 className={styles.title}>Support Center</h2>
                    <p className={styles.subtitle}>
                        Submit an issue to administrators or track the status of your existing tickets.
                    </p>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {feedback && <div className={styles.success}>{feedback}</div>}

            {/* Req 109: Submit Support Ticket */}
            <form className={styles.card} onSubmit={handleSubmit}>
                <h3 style={{ marginTop: 0 }}>Submit a New Support Ticket</h3>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup} style={{ flex: 2 }}>
                        <label className={styles.label}>Subject</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="Brief summary of your issue"
                            value={form.subject}
                            onChange={(e) => setForm({ ...form, subject: e.target.value })}
                            required
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Category</label>
                        <select
                            className={styles.select}
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                            <option value="reservation">Reservation Issue</option>
                            <option value="payment">Payment / Wallet</option>
                            <option value="listing_report">Report a Listing</option>
                            <option value="user_report">Report a User</option>
                            <option value="account">Account</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                {(form.category === 'listing_report' || form.category === 'user_report') && (
                    <div className={styles.filterBar}>
                        <div className={styles.filterGroup}>
                            <label className={styles.label}>Reported Target ID (Optional)</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="Listing or User ID"
                                value={form.relatedTargetId}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        relatedTargetType: form.category === 'listing_report' ? 'item' : 'user',
                                        relatedTargetId: e.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '0.75rem' }}>
                    <label className={styles.label}>Description</label>
                    <textarea
                        className={styles.textarea}
                        placeholder="Describe what happened in detail..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        required
                    />
                </div>

                <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
            </form>

            {/* Req 111: View Own Ticket Statuses */}
            <div className={styles.card}>
                <div className={styles.headerRow}>
                    <h3 style={{ margin: 0 }}>My Support Tickets</h3>
                    <select
                        className={styles.select}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>

                {loading ? (
                    <p>Loading your tickets...</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                <th>Ticket #</th>
                                <th>Subject</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Last Updated</th>
                                <th>Details</th>
                            </tr>
                            </thead>
                            <tbody>
                            {tickets.length === 0 ? (
                                <tr>
                                    <td colSpan="6">You have not submitted any support tickets yet.</td>
                                </tr>
                            ) : (
                                tickets.map((t) => (
                                    <tr key={t._id}>
                                        <td>
                                            <strong>{t.ticketNumber}</strong>
                                        </td>
                                        <td>{t.subject}</td>
                                        <td>{t.category}</td>
                                        <td>
                                            <span className={`${styles.badge} ${styles.badgeOpen}`}>{t.status}</span>
                                        </td>
                                        <td>{new Date(t.updatedAt).toLocaleDateString()}</td>
                                        <td>
                                            <Link to={`/support/${t._id}`} className={styles.btnPrimary}>
                                                View Thread
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}