const DataRetentionService = require('../services/DataRetentionService');
const moment = require('moment-timezone');
const path = require('path');
const fs = require('fs').promises;

class DataRetentionController {
    constructor() {
        this.retentionService = new DataRetentionService();
    }

    async getRetentionPolicy(req, res) {
        try {
            const stats = await this.retentionService.getRetentionStats();
            
            res.json({
                success: true,
                policy: {
                    retentionDays: this.retentionService.retentionDays,
                    autoCleanupEnabled: process.env.AUTO_CLEANUP_ENABLED !== 'false',
                    exportBeforeDelete: process.env.EXPORT_BEFORE_DELETE !== 'false',
                    timezone: this.retentionService.timezone
                },
                statistics: stats
            });
        } catch (error) {
            console.error('Error getting retention policy:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get retention policy'
            });
        }
    }

    async triggerCleanup(req, res) {
        try {
            const { exportBeforeDelete = true } = req.body;
            
            const result = await this.retentionService.performCleanup(exportBeforeDelete);
            
            if (result.success) {
                res.json({
                    success: true,
                    message: result.message,
                    results: result.results,
                    exportPath: result.exportPath
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Error triggering cleanup:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to trigger cleanup'
            });
        }
    }

    async exportData(req, res) {
        try {
            const { startDate, endDate, format = 'json' } = req.body;

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    error: 'Start date and end date are required'
                });
            }

            const start = moment(startDate).startOf('day').toDate();
            const end = moment(endDate).endOf('day').toDate();

            if (start > end) {
                return res.status(400).json({
                    success: false,
                    error: 'Start date must be before end date'
                });
            }

            const result = await this.retentionService.exportDateRange(start, end, format);
            
            if (result.success) {
                res.json({
                    success: true,
                    message: result.message,
                    exportPath: result.archivePath,
                    recordCount: result.recordCount,
                    exportedFiles: result.exportedFiles
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: result.message
                });
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export data'
            });
        }
    }

    async downloadExport(req, res) {
        try {
            const { filename } = req.params;
            
            if (!filename || !filename.endsWith('.zip')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid filename'
                });
            }

            const filePath = path.join(this.retentionService.exportPath, filename);
            
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'Export file not found'
                });
            }

            // Set headers for download
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            // Stream the file
            const fileStream = require('fs').createReadStream(filePath);
            fileStream.pipe(res);
        } catch (error) {
            console.error('Error downloading export:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to download export'
            });
        }
    }

    async listExports(req, res) {
        try {
            const exportPath = this.retentionService.exportPath;
            const files = await fs.readdir(exportPath);
            
            const exports = [];
            for (const file of files) {
                if (file.endsWith('.zip')) {
                    const stats = await fs.stat(path.join(exportPath, file));
                    exports.push({
                        filename: file,
                        size: stats.size,
                        created: stats.birthtime,
                        downloadUrl: `/api/retention/download/${file}`
                    });
                }
            }

            // Sort by creation date (newest first)
            exports.sort((a, b) => new Date(b.created) - new Date(a.created));

            res.json({
                success: true,
                exports,
                totalExports: exports.length
            });
        } catch (error) {
            console.error('Error listing exports:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list exports'
            });
        }
    }

    async updatePolicy(req, res) {
        try {
            const { retentionDays, autoCleanupEnabled, exportBeforeDelete } = req.body;

            // Validate retention days
            if (retentionDays !== undefined) {
                const days = parseInt(retentionDays);
                if (isNaN(days) || days < 1 || days > 365) {
                    return res.status(400).json({
                        success: false,
                        error: 'Retention days must be between 1 and 365'
                    });
                }
                process.env.DATA_RETENTION_DAYS = days;
                this.retentionService.retentionDays = days;
            }

            if (autoCleanupEnabled !== undefined) {
                process.env.AUTO_CLEANUP_ENABLED = autoCleanupEnabled ? 'true' : 'false';
            }

            if (exportBeforeDelete !== undefined) {
                process.env.EXPORT_BEFORE_DELETE = exportBeforeDelete ? 'true' : 'false';
            }

            res.json({
                success: true,
                message: 'Retention policy updated',
                policy: {
                    retentionDays: this.retentionService.retentionDays,
                    autoCleanupEnabled: process.env.AUTO_CLEANUP_ENABLED !== 'false',
                    exportBeforeDelete: process.env.EXPORT_BEFORE_DELETE !== 'false'
                }
            });
        } catch (error) {
            console.error('Error updating policy:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update retention policy'
            });
        }
    }
}

module.exports = DataRetentionController;