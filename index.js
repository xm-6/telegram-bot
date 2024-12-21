// 引入依赖
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const math = require('mathjs');
const moment = require('moment-timezone');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储
const accounts = {}; // 每个用户的账单记录
const userSettings = {}; // 包括时区、语言和货币等信息
let operators = []; // 操作员列表
let exchangeRate = 6.8; // 默认汇率
let feeRate = 0.5; // 默认费率

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    // 获取用户的当前时间
    const getUserTime = (userId) => {
        const timezone = userSettings[userId]?.timezone || 'UTC';
        return moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
    };

    // 初始化命令
    bot.start((ctx) => {
        ctx.reply('欢迎使用记账机器人！输入 /help 查看所有指令。');
    });

    bot.command('help', (ctx) => {
        ctx.reply(`支持的指令：
1. +100 -- 记录入款 100
2. -100 -- 记录入款 -100
3. 下发100 -- 记录出款 100
4. 账单 -- 查看当前账单
5. 汇总 -- 查看账单汇总
6. 设置汇率6.8 -- 设置汇率为 6.8
7. 设置费率0.5 -- 设置费率为 0.5
8. 删除当前数据 -- 清空当前账单
9. 添加操作员 -- 回复消息以添加操作员
10. 删除操作员 -- 回复消息以删除操作员
11. 全局广播<消息> -- 广播消息至所有群
12. 计算<表达式> -- 计算数学表达式
13. 设置时区<时区名称> -- 设置时区
14. 切换语言<语言代码> -- 切换语言
15. 切换币种<币种代码> -- 切换货币单位`);
    });

    // 记录入款
    bot.hears(/^\+(\d+)/, (ctx) => {
        const amount = parseFloat(ctx.match[1]);
        const userId = ctx.from.id;
        const currency = userSettings[userId]?.currency || 'CNY';
        if (!accounts[userId]) accounts[userId] = [];
        const transactionTime = getUserTime(userId);
        accounts[userId].push({ type: '入款', amount, currency, time: transactionTime });
        const usdtAmount = (amount / exchangeRate).toFixed(2);
        ctx.reply(`已记录入款：${amount} ${currency} 时间：${transactionTime}\nUSDT：${usdtAmount}`);
    });

    // 记录出款
    bot.hears(/^下发(\d+)/, (ctx) => {
        const amount = parseFloat(ctx.match[1]);
        const userId = ctx.from.id;
        const currency = userSettings[userId]?.currency || 'CNY';
        if (!accounts[userId]) accounts[userId] = [];
        const transactionTime = getUserTime(userId);
        accounts[userId].push({ type: '出款', amount, currency, time: transactionTime });
        const usdtAmount = (amount / exchangeRate).toFixed(2);
        ctx.reply(`已记录出款：${amount} ${currency} 时间：${transactionTime}\nUSDT：${usdtAmount}`);
    });

    // 查看账单
    bot.command('账单', (ctx) => {
        const userId = ctx.from.id;
        if (!accounts[userId] || accounts[userId].length === 0) {
            return ctx.reply('当前没有账单记录。');
        }
        const today = moment().format('YYYY/MM/DD');
        const transactions = accounts[userId];
        const details = transactions.map((entry, index) => `${index + 1}. ${entry.type} ${entry.amount} ${entry.currency} [${entry.time.split(' ')[1]}]`).join('\n');
        const totalInCNY = transactions.reduce((sum, entry) => entry.type === '入款' ? sum + entry.amount : sum, 0);
        const totalInUSDT = (totalInCNY / exchangeRate).toFixed(2);
        ctx.reply(`账单日期: ${today}\n入款${transactions.length}笔：\n${details}\nUSDT：${totalInUSDT}`);
    });

    // 汇总
    bot.command('汇总', (ctx) => {
        const userId = ctx.from.id;
        if (!accounts[userId] || accounts[userId].length === 0) {
            return ctx.reply('当前没有账单记录。');
        }
        const total = accounts[userId].reduce((acc, entry) => {
            if (entry.type === '入款') acc.deposit += entry.amount;
            if (entry.type === '出款') acc.withdrawal += entry.amount;
            return acc;
        }, { deposit: 0, withdrawal: 0 });
        const netInCNY = total.deposit - total.withdrawal;
        const netInUSDT = (netInCNY / exchangeRate).toFixed(2);
        ctx.reply(`汇总：\n总入款：${total.deposit} CNY\n总出款：${total.withdrawal} CNY\n净收入：${netInCNY} CNY\nUSDT：${netInUSDT}`);
    });

    // 设置汇率
    bot.hears(/^设置汇率(\d+(\.\d+)?)/, (ctx) => {
        exchangeRate = parseFloat(ctx.match[1]);
        ctx.reply(`汇率已设置为：${exchangeRate}`);
    });

    // 设置费率
    bot.hears(/^设置费率(\d+(\.\d+)?)/, (ctx) => {
        feeRate = parseFloat(ctx.match[1]);
        ctx.reply(`费率已设置为：${feeRate}`);
    });

    // 删除当前数据
    bot.command('删除当前数据', (ctx) => {
        const userId = ctx.from.id;
        accounts[userId] = [];
        ctx.reply('当前账单数据已清空。');
    });

    // 添加操作员
    bot.command('添加操作员', (ctx) => {
        if (ctx.message.reply_to_message) {
            const newOperator = ctx.message.reply_to_message.from.id;
            if (!operators.includes(newOperator)) {
                operators.push(newOperator);
                ctx.reply('已添加操作员。');
            } else {
                ctx.reply('该用户已是操作员。');
            }
        } else {
            ctx.reply('请回复一条消息以添加操作员。');
        }
    });

    // 删除操作员
    bot.command('删除操作员', (ctx) => {
        if (ctx.message.reply_to_message) {
            const operator = ctx.message.reply_to_message.from.id;
            operators = operators.filter(op => op !== operator);
            ctx.reply('已删除操作员。');
        } else {
            ctx.reply('请回复一条消息以删除操作员。');
        }
    });

    // 全局广播
    bot.command('全局广播', (ctx) => {
        if (ctx.from.id.toString() === process.env.OWNER_ID) {
            const message = ctx.message.text.split(' ').slice(1).join(' ');
            if (message) {
                operators.forEach(op => bot.telegram.sendMessage(op, message));
                ctx.reply('广播消息已发送。');
            } else {
                ctx.reply('请提供广播消息内容。');
            }
        } else {
            ctx.reply('无权限执行此操作。');
        }
    });

    // 数学计算
    bot.hears(/^计算(.*)/, (ctx) => {
        try {
            const result = math.evaluate(ctx.match[1]);
            ctx.reply(`计算结果：${result}`);
        } catch {
            ctx.reply('无效的数学表达式。');
        }
    });

    // 设置时区
    bot.hears(/^设置时区 (.+)/, (ctx) => {
        const timezone = ctx.match[1];
        if (!moment.tz.zone(timezone)) {
            return ctx.reply('无效的时区名称。');
        }
        const userId = ctx.from.id;
        if (!userSettings[userId]) userSettings[userId] = {};
        userSettings[userId].timezone = timezone;
        ctx.reply(`时区已设置为：${timezone}`);
    });

    // 切换语言
    bot.hears(/^切换语言 (.+)/, (ctx) => {
        const language = ctx.match[1];
        const supportedLanguages = ['zh-CN', 'en-US'];
        if (!supportedLanguages.includes(language)) {
            return ctx.reply('不支持的语言。');
        }
        const userId = ctx.from.id;
        if (!userSettings[userId]) userSettings[userId] = {};
        userSettings[userId].language = language;
        ctx.reply(`语言已切换为：${language}`);
    });

    // 切换币种
    bot.hears(/^切换币种 (.+)/, (ctx) => {
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

    // 启动 bot
    bot.launch();
    console.log('Telegram bot 已启动');
})();
