// 引入依赖
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储
const accounts = {}; // 每个用户的账单记录
const userSettings = {}; // 包括时区和货币等信息
let operators = [process.env.OWNER_ID]; // 默认仅 OWNER_ID 是操作员
let exchangeRate = 7.1; // 默认 USDT 汇率

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    // 获取用户的当前时间
    const getUserTime = (userId) => {
        const timezone = userSettings[userId]?.timezone || 'UTC';
        return moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
    };

    // 检查是否为操作员
    const isOperator = (userId) => operators.includes(userId.toString());

    // 初始化命令
    bot.start((ctx) => {
        ctx.reply('欢迎使用记账机器人！输入 /help 查看所有指令。');
    });

    bot.command('help', (ctx) => {
        ctx.reply(`支持的指令：
1. +100 -- 记录入款 100
2. -100 -- 记录出款 100
3. 账单 -- 查看当前账单和汇总
4. 删除 <时间> -- 删除指定时间的记录（例如 删除 11:20:23）
5. 设置USDT汇率：<汇率> -- 设置 USDT 汇率（例如 设置USDT汇率：7.1）
6. 切换币种 <币种> -- 切换货币单位（支持：CNY, USD, EUR, JPY）
7. 设置时区 <时区> -- 设置时区（支持：UTC, Asia/Shanghai, Europe/London, etc.）
8. 添加操作员 -- 回复消息或指定用户名以添加操作员
9. 删除操作员 -- 回复消息或指定用户名以删除操作员
10. 直接输入数学表达式 -- 计算数学表达式`);
    });

    // 记录入款
    bot.hears(/^\+(\d+)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const amount = parseFloat(ctx.match[1]);
        const userId = ctx.from.id;
        const currency = userSettings[userId]?.currency || 'CNY';
        if (!accounts[userId]) accounts[userId] = [];
        const transactionTime = getUserTime(userId);
        accounts[userId].push({ type: '入款', amount, currency, time: transactionTime });

        const transactions = accounts[userId].filter(e => e.type === '入款');
        const details = transactions.map((entry) => `${entry.amount} ${entry.currency}  [${entry.time.split(' ')[1]}]`).join('\n');
        const totalInUSDT = (transactions.reduce((sum, entry) => sum + entry.amount, 0) / exchangeRate).toFixed(2);

        ctx.reply(`账单日期:${moment().format('YYYY/MM/DD')}\n入款${transactions.length}笔：\n${details}\nUSDT：${totalInUSDT}`);
    });

    // 记录出款
    bot.hears(/^-(\d+)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const amount = parseFloat(ctx.match[1]);
        const userId = ctx.from.id;
        const currency = userSettings[userId]?.currency || 'CNY';
        if (!accounts[userId]) accounts[userId] = [];
        const transactionTime = getUserTime(userId);
        accounts[userId].push({ type: '出款', amount, currency, time: transactionTime });

        ctx.reply(`已记录出款：${amount} ${currency} 时间：${transactionTime}`);
    });

    // 查看账单
    bot.command('账单', (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const userId = ctx.from.id;
        if (!accounts[userId] || accounts[userId].length === 0) {
            return ctx.reply('当前没有账单记录。');
        }
        const transactions = accounts[userId];
        const deposits = transactions.filter(e => e.type === '入款');
        const withdrawals = transactions.filter(e => e.type === '出款');
        const depositDetails = deposits.map((entry) => `${entry.amount} ${entry.currency}  [${entry.time.split(' ')[1]}]`).join('\n');
        const totalDeposit = deposits.reduce((sum, entry) => sum + entry.amount, 0);
        const totalWithdrawal = withdrawals.reduce((sum, entry) => sum + entry.amount, 0);
        const netInUSDT = ((totalDeposit - totalWithdrawal) / exchangeRate).toFixed(2);

        ctx.reply(`账单日期:${moment().format('YYYY/MM/DD')}\n入款${deposits.length}笔：\n${depositDetails}\n---------------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\nUSDT：${netInUSDT}`);
    });

    // 添加操作员
    bot.command('添加操作员', (ctx) => {
        if (ctx.message.reply_to_message) {
            const newOperator = ctx.message.reply_to_message.from.id.toString();
            if (!operators.includes(newOperator)) {
                operators.push(newOperator);
                ctx.reply('已添加操作员。');
            } else {
                ctx.reply('该用户已是操作员。');
            }
        } else {
            const username = ctx.message.text.split(' ')[1];
            if (username) {
                operators.push(username);
                ctx.reply(`已添加操作员：${username}`);
            } else {
                ctx.reply('请回复消息或指定用户名以添加操作员。');
            }
        }
    });

    // 删除操作员
    bot.command('删除操作员', (ctx) => {
        if (ctx.message.reply_to_message) {
            const operator = ctx.message.reply_to_message.from.id.toString();
            operators = operators.filter(op => op !== operator);
            ctx.reply('已删除操作员。');
        } else {
            const username = ctx.message.text.split(' ')[1];
            if (username) {
                operators = operators.filter(op => op !== username);
                ctx.reply(`已删除操作员：${username}`);
            } else {
                ctx.reply('请回复消息或指定用户名以删除操作员。');
            }
        }
    });

    // 删除指定记录
    bot.hears(/^删除\s+([0-9:]+)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const userId = ctx.from.id;
        const timeToDelete = ctx.match[1];
        if (!accounts[userId]) {
            return ctx.reply('没有找到相关记录。');
        }
        const initialLength = accounts[userId].length;
        accounts[userId] = accounts[userId].filter(entry => !entry.time.includes(timeToDelete));
        if (accounts[userId].length < initialLength) {
            ctx.reply(`已删除 ${timeToDelete} 的账单记录。`);
        } else {
            ctx.reply('未找到对应时间的记录。');
        }
    });

    // 设置 USDT 汇率
    bot.hears(/^设置USDT汇率：(\d+(\.\d+)?)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        exchangeRate = parseFloat(ctx.match[1]);
        ctx.reply(`USDT 汇率已设置为：${exchangeRate}`);
    });

    // 切换币种
    bot.hears(/^切换币种 (.+)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const currency = ctx.match[1];
        const supportedCurrencies = ['CNY', 'USD', 'EUR', 'JPY'];
        if (!supportedCurrencies.includes(currency)) {
            return ctx.reply('不支持的币种。支持的币种有：CNY, USD, EUR, JPY');
        }
        const userId = ctx.from.id;
        if (!userSettings[userId]) userSettings[userId] = {};
        userSettings[userId].currency = currency;
        ctx.reply(`币种已切换为：${currency}`);
    });

    // 设置时区
    bot.hears(/^设置时区 (.+)/, (ctx) => {
        if (!isOperator(ctx.from.id)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const timezone = ctx.match[1];
        if (!moment.tz.zone(timezone)) {
            return ctx.reply('无效的时区名称。支持的时区包括：UTC, Asia/Shanghai, Europe/London 等。');
        }
        const userId = ctx.from.id;
        if (!userSettings[userId]) userSettings[userId] = {};
        userSettings[userId].timezone = timezone;
        ctx.reply(`时区已设置为：${timezone}`);
    });

    // 启动 bot
    bot.launch();
    console.log('Telegram bot 已启动');
})();
