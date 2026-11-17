// Both screen views and CSV/PDF exports call these functions so output matches 1:1.
const mongoose = require('mongoose');
const Reservation = require('../../models/Reservation');
const DamageReport = require('../../models/DamageReport');

/**
 * Parse month (YYYY-MM) or explicit startDate/endDate into a UTC date window
 */
function buildDateWindow({ month, startDate, endDate }) {
    if (startDate || endDate) {
        const window = {};
        if (startDate) {
            const s = new Date(startDate);
            if (!Number.isNaN(s.getTime())) window.$gte = s;
        }
        if (endDate) {
            const e = new Date(endDate);
            if (!Number.isNaN(e.getTime())) {
                e.setUTCHours(23, 59, 59, 999);
                window.$lte = e;
            }
        }
        return Object.keys(window).length ? window : null;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10) - 1;
        const start = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999));
        return { $gte: start, $lte: end };
    }

    return null;
}

/**
 * Req 94 & 95: Monthly usage report by item/category with optional filters
 * Read-only query across reservations (includes archived items/suspended users).
 */
async function queryUsageReport({ month, itemId, category, startDate, endDate } = {}) {
    const matchStage = {};

    const dateWindow = buildDateWindow({ month, startDate, endDate });
    if (dateWindow) {
        matchStage.createdAt = dateWindow;
    }

    if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
        matchStage.item = new mongoose.Types.ObjectId(itemId);
    }

    const pipeline = [
        { $match: matchStage },
        {
            $lookup: {
                from: 'items',
                localField: 'item',
                foreignField: '_id',
                as: 'itemDoc',
            },
        },
        { $unwind: { path: '$itemDoc', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'categories',
                localField: 'itemDoc.category',
                foreignField: '_id',
                as: 'catDoc',
            },
        },
        { $unwind: { path: '$catDoc', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                resolvedItemTitle: { $ifNull: ['$itemDoc.title', 'Archived / Unknown Item'] },
                resolvedCategoryName: {
                    $ifNull: [
                        '$catDoc.name',
                        {
                            $cond: [
                                { $eq: [{ $type: '$itemDoc.category' }, 'string'] },
                                '$itemDoc.category',
                                'Uncategorized',
                            ],
                        },
                    ],
                },
                resolvedCategoryId: { $toString: { $ifNull: ['$itemDoc.category', ''] } },
                periodMonth: {
                    $dateToString: { format: '%Y-%m', date: { $ifNull: ['$createdAt', new Date()] } },
                },
            },
        },
    ];

    if (category && category.trim()) {
        const catTrim = category.trim();
        pipeline.push({
            $match: {
                $or: [
                    { resolvedCategoryId: catTrim },
                    { resolvedCategoryName: { $regex: catTrim, $options: 'i' } },
                ],
            },
        });
    }

    pipeline.push(
        {
            $group: {
                _id: {
                    month: '$periodMonth',
                    itemId: '$item',
                    itemTitle: '$resolvedItemTitle',
                    category: '$resolvedCategoryName',
                },
                totalReservations: { $sum: 1 },
                completedCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                activeOrConfirmedCount: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['confirmed', 'active']] }, 1, 0],
                    },
                },
                cancelledOrRejectedCount: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['cancelled', 'rejected']] }, 1, 0],
                    },
                },
                totalDepositVolume: {
                    $sum: { $ifNull: ['$depositAmount', { $ifNull: ['$totalDeposit', 0] }] },
                },
            },
        },
        {
            $project: {
                _id: 0,
                month: '$_id.month',
                itemId: { $toString: { $ifNull: ['$_id.itemId', ''] } },
                itemTitle: '$_id.itemTitle',
                category: '$_id.category',
                totalReservations: 1,
                completedCount: 1,
                activeOrConfirmedCount: 1,
                cancelledOrRejectedCount: 1,
                totalDepositVolume: { $round: ['$totalDepositVolume', 2] },
            },
        },
        { $sort: { month: -1, totalReservations: -1, itemTitle: 1 } }
    );

    const rows = await Reservation.aggregate(pipeline);

    const summary = rows.reduce(
        (acc, r) => {
            acc.totalReservations += r.totalReservations;
            acc.completedCount += r.completedCount;
            acc.cancelledOrRejectedCount += r.cancelledOrRejectedCount;
            acc.totalDepositVolume = Number((acc.totalDepositVolume + r.totalDepositVolume).toFixed(2));
            return acc;
        },
        {
            totalReservations: 0,
            completedCount: 0,
            cancelledOrRejectedCount: 0,
            totalDepositVolume: 0,
        }
    );

    return {
        summary,
        items: rows,
        total: rows.length,
    };
}

/**
 * Req 96: Damage & dispute resolution report (read-only)
 */
async function queryDamageReport({ status, resolution, startDate, endDate } = {}) {
    const query = {};
    if (status && status.trim()) query.status = status.trim();
    if (resolution && resolution.trim()) {
        query.$or = [
            { resolution: resolution.trim() },
            { decision: resolution.trim() },
            { disputeStatus: resolution.trim() },
        ];
    }

    const dateWindow = buildDateWindow({ startDate, endDate });
    if (dateWindow) {
        query.createdAt = dateWindow;
    }

    const docs = await DamageReport.find(query)
        .populate({
            path: 'reservation',
            select: 'item borrower lender startDate endDate depositAmount status',
            populate: [
                { path: 'item', select: 'title' },
                { path: 'borrower', select: 'name username email' },
                { path: 'lender', select: 'name username email' },
            ],
        })
        .populate('reportedBy', 'name username')
        .sort({ createdAt: -1 })
        .lean();

    const items = docs.map((d) => {
        const res = d.reservation || {};
        const forfeited = Number(d.forfeitedAmount ?? d.forfeitAmount ?? 0);
        const heldDeposit = Number(res.depositAmount ?? d.depositAmount ?? 0);
        const resolvedOutcome =
            d.resolution || d.decision || (d.disputeResolved ? 'dispute_resolved' : d.status || 'pending');

        return {
            caseId: String(d._id),
            reservationId: res._id ? String(res._id) : String(d.reservation || 'N/A'),
            itemTitle: res.item?.title || 'Archived / Unknown Item',
            borrowerName: res.borrower?.name || res.borrower?.username || 'Unknown',
            lenderName: res.lender?.name || res.lender?.username || d.reportedBy?.name || 'Unknown',
            status: d.status || 'open',
            isDisputed: Boolean(d.isDisputed || d.status === 'disputed' || d.disputeReason),
            resolution: resolvedOutcome,
            heldDeposit,
            forfeitedAmount: forfeited,
            refundedAmount: Math.max(0, Number((heldDeposit - forfeited).toFixed(2))),
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : 'N/A',
        };
    });

    const summary = items.reduce(
        (acc, row) => {
            acc.totalCases += 1;
            if (row.isDisputed) acc.disputedCases += 1;
            if (['resolved', 'closed', 'forfeited', 'dismissed'].includes(row.status)) {
                acc.resolvedCases += 1;
            }
            acc.totalForfeited = Number((acc.totalForfeited + row.forfeitedAmount).toFixed(2));
            return acc;
        },
        { totalCases: 0, disputedCases: 0, resolvedCases: 0, totalForfeited: 0 }
    );

    return {
        summary,
        items,
        total: items.length,
    };
}

module.exports = {
    queryUsageReport,
    queryDamageReport,
};