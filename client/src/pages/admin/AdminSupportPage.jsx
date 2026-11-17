import React, { useEffect, useState } from 'react';
import {
    getAllSupportTickets,
    getSupportTicketById,
    replyToSupportTicket,
    resolveSupportTicket,
} from '../../api/supportTickets.api';
import SupportThread from '../../components/sprint2/m4/SupportThread';
import styles from '../../styles/sprint2/member4.module.css';

export default function AdminSupportPage() {
    const [filters, setFilters] = useState({ status: '', category: '', q: '' });
    const [tickets, setTickets] = useState([]);
    const [activeTicket, setActiveTicket] = useState(null);
    const [resolutionStatus, setResolutionStatus] = useState('resolved');
    const [resolutionNote, setResolutionNote] = useState('');
    const [escalateToModeration, setEscalateToModeration] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');

    const loadTickets = async () => {
        setLoading(true);
        setError('');
        try {
            const cleaned = Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v !== '')
            );
            const res = await getAllSupportTickets(cleaned);
            setTickets(res.items || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load support tickets.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTickets();
    }, [filters]);

    const selectTicket = async (ticketId) => {
        setError('');
        setFeedback('');
        try {
            const res = await getSupportTicketById(ticketId);
            setActiveTicket(res.entity);
            setResolutionStatus(
                res.entity.status === 'open' ? 'resolved' : res.entity.status
            );
            setResolutionNote(res.entity.resolutionNote || '');
            setEscalateToModeration(false);
        } catch (err) {
            setError('Failed to load ticket details.');
        }
    };

    const handleReply = async (body) => {
        if (!activeTicket) return;
        setSending(true);
        try {
            const res = await replyToSupportTicket(activeTicket._id, { body });
            setActiveTicket(res.entity);
            loadTickets();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send reply.');
        } finally {
            setSending(false);
        }
    };

    const handleResolve = async (e) => {
        e.preventDefault();
        if (!activeTicket) return;
        setSending(true);
        setError('');
        setFeedback('');
        try {
            const payload = {
                status: resolutionStatus,
                resolutionNote,
            };
            if (
                escalateToModeration &&
                activeTicket.relatedTargetType !== 'none' &&
                activeTicket.relatedTargetId
            ) {
                payload.linkReport = {
                    targetType: activeTicket.relatedTargetType,
                    targetId: activeTicket.relatedTargetId,
                    reason: activeTicket.subject,
                    details: activeTicket.description,
                };
            }
            const res = await resolveSupportTicket(activeTicket._id, payload);
            setActiveTicket(res.entity);
            setFeedback(
                res.report
                    ? 'Ticket updated and linked to a new Moderation Report.'
                    : 'Support ticket updated successfully.'
            );
            loadTickets();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to resolve ticket.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h2 className={styles.title}>Admin Support Desk</h2>
                    <p className={styles.subtitle}>
                        Respond to member support tickets, resolve issues, and escalate abuse reports.
                    </p>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {feedback && <div className={styles.success}>{feedback}</div>}

            <div className={styles.card}>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Search</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="Ticket # or subject"
                            value={filters.q}
                            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Status</label>
                        <select
                            className={styles.select}
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Category</label>
                        <select
                            className={styles.select}
                            value={filters.category}
                            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                        >
                            <option value="">All</option>
                            <option value="reservation">Reservation</option>
                            <option value="payment">Payment</option>
                            <option value="listing_report">Listing Report</option>
                            <option value="user_report">User Report</option>
                            <option value="account">Account</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <p>Loading support queue...</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                <th>Ticket #</th>
                                <th>Member</th>
                                <th>Subject</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                            </thead>
                            <tbody>
                            {tickets.length === 0 ? (
                                <tr>
                                    <td colSpan="6">No support tickets match the current filters.</td>
                                </tr>
                            ) : (
                                tickets.map((t) => (
                                    <tr key={t._id}>
                                        <td>
                                            <strong>{t.ticketNumber}</strong>
                                        </td>
                                        <td>{t.creator?.name || t.creator?.username || 'Member'}</td>
                                        <td>{t.subject}</td>
                                        <td>{t.category}</td>
                                        <td>
                                            <span className={`${styles.badge} ${styles.badgeOpen}`}>{t.status}</span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className={styles.btnPrimary}
                                                onClick={() => selectTicket(t._id)}
                                            >
                                                Manage
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {activeTicket && (
                <>
                    <div className={styles.card}>
                        <div className={styles.headerRow}>
                            <h3 style={{ margin: 0 }}>
                                Resolve Ticket: {activeTicket.ticketNumber} — {activeTicket.subject}
                            </h3>
                            <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => setActiveTicket(null)}
                            >
                                Close Panel
                            </button>
                        </div>

                        <form onSubmit={handleResolve}>
                            <div className={styles.filterBar}>
                                <div className={styles.filterGroup}>
                                    <label className={styles.label}>Set Status</label>
                                    <select
                                        className={styles.select}
                                        value={resolutionStatus}
                                        onChange={(e) => setResolutionStatus(e.target.value)}
                                    >
                                        <option value="in_progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label className={styles.label}>Resolution Summary</label>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="Explain the final resolution for the member..."
                                    value={resolutionNote}
                                    onChange={(e) => setResolutionNote(e.target.value)}
                                />
                            </div>

                            {activeTicket.relatedTargetType !== 'none' &&
                                activeTicket.relatedTargetId &&
                                !activeTicket.linkedReport && (
                                    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={escalateToModeration}
                                            onChange={(e) => setEscalateToModeration(e.target.checked)}
                                        />{' '}
                                        Create linked Moderation Report for this {activeTicket.relatedTargetType}
                                    </label>
                                )}

                            <button type="submit" className={styles.btnSuccess} disabled={sending}>
                                {sending ? 'Saving...' : 'Update & Resolve Ticket'}
                            </button>
                        </form>
                    </div>

                    <SupportThread ticket={activeTicket} onSendReply={handleReply} sending={sending} />
                </>
            )}
        </div>
    );
}