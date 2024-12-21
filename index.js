const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
require('dotenv').config();

// 加载环境变量
if (!process.env.BOT_TOKEN || !process.env.MONGODB_URI || !process.env.MONGODB_DB || !process.env.OWNER_ID) {
    console.error('环境变量 BOT_TOKEN, MONGODB_URI, MONGODB_DB 或 OWNER_ID 未正确配置');
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// 全局数据结构
const accounts = {}; // 用户或群组账单
const userSettings = {}; // 包括时区、货币和权限信息
let authorizedUsers = [process.env.OWNER_ID]; // 默认仅 OWNER_ID 可以使用所有功能
let exchangeRate = 7.1; // 默认 USDT 汇率

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        console.log('MongoDB 连接成功');
        const db = client.db(process.env.MONGODB_DB);

        // 获取用户时间
        const getUserTime = (userId) => {
            const timezone = userSettings[userId]?.timezone || 'UTC';
            return moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
        };

        // 获取账户 ID
        const getAccountId = (ctx) => {
            return ctx.chat.type === 'private' ? `用户-${ctx.from.id}` : `群组-${ctx.chat.id}`;
        };

// 检查权限
const hasPermission = (ctx) => {
    return authorizedUsers.includes(ctx.from.id.toString());
};

// 授权用户命令
bot.command('授权用户', (ctx) => {
    if (ctx.from.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply('您无权执行此操作。');
    }
    const targetId = ctx.message.reply_to_message?.from.id.toString() || ctx.message.text.split(' ')[1];
    if (!targetId) {
        return ctx.reply('请回复目标用户的消息或提供用户ID以授权。');
    }
    if (!authorizedUsers.includes(targetId)) {
        authorizedUsers.push(targetId);
        ctx.reply(`用户 ${targetId} 已被授权使用机器人功能。`);
    } else {
        ctx.reply(`用户 ${targetId} 已经拥有权限。`);
    }
});

        // 初始化命令
        bot.start((ctx) => {
            const accountId = getAccountId(ctx);
            if (!userSettings[accountId]) {
                userSettings[accountId] = { isAuthorized: true, timezone: 'UTC', currency: 'CNY' };
            }
            ctx.reply('欢迎使用记账机器人！输入 /help 查看所有指令。如果需要更高权限，请联系管理员。');
        });

        bot.command('help', (ctx) => {
            ctx.reply(`支持的指令：
1. +100 -- 记录入款 100
2. -100 -- 记录出款 100
3. 账单 -- 查看所有账单和汇总
4. 删除 <时间> -- 删除指定时间的记录（例如 删除 11:20:23）
5. 设置USDT汇率 <汇率> -- 设置 USDT 汇率（例如 设置USDT汇率 10.6）
6. 切换币种 <币种> -- 切换货币单位（支持：CNY, USD, EUR, JPY）
7. 设置时区 <时区> -- 设置时区（支持：UTC, Asia/Shanghai, Europe/London, etc.）
8. 授权用户 -- 回复消息或指定用户ID授权使用机器人
9. 数学计算 -- 输入数学表达式直接计算结果
10. 清除账单 -- 清除所有账单记录`);
        });

        // 记录入款
        bot.hears(/^\+(\d+(\.\d+)?)/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
            }
            const amount = parseFloat(ctx.match[1]);
            const accountId = getAccountId(ctx);
            const currency = userSettings[accountId]?.currency || 'CNY';
            if (!accounts[accountId]) accounts[accountId] = [];
            const transactionTime = getUserTime(accountId);
            accounts[accountId].push({ type: '入款', amount, currency, time: transactionTime });

            const transactions = accounts[accountId].slice(-5);
            const details = transactions.map((entry) => `${entry.type === '入款' ? '' : '-'}${entry.amount} ${entry.currency}  [${entry.time.split(' ')[1]}]`).join('\n');
            const totalDeposit = accounts[accountId].filter(e => e.type === '入款').reduce((sum, entry) => sum + entry.amount, 0);
            const totalWithdrawal = accounts[accountId].filter(e => e.type === '出款').reduce((sum, entry) => sum + entry.amount, 0);
            const netTotal = totalDeposit - totalWithdrawal;
            const netInUSDT = (netTotal / exchangeRate).toFixed(2);

            ctx.reply(`账单日期:${moment().format('YYYY/MM/DD')}
入款笔数：${accounts[accountId].filter(e => e.type === '入款').length}  出款笔数：${accounts[accountId].filter(e => e.type === '出款').length}
记录：
${details}
---------------------------
总入款：${totalDeposit} CNY
总出款：${totalWithdrawal} CNY
净总和：${netTotal} CNY
USDT：${netInUSDT}`);
        });

        // 记录出款
        bot.hears(/^-(\d+(\.\d+)?)/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
            }
            const amount = parseFloat(ctx.match[1]);
            const accountId = getAccountId(ctx);
            const currency = userSettings[accountId]?.currency || 'CNY';
            if (!accounts[accountId]) accounts[accountId] = [];
            const transactionTime = getUserTime(accountId);
            accounts[accountId].push({ type: '出款', amount, currency, time: transactionTime });

            const transactions = accounts[accountId].slice(-5);
            const details = transactions.map((entry) => `${entry.type === '入款' ? '' : '-'}${entry.amount} ${entry.currency}  [${entry.time.split(' ')[1]}]`).join('\n');
            const totalDeposit = accounts[accountId].filter(e => e.type === '入款').reduce((sum, entry) => sum + entry.amount, 0);
            const totalWithdrawal = accounts[accountId].filter(e => e.type === '出款').reduce((sum, entry) => sum + entry.amount, 0);
            const netTotal = totalDeposit - totalWithdrawal;
            const netInUSDT = (netTotal / exchangeRate).toFixed(2);

            ctx.reply(`账单日期:${moment().format('YYYY/MM/DD')}
入款笔数：${accounts[accountId].filter(e => e.type === '入款').length}  出款笔数：${accounts[accountId].filter(e => e.type === '出款').length}
记录：
${details}
---------------------------
总入款：${totalDeposit} CNY
总出款：${totalWithdrawal} CNY
净总和：${netTotal} CNY
USDT：${netInUSDT}`);
        });

        // 删除记录
        bot.hears(/^删除\s+([0-9:]+)/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
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

        // 清除所有账单
        bot.command('清除账单', (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
            }
            const accountId = getAccountId(ctx);
            if (!accounts[accountId]) {
                return ctx.reply('当前没有账单记录。');
            }
            accounts[accountId] = [];
            ctx.reply('所有账单记录已清除。');
        });

        // 设置 USDT 汇率
        bot.hears(/^设置USDT汇率\s+(\d+(\.\d+)?)/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
            }
            exchangeRate = parseFloat(ctx.match[1]);
            ctx.reply(`USDT 汇率已设置为：${exchangeRate}`);
        });

        // 切换币种
        bot.hears(/^切换币种 (.+)/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
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
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
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

        // 授权用户
        bot.command('授权用户', (ctx) => {
            if (ctx.from.id.toString() !== process.env.OWNER_ID) {
                return ctx.reply('您无权执行此操作。');
            }
            const targetId = ctx.message.reply_to_message?.from.id.toString() || ctx.message.text.split(' ')[1];
            if (!targetId) {
                return ctx.reply('请回复目标用户的消息或提供用户ID以授权。');
            }
            if (!authorizedUsers.includes(targetId)) {
                authorizedUsers.push(targetId);
                ctx.reply(`用户 ${targetId} 已被授权使用机器人功能。`);
            } else {
                ctx.reply(`用户 ${targetId} 已经拥有权限。`);
            }
        });

        // 数学计算
        bot.hears(/^[0-9()+\-*/.\s]+$/, (ctx) => {
            if (!hasPermission(ctx)) {
                return ctx.reply('您无权使用此功能。请联系管理员。');
            }
            try {
                const expression = ctx.message.text.replace(/[^-()\d/*+.]/g, ''); // 防止代码注入
                const result = eval(expression);
                ctx.reply(`计算结果：${result}`);
            } catch {
                ctx.reply('无效的数学表达式。');
            }
        });

        // 启动 bot
        bot.launch();
        console.log('Telegram bot 已优化并启动');

    } catch (error) {
        console.error('启动过程中发生错误:', error.message);
        process.exit(1);
    }
})();
