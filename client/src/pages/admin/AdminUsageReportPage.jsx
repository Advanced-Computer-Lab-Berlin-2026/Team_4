import React, { useEffect, useState } from 'react';
import { getUsageReport, downloadUsageReportExport } from '../../api/analytics.api';
import ReportFilters from '../../components/sprint2/m4/ReportFilters';
import styles from '../../styles/sprint2/member4.module.css';

function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

export default function AdminUsageReportPage() {
    const [filters, setFilters] = useState({
        month: '',
        category: '',
        item: '',
        startDate: '',
        endDate: '',
    });
    const [report, setReport] = useState({
        summary: {
            totalReservations: 0,
            completedCount: 0,
            cancelledOrRejectedCount: 0,
            totalDepositVolume: 0,
        },
        items: [], categories: [],
    });
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');

    const cleanedParams = () =>
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== null));

    const fetchReport = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getUsageReport(cleanedParams());
            setReport({ summary: res.summary || {}, items: res.items || [], categories: res.categories || [] });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load usage report.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, [filters]);

    const handleExport = async (format) => {
        setExporting(true);
        setError('');
        try {
            const blob = await downloadUsageReportExport({ ...cleanedParams(), format });
            triggerDownload(blob, `usage-report.${format}`);
        } catch (err) {
            setError(`Failed to export ${format.toUpperCase()} file.`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <div>
                    <h2 className={styles.title}>Monthly Platform Usage Report</h2>
                    <p className={styles.subtitle}>
                        Reservations counted by their UTC start date.
                    </p>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <ReportFilters
                mode="usage"
                filters={filters}
                onChange={setFilters}
                onReset={() =>
                    setFilters({ month: '', category: '', item: '', startDate: '', endDate: '' })
                }
                onExportCsv={() => handleExport('csv')}
                onExportPdf={() => handleExport('pdf')}
                exporting={exporting || loading}
            />

            <div className={styles.summaryGrid}>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Total Reservations</div>
                    <div className={styles.statValue}>{report.summary.totalReservations || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Completed</div>
                    <div className={styles.statValue}>{report.summary.completedCount || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Cancelled / Rejected</div>
                    <div className={styles.statValue}>{report.summary.cancelledOrRejectedCount || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Deposit Volume (EGP)</div>
                    <div className={styles.statValue}>{report.summary.totalDepositVolume || 0}</div>
                </div>
            </div>

            {!loading && report.categories.length > 0 && (
                <section className={styles.card} aria-label="Reservations by category">
                    <h3>Reservations by category</h3>
                    <ul>{report.categories.map((group) => (
                        <li key={group.month + ':' + group.category}>
                            {group.month} · {group.category} · {group.totalReservations}
                        </li>
                    ))}</ul>
                </section>
            )}

            <div className={styles.card}>
                {loading ? (
                    <p>Loading usage analytics...</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                <th>Month</th>
                                <th>Item</th>
                                <th>Category</th>
                                <th>Total Reservations</th>
                                <th>Completed</th>
                                <th>Active / Confirmed</th>
                                <th>Cancelled / Rejected</th>
                                <th>Deposit Volume (EGP)</th>
                            </tr>
                            </thead>
                            <tbody>
                            {report.items.length === 0 ? (
                                <tr>
                                    <td colSpan="8">No reservation records match the selected filters.</td>
                                </tr>
                            ) : (
                                report.items.map((row, idx) => (
                                    <tr key={`${row.month}-${row.itemId}-${idx}`}>
                                        <td>{row.month}</td>
                                        <td>{row.itemTitle}</td>
                                        <td>{row.category}</td>
                                        <td>{row.totalReservations}</td>
                                        <td>{row.completedCount}</td>
                                        <td>{row.activeOrConfirmedCount}</td>
                                        <td>{row.cancelledOrRejectedCount}</td>
                                        <td>{row.totalDepositVolume}</td>
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