import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSupportTicketById, replyToSupportTicket } from '../../api/supportTickets.api';
import SupportThread from '../../components/sprint2/m4/SupportThread';
import styles from '../../styles/sprint2/member4.module.css';

export default function SupportTicketPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const loadTicket = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getSupportTicketById(id);
            setTicket(res.entity);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load support ticket.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTicket();
    }, [id]);

    const handleReply = async (body) => {
        setSending(true);
        setError('');
        try {
            const res = await replyToSupportTicket(id, { body });
            setTicket(res.entity);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send reply.');
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className={styles.container}>Loading ticket...</div>;

    return (
        <div className={styles.container}>
            <button
                type="button"
                className={styles.btnSecondary}
                style={{ marginBottom: '1rem' }}
                onClick={() => navigate(-1)}
            >
                &larr; Back
            </button>

            {error && <div className={styles.error}>{error}</div>}

            {ticket && (
                <>
                    <div className={styles.card}>
                        <div className={styles.headerRow}>
                            <div>
                                <h2 className={styles.title}>
                                    [{ticket.ticketNumber}] {ticket.subject}
                                </h2>
                                <p className={styles.subtitle}>
                                    Category: {ticket.category} | Submitted:{' '}
                                    {new Date(ticket.createdAt).toLocaleString()}
                                </p>
                            </div>
                            <span className={`${styles.badge} ${styles.badgeResolved}`}>{ticket.status}</span>
                        </div>
                        {ticket.resolutionNote && (
                            <div className={styles.success}>
                                <strong>Admin Resolution:</strong> {ticket.resolutionNote}
                            </div>
                        )}
                    </div>

                    <SupportThread ticket={ticket} onSendReply={handleReply} sending={sending} />
                </>
            )}
        </div>
    );
}