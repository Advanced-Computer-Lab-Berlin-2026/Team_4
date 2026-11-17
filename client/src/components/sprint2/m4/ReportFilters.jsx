// ReportFilters component - Owner: Member 4 (Req 94, 95, 96, 105)
import React from 'react';
import styles from '../../../styles/sprint2/member4.module.css';

export default function ReportFilters({
                                          mode = 'usage', // 'usage' | 'damage'
                                          filters,
                                          onChange,
                                          onReset,
                                          onExportCsv,
                                          onExportPdf,
                                          exporting = false,
                                      }) {
    const update = (key, val) => onChange({ ...filters, [key]: val });

    return (
        <div className={styles.card}>
            <div className={styles.filterBar}>
                {mode === 'usage' ? (
                    <>
                        <div className={styles.filterGroup}>
                            <label className={styles.label} htmlFor="filter-month">Month</label>
                            <input
                                id="filter-month"
                                type="month"
                                className={styles.input}
                                value={filters.month || ''}
                                onChange={(e) => update('month', e.target.value)}
                            />
                        </div>

                        <div className={styles.filterGroup}>
                            <label className={styles.label} htmlFor="filter-category">Category</label>
                            <input
                                id="filter-category"
                                type="text"
                                placeholder="Category name or ID"
                                className={styles.input}
                                value={filters.category || ''}
                                onChange={(e) => update('category', e.target.value)}
                            />
                        </div>

                        <div className={styles.filterGroup}>
                            <label className={styles.label} htmlFor="filter-item">Item</label>
                            <input
                                id="filter-item"
                                type="text"
                                placeholder="Item name or ID"
                                className={styles.input}
                                value={filters.item || ''}
                                onChange={(e) => update('item', e.target.value)}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className={styles.filterGroup}>
                            <label className={styles.label} htmlFor="filter-status">Case Status</label>
                            <select
                                id="filter-status"
                                className={styles.select}
                                value={filters.status || ''}
                                onChange={(e) => update('status', e.target.value)}
                            >
                                <option value="">All Statuses</option>
                                <option value="open">Open</option>
                                <option value="disputed">Disputed</option>
                                <option value="resolved">Resolved</option>
                                <option value="decided">Decided</option>
                            </select>
                        </div>

                        <div className={styles.filterGroup}>
                            <label className={styles.label} htmlFor="filter-resolution">Resolution</label>
                            <select
                                id="filter-resolution"
                                className={styles.select}
                                value={filters.resolution || ''}
                                onChange={(e) => update('resolution', e.target.value)}
                            >
                                <option value="">All Outcomes</option>
                                <option value="pending">Pending decision</option>
                                <option value="full_refund">Full refund</option>
                                <option value="partial_forfeit">Partial forfeiture</option>
                                <option value="full_forfeit">Full forfeiture</option>
                                <option value="no_deposit">No deposit</option>
                            </select>
                        </div>
                    </>
                )}

                <div className={styles.filterGroup}>
                    <label className={styles.label} htmlFor="filter-start">From Date</label>
                    <input
                        id="filter-start"
                        type="date"
                        className={styles.input}
                        value={filters.startDate || ''}
                        onChange={(e) => update('startDate', e.target.value)}
                    />
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.label} htmlFor="filter-end">To Date</label>
                    <input
                        id="filter-end"
                        type="date"
                        className={styles.input}
                        value={filters.endDate || ''}
                        onChange={(e) => update('endDate', e.target.value)}
                    />
                </div>

                <div className={styles.buttonGroup}>
                    <button type="button" className={styles.btnSecondary} onClick={onReset}>
                        Reset
                    </button>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={exporting}
                        onClick={onExportCsv}
                    >
                        {exporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    <button
                        type="button"
                        className={styles.btnSuccess}
                        disabled={exporting}
                        onClick={onExportPdf}
                    >
                        {exporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
}