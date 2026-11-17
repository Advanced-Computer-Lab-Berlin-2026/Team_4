// SupportThread component - Owner: Member 4 (Req 110, 111)
import React, { useState } from 'react';
import styles from '../../../styles/sprint2/member4.module.css';

export default function SupportThread({ ticket, onSendReply, sending = false }) {
    const [replyBody, setReplyBody] = useState('');

    if (!ticket) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!replyBody.trim()) return;
        await onSendReply(replyBody.trim());
        setReplyBody('');
    };

    const messages = ticket.messages || [];

    return (
        <div className={styles.card}>
            <h3>Conversation Thread</h3>
            <div className={styles.threadList}>
                {messages.length === 0 ? (
                    <p className={styles.subtitle}>No messages yet.</p>
                ) : (
                    messages.map((msg, idx) => {
                        const isAdmin = msg.senderRole === 'admin';
                        const senderName =
                            msg.sender?.name || msg.sender?.username || (isAdmin ? 'Admin' : 'Member');
                        return (
                            <div
                                key={msg._id || idx}
                                className={`${styles.messageBubble} ${isAdmin ? styles.messageAdmin : ''}`}
                            >
                                <div className={styles.messageMeta}>
                                    <strong>
                                        {senderName} ({msg.senderRole})
                                    </strong>
                                    <span>{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}</span>
                                </div>
                                <div>{msg.body}</div>
                            </div>
                        );
                    })
                )}
            </div>

            {ticket.status !== 'closed' && (
                <form onSubmit={handleSubmit}>
                    <label className={styles.label} htmlFor="thread-reply">
                        Add Reply
                    </label>
                    <textarea
                        id="thread-reply"
                        className={styles.textarea}
                        placeholder="Write a message..."
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        required
                    />
                    <div style={{ marginTop: '0.75rem' }}>
                        <button type="submit" className={styles.btnPrimary} disabled={sending}>
                            {sending ? 'Sending...' : 'Send Reply'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}