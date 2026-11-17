import React, { useEffect, useState } from 'react';
import { getDamageReport, downloadDamageReportExport } from '../../api/analytics.api';
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

export default function AdminDamageReportPage() {
    const [filters, setFilters] = useState({
        status: '',
        resolution: '',
        startDate: '',
        endDate: '',
    });
    const [report, setReport] = useState({
        summary: { totalCases: 0, disputedCases: 0, resolvedCases: 0, totalForfeited: 0 },
        items: [],
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
            const res = await getDamageReport(cleanedParams());
            setReport({ summary: res.summary || {}, items: res.items || [] });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load damage & dispute report.');
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
            const blob = await downloadDamageReportExport({ ...cleanedParams(), format });
            triggerDownload(blob, `damage-dispute-report.${format}`);
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
                    <h2 className={styles.title}>Damage & Dispute Resolution Report</h2>
                    <p className={styles.subtitle}>
                        Cross-platform overview of damage claims, disputes, and financial outcomes.
                    </p>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <ReportFilters
                mode="damage"
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters({ status: '', resolution: '', startDate: '', endDate: '' })}
                onExportCsv={() => handleExport('csv')}
                onExportPdf={() => handleExport('pdf')}
                exporting={exporting}
            />

            <div className={styles.summaryGrid}>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Total Damage Cases</div>
                    <div className={styles.statValue}>{report.summary.totalCases || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Disputed Cases</div>
                    <div className={styles.statValue}>{report.summary.disputedCases || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Resolved Cases</div>
                    <div className={styles.statValue}>{report.summary.resolvedCases || 0}</div>
                </div>
                <div className={styles.statBox}>
                    <div className={styles.statLabel}>Total Forfeited (EGP)</div>
                    <div className={styles.statValue}>{report.summary.totalForfeited || 0}</div>
                </div>
            </div>

            <div className={styles.card}>
                {loading ? (
                    <p>Loading damage report...</p>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                            <tr>
                                <th>Date</th>
                                <th>Item</th>
                                <th>Borrower</th>
                                <th>Lender</th>
                                <th>Status</th>
                                <th>Disputed</th>
                                <th>Resolution Outcome</th>
                                <th>Held (EGP)</th>
                                <th>Forfeited (EGP)</th>
                            </tr>
                            </thead>
                            <tbody>
                            {report.items.length === 0 ? (
                                <tr>
                                    <td colSpan="9">No damage or dispute records found.</td>
                                </tr>
                            ) : (
                                report.items.map((row) => (
                                    <tr key={row.caseId}>
                                        <td>{row.createdAt}</td>
                                        <td>{row.itemTitle}</td>
                                        <td>{row.borrowerName}</td>
                                        <td>{row.lenderName}</td>
                                        <td>{row.status}</td>
                                        <td>{row.isDisputed ? 'Yes' : 'No'}</td>
                                        <td>{row.resolution}</td>
                                        <td>{row.heldDeposit}</td>
                                        <td>{row.forfeitedAmount}</td>
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