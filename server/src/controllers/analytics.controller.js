const asyncHandler = require('../utils/asyncHandler');
const { queryUsageReport, queryDamageReport } = require('../services/analytics/reportQueries');
const { exportUsageReport, exportDamageReport } = require('../services/analytics/reportExport');

exports.getUsageReport = asyncHandler(async (req, res) => {
    const data = await queryUsageReport(req.query);
    res.status(200).json({ success: true, ...data });
});

exports.getDamageReport = asyncHandler(async (req, res) => {
    const data = await queryDamageReport(req.query);
    res.status(200).json({ success: true, ...data });
});

exports.exportUsage = asyncHandler(async (req, res) => {
    const reportData = await queryUsageReport(req.query);
    const { buffer, mimeType, filename } = await exportUsageReport({
        format: req.query.format || 'csv',
        reportData,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
});

exports.exportDamage = asyncHandler(async (req, res) => {
    const reportData = await queryDamageReport(req.query);
    const { buffer, mimeType, filename } = await exportDamageReport({
        format: req.query.format || 'csv',
        reportData,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
});