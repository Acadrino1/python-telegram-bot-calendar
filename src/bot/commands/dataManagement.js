const DataRetentionService = require('../../services/DataRetentionService');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

class DataManagementCommands {
    constructor(bot) {
        this.bot = bot;
        this.retentionService = new DataRetentionService();
        this.setupCommands();
    }

    setupCommands() {
        // Admin command to check retention policy
        this.bot.command('retentionpolicy', this.handleRetentionPolicy.bind(this));
        
        // Admin command to export data
        this.bot.command('exportdata', this.handleExportData.bind(this));
        
        // Admin command to trigger cleanup
        this.bot.command('cleanupdata', this.handleCleanupData.bind(this));
        
        // Admin command to list exports
        this.bot.command('listexports', this.handleListExports.bind(this));
        
        // Setup callback handlers
        this.bot.action(/^export_confirm_(.+)$/, this.handleExportConfirm.bind(this));
        this.bot.action(/^cleanup_confirm_(.+)$/, this.handleCleanupConfirm.bind(this));
        this.bot.action(/^download_export_(.+)$/, this.handleDownloadExport.bind(this));
    }

    async isAdmin(ctx) {
        const adminIds = process.env.ADMIN_USER_IDS ? 
            process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : [];
        return adminIds.includes(String(ctx.from.id));
    }

    async handleRetentionPolicy(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ This command is only available to administrators.');
        }

