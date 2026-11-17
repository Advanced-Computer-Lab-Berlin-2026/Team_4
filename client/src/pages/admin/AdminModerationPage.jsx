import React, { useEffect, useState } from 'react';
import {
    listModerationReports,
    reviewModerationReport,
    createModerationReport,
} from '../../api/moderation.api';
import styles from '../../styles/sprint2/member4.module.css';

export default function AdminModerationPage() {
    const [filters, setFilters] = useState({ status: '', targetType: '' });
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState('');

    // Quick intake form to flag/log a reported listing or user directly
    const [newReport, setNewReport] = useState({
        targetType: 'item',
        targetId: '',
        reason: '',
        details: '',
    });

    const loadReports = async () => {
        setLoading(true);
        setError('');
        try {
            const cleaned = Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v !== '')
            );
            const res = await listModerationReports(cleaned);
            setReports(res.items || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load moderation reports.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReports();
    }, [filters]);

    const handleAction = async (reportId, action) => {
        const adminNotes = window.prompt(`Optional admin note for "${action}" action:`) ?? '';
        setError('');
        setFeedback('');
        try {
            await reviewModerationReport(reportId, { action, adminNotes });
            setFeedback(`Report updated (${action}). Historical reservation records preserved.`);
            loadReports();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to apply moderation action.');
        }
    };

    const handleCreateReport = async (e) => {
        e.preventDefault();
        setError('');
        setFeedback('');
        try {
            await createModerationReport(newReport);
            setNewReport({ targetType: 'item', targetId: '', reason: '', details: '' });
            setFeedback('Moderation report logged.');
            loadReports();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create report.');
        }
    };

    const badgeClass = (status) => {
        if (status === 'flagged') return `${styles.badge} ${styles.badgeFlagged}`;
        if (status === 'removed') return `${styles.badge} ${styles.badgeRemoved}`;
        if (status === 'dismissed') return `${styles.badge} ${styles.badgeResolved}`;
        return `${styles.badge} ${styles.badgeOpen}`;
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h2 className={styles.title}>Content & User Moderation</h2>
                    <p className={styles.subtitle}>
                        Review reported listings or accounts and flag or remove them without deleting historical records.
                    </p>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {feedback && <div className={styles.success}>{feedback}</div>}

            {/* Manual / Support-Escalation Report Intake */}
            <form className={styles.card} onSubmit={handleCreateReport}>
                <h3 style={{ marginTop: 0 }}>Log Reported Listing or User</h3>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Target Type</label>
                        <select
                            className={styles.select}
                            value={newReport.targetType}
                            onChange={(e) => setNewReport({ ...newReport, targetType: e.target.value })}
                        >
                            <option value="item">Item Listing</option>
                            <option value="user">User Account</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Target ID</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="Item or User ObjectId"
                            value={newReport.targetId}
                            onChange={(e) => setNewReport({ ...newReport, targetId: e.target.value })}
                            required
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Reason</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="Policy violation reason"
                            value={newReport.reason}
                            onChange={(e) => setNewReport({ ...newReport, reason: e.target.value })}
                            required
                        />
                    </div>
                    <button type="submit" className={styles.btnPrimary}>
                        Create Report
                    </button>
                </div>
            </form>

            {/* Filters */}
            <div className={styles.card}>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Status</label>
                        <select
                            className={styles.select}
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All Statuses</option>
                            <option value="open">Open</option>
                            <option value="flagged">Flagged</option>
                            <option value="removed">Removed</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.label}>Target Type</label>
                        <select
                            className={styles.select}
                            value={filters.targetType}
                            onChange={(e) => setFilters({ ...filters, targetType: e.target.value })}
                        >
                            <option value="">All Types</option>
                            <option value="item">Listing</option>
                            <option value="user">User</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <p>Loading reports...</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                <th>Target</th>
                                <th>Reason & Details</th>
                                <th>Reporter</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {reports.length === 0 ? (
                                <tr>
                                    <td colSpan="5">No moderation reports found.</td>
                                </tr>
                            ) : (
                                reports.map((r) => {
                                    const targetLabel =
                                        r.targetType === 'item'
                                            ? `Listing: ${r.targetItem?.title || 'Deleted/Unknown'}`
                                            : `User: ${r.targetUser?.name || r.targetUser?.username || 'Unknown'}`;
                                    return (
                                        <tr key={r._id}>
                                            <td>
                                                <strong>{targetLabel}</strong>
                                                <div className={styles.subtitle}>{r.targetType}</div>
                                            </td>
                                            <td>
                                                <strong>{r.reason}</strong>
                                                {r.details && <div>{r.details}</div>}
                                                {r.adminNotes && (
                                                    <div className={styles.subtitle}>Admin note: {r.adminNotes}</div>
                                                )}
                                            </td>
                                            <td>{r.reporter?.name || r.reporter?.username || 'System'}</td>
                                            <td>
                                                <span className={badgeClass(r.status)}>{r.status}</span>
                                            </td>
                                            <td>
                                                <div className={styles.buttonGroup}>
                                                    <button
                                                        type="button"
                                                        className={styles.btnWarning}
                                                        onClick={() => handleAction(r._id, 'flag')}
                                                    >
                                                        Flag
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnDanger}
                                                        onClick={() => handleAction(r._id, 'remove')}
                                                    >
                                                        Remove
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnSecondary}
                                                        onClick={() => handleAction(r._id, 'dismiss')}
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}