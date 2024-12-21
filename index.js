// 引入依赖
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储
const accounts = {}; // 每个用户或群组的账单记录
const userSettings = {}; // 包括时区和货币等信息
let operators = [process.env.OWNER_ID]; // 默认仅 OWNER_ID 是超级管理员
const PERMISSION_LEVELS = {
    SUPER_ADMIN: 3,
    ADMIN: 2,
    OPERATOR: 1,
};
const userPermissions = { [process.env.OWNER_ID]: PERMISSION_LEVELS.SUPER_ADMIN }; // 用户权限表
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

    // 获取账单编号
    const getAccountId = (ctx) => {
        return ctx.chat.type === 'private' ? `用户-${ctx.from.id}` : `群组-${ctx.chat.id}`;
    };

    // 检查权限
    const hasPermission = (ctx, requiredLevel) => {
        const userId = ctx.from.id.toString();
        const userLevel = userPermissions[userId] || 0;
        return userLevel >= requiredLevel;
    };

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
5. 设置USDT汇率 <汇率> -- 设置 USDT 汇率（例如 设置USDT汇率 10.6）
6. 切换币种 <币种> -- 切换货币单位（支持：CNY, USD, EUR, JPY）
7. 设置时区 <时区> -- 设置时区（支持：UTC, Asia/Shanghai, Europe/London, etc.）
8. 添加操作员 <@用户名> -- 添加操作员权限
9. 删除操作员 <@用户名> -- 删除操作员权限
10. 设置权限 <@用户名> <权限级别> -- 设置用户权限（1: 操作员, 2: 管理员, 3: 超级管理员）
11. 直接输入数学表达式 -- 计算数学表达式`);
    });

    // 记录入款
    bot.hears(/^\+(\d+)/, (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.OPERATOR)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const amount = parseFloat(ctx.match[1]);
        const accountId = getAccountId(ctx);
        const currency = userSettings[accountId]?.currency || 'CNY';
        if (!accounts[accountId]) accounts[accountId] = [];
        const transactionTime = getUserTime(accountId);
        accounts[accountId].push({ type: '入款', amount, currency, time: transactionTime });

        const totalDeposit = accounts[accountId].filter(e => e.type === '入款').reduce((sum, entry) => sum + entry.amount, 0);
        const totalWithdrawal = accounts[accountId].filter(e => e.type === '出款').reduce((sum, entry) => sum + entry.amount, 0);
        const depositCount = accounts[accountId].filter(e => e.type === '入款').length;
        const withdrawalCount = accounts[accountId].filter(e => e.type === '出款').length;
        const netTotal = totalDeposit - totalWithdrawal;
        const netInUSDT = (netTotal / exchangeRate).toFixed(2);

        ctx.reply(`记录成功！\n当前净总和：${netTotal} CNY\nUSDT：${netInUSDT}\n入款笔数：${depositCount}，出款笔数：${withdrawalCount}`);
    });
    
    // 记录出款
    bot.hears(/^-(\d+)/, (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.OPERATOR)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const amount = parseFloat(ctx.match[1]);
        const accountId = getAccountId(ctx);
        const currency = userSettings[accountId]?.currency || 'CNY';
        if (!accounts[accountId]) accounts[accountId] = [];
        const transactionTime = getUserTime(accountId);
        accounts[accountId].push({ type: '出款', amount, currency, time: transactionTime });

        const totalDeposit = accounts[accountId].filter(e => e.type === '入款').reduce((sum, entry) => sum + entry.amount, 0);
        const totalWithdrawal = accounts[accountId].filter(e => e.type === '出款').reduce((sum, entry) => sum + entry.amount, 0);
        const depositCount = accounts[accountId].filter(e => e.type === '入款').length;
        const withdrawalCount = accounts[accountId].filter(e => e.type === '出款').length;
        const netTotal = totalDeposit - totalWithdrawal;
        const netInUSDT = (netTotal / exchangeRate).toFixed(2);

        ctx.reply(`记录成功！\n当前净总和：${netTotal} CNY\nUSDT：${netInUSDT}\n入款笔数：${depositCount}，出款笔数：${withdrawalCount}`);
    });
    
    // 查看账单
    bot.command('账单', (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.OPERATOR)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const accountId = getAccountId(ctx);
        if (!accounts[accountId] || accounts[accountId].length === 0) {
            return ctx.reply('当前没有账单记录。');
        }
        const transactions = accounts[accountId];
        const details = transactions.map((entry) => `${entry.amount} ${entry.currency} ${entry.type} [${entry.time}]`).join('\n');
        const totalDeposit = transactions.filter(e => e.type === '入款').reduce((sum, entry) => sum + entry.amount, 0);
        const totalWithdrawal = transactions.filter(e => e.type === '出款').reduce((sum, entry) => sum + entry.amount, 0);
        const depositCount = transactions.filter(e => e.type === '入款').length;
        const withdrawalCount = transactions.filter(e => e.type === '出款').length;
        const netTotal = totalDeposit - totalWithdrawal;
        const netInUSDT = (netTotal / exchangeRate).toFixed(2);

        ctx.reply(`账单日期:${moment().format('YYYY/MM/DD')}\n所有记录：\n${details}\n---------------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\n入款笔数：${depositCount}，出款笔数：${withdrawalCount}\n净总和：${netTotal} CNY\nUSDT：${netInUSDT}`);
    });

    // 添加操作员
    bot.command('添加操作员', (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.ADMIN)) {
            return ctx.reply('您无权执行此操作。');
        }
        const username = ctx.message.text.split(' ')[1];
        if (username && username.startsWith('@')) {
            const userId = username.slice(1);
            if (!userPermissions[userId]) {
                userPermissions[userId] = PERMISSION_LEVELS.OPERATOR;
                ctx.reply(`已添加操作员：${username}`);
            } else {
                ctx.reply(`${username} 已经是操作员或更高级权限用户。`);
            }
        } else {
            ctx.reply('请使用 @用户名 格式指定用户以添加操作员。');
        }
    });

    // 删除操作员
    bot.command('删除操作员', (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.ADMIN)) {
            return ctx.reply('您无权执行此操作。');
        }
        const username = ctx.message.text.split(' ')[1];
        if (username && username.startsWith('@')) {
            const userId = username.slice(1);
            if (userPermissions[userId] && userPermissions[userId] === PERMISSION_LEVELS.OPERATOR) {
                delete userPermissions[userId];
                ctx.reply(`已删除操作员：${username}`);
            } else {
                ctx.reply(`${username} 不是操作员或权限更高，无法删除。`);
            }
        } else {
            ctx.reply('请使用 @用户名 格式指定用户以删除操作员。');
        }
    });

    // 设置权限
    bot.command('设置权限', (ctx) => {
        if (!hasPermission(ctx, PERMISSION_LEVELS.SUPER_ADMIN)) {
            return ctx.reply('您无权执行此操作。');
        }
        const parts = ctx.message.text.split(' ');
        const username = parts[1];
        const level = parseInt(parts[2], 10);
        if (username && username.startsWith('@') && Object.values(PERMISSION_LEVELS).includes(level)) {
            const userId = username.slice(1);
            userPermissions[userId] = level;
            ctx.reply(`已将用户 ${username} 的权限设置为 ${level}`);
        } else {
            ctx.reply('格式错误，请使用：设置权限 <@用户名> <权限级别>');
        }
    });

        // 添加日志跟踪用于调试
    bot.use((ctx, next) => {
        console.log(`收到消息: ${ctx.message?.text}`);
        return next();
    });

    bot.catch((err, ctx) => {
    console.error(`错误捕获: ${ctx.updateType}`, err);
    ctx.reply('发生了错误，请稍后重试。');
});
    
    // 删除指定记录
    bot.hears(/^删除\s+([0-9:]+)/, (ctx) => {
        if (!isOperator(ctx)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const accountId = getAccountId(ctx);
        const timeToDelete = ctx.match[1];
        if (!accounts[accountId]) {
            return ctx.reply('没有找到相关记录。');
        }
        const initialLength = accounts[accountId].length;
        accounts[accountId] = accounts[accountId].filter(entry => !entry.time.includes(timeToDelete));
        if (accounts[accountId].length < initialLength) {
            ctx.reply(`已删除 ${timeToDelete} 的账单记录。`);
        } else {
            ctx.reply('未找到对应时间的记录。');
        }
    });

    // 设置 USDT 汇率
    bot.hears(/^设置USDT汇率\s+(\d+(\.\d+)?)/, (ctx) => {
        if (!isOperator(ctx)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        exchangeRate = parseFloat(ctx.match[1]);
        ctx.reply(`USDT 汇率已设置为：${exchangeRate}`);
    });

    // 数学计算
    bot.hears(/^.*[+\-*/].*$/, (ctx) => {
        try {
            const result = eval(ctx.message.text);
            ctx.reply(`计算结果：${result}`);
        } catch {
            ctx.reply('无效的数学表达式。');
        }
    });

    // 切换币种
    bot.hears(/^切换币种 (.+)/, (ctx) => {
        if (!isOperator(ctx)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const currency = ctx.match[1];
        const supportedCurrencies = ['CNY', 'USD', 'EUR', 'JPY'];
        if (!supportedCurrencies.includes(currency)) {
            return ctx.reply('不支持的币种。支持的币种有：CNY, USD, EUR, JPY');
        }
        const accountId = getAccountId(ctx);
        if (!userSettings[accountId]) userSettings[accountId] = {};
        userSettings[accountId].currency = currency;
        ctx.reply(`币种已切换为：${currency}`);
    });

    // 设置时区
    bot.hears(/^设置时区 (.+)/, (ctx) => {
        if (!isOperator(ctx)) {
            return ctx.reply('您无权使用此机器人。请联系管理员。');
        }
        const timezone = ctx.match[1];
        if (!moment.tz.zone(timezone)) {
            return ctx.reply('无效的时区名称。支持的时区包括：UTC, Asia/Shanghai, Europe/London 等。');
        }
        const accountId = getAccountId(ctx);
        if (!userSettings[accountId]) userSettings[accountId] = {};
        userSettings[accountId].timezone = timezone;
        ctx.reply(`时区已设置为：${timezone}`);
    });

    // 启动 bot
    bot.launch();
    console.log('Telegram bot 已启动');
})();
