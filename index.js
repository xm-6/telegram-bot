// Import dependencies
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const math = require('mathjs');
const moment = require('moment-timezone');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

let accounts = {}; // Store account data for each chat
let userTimeZones = {}; // Store timezone settings per user
let userLanguages = {}; // Store language settings per user
let exchangeRate = 6.8; // Default exchange rate
let fees = 0.0; // Default fees
let operators = []; // List of operators

(async () => {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;

    const client = new MongoClient(mongoUri);

    try {
        console.log('Connecting to MongoDB...');
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(dbName);
        console.log(`Using database: ${db.databaseName}`);

        // Initialize commands
        bot.command('start', (ctx) => {
            ctx.reply('Hello! The bot is running and connected to MongoDB.');
        });

        bot.command('help', (ctx) => {
            const chatId = ctx.chat.id;
            const language = userLanguages[chatId] || 'zh-CN';
            const helpMessages = {
                'zh-CN': `帮助信息：\n/start - 启动机器人\n/help - 显示帮助\n+100 - 记录入款100 CNY\n账单 - 查看账单\n汇总 - 查看账单汇总\n设置汇率 <值> - 设置汇率\n设置费率 <值> - 设置费率\n计算 <表达式> - 计算数学表达式\n设置时区 <时区名> - 设置用户时区`,
                'en-US': `Help Info:\n/start - Start the bot\n/help - Show help\n+100 - Record deposit 100 CNY\nBill - View bill\nSummary - View summary\nSetRate <value> - Set exchange rate\nSetFee <value> - Set fees\nCalculate <expression> - Calculate a math expression\nSetTimezone <name> - Set user timezone`
            };
            ctx.reply(helpMessages[language]);
        });

        // Deposit handling
        bot.hears(/^\+(\d+)(u?)$/, (ctx) => {
            const amount = parseFloat(ctx.match[1]);
            const currency = ctx.match[2] === 'u' ? 'USDT' : 'CNY';
            const chatId = ctx.chat.id;

            if (!accounts[chatId]) {
                accounts[chatId] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
            }

            accounts[chatId].transactions.push({ type: 'deposit', amount, currency, time: moment().format() });
            accounts[chatId].totalDeposit += amount;

            ctx.reply(`Recorded deposit: ${amount} ${currency}`);
        });

        // Withdrawal handling
        bot.hears(/^下拨(\d+)(u?)$/, (ctx) => {
            const amount = parseFloat(ctx.match[1]);
            const currency = ctx.match[2] === 'u' ? 'USDT' : 'CNY';
            const chatId = ctx.chat.id;

            if (!accounts[chatId]) {
                accounts[chatId] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
            }

            accounts[chatId].transactions.push({ type: 'withdrawal', amount, currency, time: moment().format() });
            accounts[chatId].totalWithdrawal += amount;

            ctx.reply(`Recorded withdrawal: ${amount} ${currency}`);
        });

        // Bill summary
        bot.hears(/账单|Bill/, (ctx) => {
            const chatId = ctx.chat.id;
            if (!accounts[chatId] || accounts[chatId].transactions.length === 0) {
                return ctx.reply('No records found.');
            }

            const details = accounts[chatId].transactions.map((t, i) => `${i + 1}. ${t.type} ${t.amount} ${t.currency} at ${t.time}`).join('\n');
            ctx.reply(`Bill details:\n${details}`);
        });

        // Summary
        bot.hears(/汇总|Summary/, (ctx) => {
            const chatId = ctx.chat.id;
            if (!accounts[chatId]) {
                return ctx.reply('No data available.');
            }

            const { totalDeposit, totalWithdrawal } = accounts[chatId];
            ctx.reply(`Summary:\nTotal Deposit: ${totalDeposit} CNY\nTotal Withdrawal: ${totalWithdrawal} CNY\nNet Balance: ${totalDeposit - totalWithdrawal} CNY`);
        });

        // Set exchange rate
        bot.hears(/^设置汇率 (\d+(\.\d+)?)$/, (ctx) => {
            exchangeRate = parseFloat(ctx.match[1]);
            ctx.reply(`Exchange rate set to: ${exchangeRate}`);
        });

        // Set fees
        bot.hears(/^设置费率 (\d+(\.\d+)?)$/, (ctx) => {
            fees = parseFloat(ctx.match[1]);
            ctx.reply(`Fee rate set to: ${fees}`);
        });

        // Set timezone
        bot.command('设置时区', (ctx) => {
            const timezone = ctx.message.text.split(' ')[1];
            if (!moment.tz.zone(timezone)) {
                return ctx.reply('Invalid timezone. Example: Asia/Shanghai');
            }

            const chatId = ctx.chat.id;
            userTimeZones[chatId] = timezone;
            ctx.reply(`Timezone set to: ${timezone}`);
        });

        // Calculate expression
        bot.command('计算', (ctx) => {
            const expression = ctx.message.text.split(' ').slice(1).join(' ');
            try {
                const result = math.evaluate(expression);
                ctx.reply(`Result: ${result}`);
            } catch (error) {
                ctx.reply('Invalid expression. Example: /计算 5+3*2');
            }
        });

        bot.launch();
        console.log('Bot launched successfully.');

        process.on('SIGINT', () => {
            bot.stop('SIGINT');
            client.close();
            console.log('Bot stopped and database connection closed.');
        });

        process.on('SIGTERM', () => {
            bot.stop('SIGTERM');
            client.close();
            console.log('Bot stopped and database connection closed.');
        });
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
})();
