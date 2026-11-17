// Member 4 Sprint 2 Backend Tests - Owner: Member 4
const assert = require('assert');
const { exportUsageReport, exportDamageReport } = require('../../src/services/analytics/reportExport');

describe('Member 4 — Sprint 2 Analytics Export & Service Unit Checks', () => {
    it('exports usage report rows consistently to CSV and valid PDF', () => {
        const sample = {
            summary: {
                totalReservations: 4,
                completedCount: 3,
                cancelledOrRejectedCount: 1,
                totalDepositVolume: 1200,
            },
            items: [
                {
                    month: '2026-11',
                    itemId: '673000000000000000000001',
                    itemTitle: 'Cordless Drill',
                    category: 'Power Tools',
                    totalReservations: 4,
                    completedCount: 3,
                    activeOrConfirmedCount: 0,
                    cancelledOrRejectedCount: 1,
                    totalDepositVolume: 1200,
                },
            ],
        };

        const csv = exportUsageReport({ format: 'csv', reportData: sample, filters: { month: '2026-11' } });
        assert.strictEqual(csv.mimeType, 'text/csv; charset=utf-8');
        assert(csv.buffer.toString('utf8').includes('Cordless Drill'));

        const pdf = exportUsageReport({ format: 'pdf', reportData: sample, filters: { month: '2026-11' } });
        assert.strictEqual(pdf.mimeType, 'application/pdf');
        assert(pdf.buffer.toString('utf8').startsWith('%PDF-1.4'));
    });

    it('exports damage report rows consistently to CSV and valid PDF', () => {
        const sample = {
            summary: { totalCases: 1, disputedCases: 1, resolvedCases: 1, totalForfeited: 250 },
            items: [
                {
                    createdAt: '2026-11-12',
                    itemTitle: 'DSLR Camera',
                    borrowerName: 'Ali',
                    status: 'resolved',
                    resolution: 'partial_forfeit',
                    heldDeposit: 500,
                    forfeitedAmount: 250,
                },
            ],
        };

        const csv = exportDamageReport({ format: 'csv', reportData: sample });
        assert(csv.buffer.toString('utf8').includes('DSLR Camera'));

        const pdf = exportDamageReport({ format: 'pdf', reportData: sample });
        assert(pdf.buffer.toString('utf8').startsWith('%PDF-1.4'));
    });
});