        try {
            const stats = await this.retentionService.getRetentionStats();
            
            const message = `📊 **Data Retention Policy**\n\n` +
                `**Retention Period:** ${stats.retentionDays} days\n` +
                `**Auto-Cleanup:** ${process.env.AUTO_CLEANUP_ENABLED !== 'false' ? '✅ Enabled' : '❌ Disabled'}\n` +
                `**Export Before Delete:** ${process.env.EXPORT_BEFORE_DELETE !== 'false' ? '✅ Yes' : '❌ No'}\n\n` +
                `**Statistics:**\n` +
                `• Appointments to delete: ${stats.appointmentsToDelete}\n` +
                `• Total completed: ${stats.totalCompletedAppointments}\n` +
                `• Cutoff date: ${moment(stats.cutoffDate).format('YYYY-MM-DD')}\n` +
                (stats.lastCleanup ? 
                    `\n**Last Cleanup:**\n` +
                    `• Date: ${moment(stats.lastCleanup.timestamp).format('YYYY-MM-DD HH:mm')}\n` +
                    `• Deleted: ${stats.lastCleanup.results.deleted} records\n` +
                    `• Exported: ${stats.lastCleanup.results.exported} records` : 
                    '\n**Last Cleanup:** Never');

            await ctx.replyWithMarkdown(message);
        } catch (error) {
            console.error('Error getting retention policy:', error);
            await ctx.reply('❌ Failed to get retention policy information.');
        }
    }

    async handleExportData(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ This command is only available to administrators.');
        }

        const args = ctx.message.text.split(' ').slice(1);
        
        if (args.length === 0) {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📅 Last 7 days', callback_data: 'export_confirm_7days' },
                        { text: '📅 Last 30 days', callback_data: 'export_confirm_30days' }
                    ],
                    [
                        { text: '📅 Last 90 days', callback_data: 'export_confirm_90days' },
                        { text: '📅 All data', callback_data: 'export_confirm_all' }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: 'cancel' }
                    ]
                ]
            };

            return ctx.reply(
                '📤 **Export Data**\n\nSelect the time range for data export:',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                }
            );
        }

        // Custom date range: /exportdata 2024-01-01 2024-01-31
        if (args.length === 2) {
            const startDate = moment(args[0]);
            const endDate = moment(args[1]);

            if (!startDate.isValid() || !endDate.isValid()) {
                return ctx.reply('❌ Invalid date format. Use: /exportdata YYYY-MM-DD YYYY-MM-DD');
            }

            await this.performExport(ctx, startDate.toDate(), endDate.toDate());
        }
    }

    async handleExportConfirm(ctx) {
        await ctx.answerCbQuery();

        const range = ctx.match[1];
        let startDate, endDate = new Date();

        switch (range) {
            case '7days':
                startDate = moment().subtract(7, 'days').toDate();
                break;
            case '30days':
                startDate = moment().subtract(30, 'days').toDate();
                break;
            case '90days':
                startDate = moment().subtract(90, 'days').toDate();
                break;
            case 'all':
                startDate = moment().subtract(10, 'years').toDate();
                break;
            default:
                return ctx.editMessageText('❌ Invalid selection');
        }

        await ctx.editMessageText('⏳ Exporting data... Please wait.');
        await this.performExport(ctx, startDate, endDate);
    }

    async performExport(ctx, startDate, endDate) {
        try {
            const result = await this.retentionService.exportDateRange(startDate, endDate, 'json');
            
            if (result.success) {
                const filename = path.basename(result.archivePath);
                const stats = fs.statSync(result.archivePath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                const keyboard = {
                    inline_keyboard: [[
                        { text: '📥 Download Export', callback_data: `download_export_${filename}` }
                    ]]
                };

                await ctx.reply(
                    `✅ **Export Completed!**\n\n` +
                    `**Records exported:** ${result.recordCount}\n` +
                    `**File size:** ${fileSizeMB} MB\n` +
                    `**Filename:** \`${filename}\`\n\n` +
                    `The export includes appointments, users, history, and notifications.\n` +
                    `Export will be available for 24 hours.`,
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: keyboard 
                    }
                );

                // Schedule deletion after 24 hours
                setTimeout(() => {
                    fs.unlink(result.archivePath, (err) => {
                        if (err) console.error('Failed to delete export:', err);
                    });
                }, 24 * 60 * 60 * 1000);
            } else {
                await ctx.reply(`❌ Export failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            await ctx.reply('❌ Failed to export data. Please try again later.');
        }
    }

    async handleCleanupData(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ This command is only available to administrators.');
        }

        const stats = await this.retentionService.getRetentionStats();
        
        if (stats.appointmentsToDelete === 0) {
            return ctx.reply('✅ No old appointments to clean up.');
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Export & Delete', callback_data: 'cleanup_confirm_export' },
                    { text: '🗑 Delete Only', callback_data: 'cleanup_confirm_delete' }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'cancel' }
                ]
            ]
        };

        await ctx.reply(
            `⚠️ **Data Cleanup Confirmation**\n\n` +
            `This will delete **${stats.appointmentsToDelete} completed appointments** ` +
            `older than ${stats.retentionDays} days (before ${moment(stats.cutoffDate).format('YYYY-MM-DD')}).\n\n` +
            `Do you want to export the data before deletion?`,
            { 
                parse_mode: 'Markdown',
                reply_markup: keyboard 
            }
        );
    }

    async handleCleanupConfirm(ctx) {
        await ctx.answerCbQuery();

        const exportBeforeDelete = ctx.match[1] === 'export';
        
        await ctx.editMessageText('⏳ Processing cleanup... This may take a moment.');

        try {
            const result = await this.retentionService.performCleanup(exportBeforeDelete);
            
            if (result.success) {
                let message = `✅ **Cleanup Completed!**\n\n` +
                    `**Deleted:** ${result.results.deleted} appointments\n`;

                if (exportBeforeDelete && result.exportPath) {
                    const filename = path.basename(result.exportPath);
                    message += `**Exported:** ${result.results.exported} records\n` +
                        `**Export file:** \`${filename}\``;
                    
                    const keyboard = {
                        inline_keyboard: [[
                            { text: '📥 Download Backup', callback_data: `download_export_${filename}` }
                        ]]
                    };

                    await ctx.editMessageText(message, { 
                        parse_mode: 'Markdown',
                        reply_markup: keyboard 
                    });
                } else {
                    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
                }
            } else {
                await ctx.editMessageText(`❌ Cleanup failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            await ctx.editMessageText('❌ Failed to perform cleanup. Please try again later.');
        }
    }

    async handleListExports(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ This command is only available to administrators.');
        }

        try {
            const exportPath = this.retentionService.exportPath;
            const files = fs.readdirSync(exportPath)
                .filter(file => file.endsWith('.zip'))
                .map(file => {
                    const stats = fs.statSync(path.join(exportPath, file));
                    return {
                        name: file,
                        size: (stats.size / (1024 * 1024)).toFixed(2),
                        created: stats.birthtime
                    };
                })
                .sort((a, b) => b.created - a.created)
                .slice(0, 10); // Show last 10 exports

            if (files.length === 0) {
                return ctx.reply('📭 No exports available.');
            }

            let message = '📦 **Available Exports:**\n\n';
            const keyboard = { inline_keyboard: [] };

            files.forEach((file, index) => {
                message += `${index + 1}. \`${file.name}\`\n` +
                    `   Size: ${file.size} MB | Created: ${moment(file.created).format('YYYY-MM-DD HH:mm')}\n\n`;
                
                keyboard.inline_keyboard.push([{
                    text: `📥 Download ${index + 1}`,
                    callback_data: `download_export_${file.name}`
                }]);
            });

            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard 
            });
        } catch (error) {
            console.error('Error listing exports:', error);
            await ctx.reply('❌ Failed to list exports.');
        }
    }

    async handleDownloadExport(ctx) {
        await ctx.answerCbQuery();

        const filename = ctx.match[1];
        const filePath = path.join(this.retentionService.exportPath, filename);

        try {
            if (!fs.existsSync(filePath)) {
                return ctx.reply('❌ Export file no longer available.');
            }

            // Telegram has a 50MB file size limit
            const stats = fs.statSync(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);

            if (fileSizeMB > 50) {
                return ctx.reply(
                    `❌ File too large for Telegram (${fileSizeMB.toFixed(2)} MB).\n\n` +
                    `Please use the web API to download this export.`
                );
            }

            await ctx.replyWithDocument(
                { source: filePath, filename },
                { caption: `📦 Data export: ${filename}` }
            );
        } catch (error) {
            console.error('Error sending export:', error);
            await ctx.reply('❌ Failed to send export file. It may be too large or corrupted.');
        }
    }
}

module.exports = DataManagementCommands;