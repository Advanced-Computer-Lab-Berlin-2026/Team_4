import React, { useEffect, useState } from 'react';
import useFeedback from '../../components/feedback/useFeedback';
import {
    listModerationReports,
    reviewModerationReport,
    createModerationReport,
} from '../../api/moderation.api';
import styles from '../../styles/sprint2/member4.module.css';

export default function AdminModerationPage() {
    const { prompt, toast } = useFeedback();
    const [filters, setFilters] = useState({ status: '', targetType: '' });
    const [reports, setReports] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState('');

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
            const res = await listModerationReports({ ...cleaned, page });
            setReports(res.items || []);
            setTotalPages(res.totalPages || 1);
            if (page > res.totalPages) setPage(res.totalPages);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load moderation reports.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReports();
    }, [filters, page]);

    const handleAction = async ({ _id: reportId, targetType }, action) => {
        const target = targetType === 'item' ? 'listing' : 'account';
        const actions = { flag: `Flag this ${target}?`, remove: `Remove this ${target}?`, dismiss: 'Dismiss this report?' };
        const adminNotes = await prompt({
            title: actions[action],
            description: action === 'remove' ? 'The reported target will no longer be available. Existing reservations are preserved.' : undefined,
            inputLabel: 'Admin note (optional)', maxLength: 1000, confirmLabel: 'Apply decision', danger: action === 'remove',
        });
        if (adminNotes === null) return;
        setApplying(true);
        setError('');
        try {
            await reviewModerationReport(reportId, { action, adminNotes });
            toast(`Report updated (${action}). Historical reservation records preserved.`);
            await loadReports();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to apply moderation action.');
        } finally {
            setApplying(false);
        }
    };

    const handleCreateReport = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await createModerationReport(newReport);
            setNewReport({ targetType: 'item', targetId: '', reason: '', details: '' });
            toast('Moderation report logged.');
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
                            onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}
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
                            onChange={(e) => { setPage(1); setFilters({ ...filters, targetType: e.target.value }); }}
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
                                                <span className={badgeClass(r.status)}>{r.status === 'actioned' ? r.action : r.status}</span>
                                                {r.adminNotes && <div className={styles.subtitle}>{r.adminNotes}</div>}
                                            </td>
                                            <td>
                                                <div className={styles.buttonGroup}>
                                                    <button
                                                        type="button"
                                                        className={styles.btnWarning}
                                                        disabled={applying || r.status !== 'open' || r.targetUser?.role === 'admin'}
                                                        onClick={() => handleAction(r, 'flag')}
                                                    >
                                                        Flag
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnDanger}
                                                        disabled={applying || (r.status !== 'open' && r.action !== 'flagged') || r.targetUser?.role === 'admin'}
                                                        onClick={() => handleAction(r, 'remove')}
                                                    >
                                                        Remove
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnSecondary}
                                                        disabled={applying || r.status !== 'open'}
                                                        onClick={() => handleAction(r, 'dismiss')}
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
            {totalPages > 1 && (
                <nav aria-label="Moderation report pages" className={styles.buttonGroup}>
                    <button type="button" className={styles.btnSecondary} disabled={page === 1 || loading}
                        onClick={() => setPage(page - 1)}>Previous</button>
                    <span>Page {page} of {totalPages}</span>
                    <button type="button" className={styles.btnSecondary} disabled={page === totalPages || loading}
                        onClick={() => setPage(page + 1)}>Next</button>
                </nav>
            )}
        </div>
    );
}