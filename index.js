// 引入依赖
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

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

        // 初始化 Telegram Bot 的命令
        bot.command('start', (ctx) => {
            ctx.reply('Hello! The bot is running and connected to MongoDB.');
        });

        // 启动 Telegram Bot
        bot.launch();
        console.log('Telegram Bot is running...');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err.message);
        process.exit(1); // 出现错误时退出
    }

    // 创建 HTTP 服务器保持容器活跃
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is running and connected to MongoDB.\n');
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server is listening on port ${PORT}`);
    });

    // 优雅关闭
    process.on('SIGINT', () => {
        bot.stop('SIGINT');
        client.close();
        console.log('Bot stopped and MongoDB connection closed');
    });

    process.on('SIGTERM', () => {
        bot.stop('SIGTERM');
        client.close();
        console.log('Bot stopped and MongoDB connection closed');
    });
})();


// 获取指定时区的当前时间
const getCurrentTime = (chatId) => {
    const timeZone = userTimeZones[chatId] || 'Asia/Shanghai'; // 默认为上海时区
    return new Intl.DateTimeFormat('zh-CN', {
        timeZone: timeZone,
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date());
};
console.log('Bot Token:', process.env.BOT_TOKEN);

// 数据存储（内存模拟）
let accounts = {}; // 存储每个聊天的账单信息
let userTimeZones = {}; // 存储每个用户的时区设置，默认 'Asia/Shanghai'
let userLanguages = {}; // 存储每个用户的语言设置，默认 'zh-CN'
let exchangeRate = 6.8; // 汇率
let fees = 0; // 手续费率
let operators = []; // 操作员列表

// Webhook 入口
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            const body = await json(req); // 解析请求体
            console.log('Webhook update received:', JSON.stringify(body, null, 2));
            await bot.handleUpdate(body); // 处理 Telegram 更新
            res.status(200).send('OK');
        } catch (error) {
            console.error('Error handling update:', error);
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.status(200).send('Webhook is working!');
    }
};

// 捕获所有未处理的错误
bot.catch((err, ctx) => {
    console.error(`Unhandled error for update type: ${ctx.updateType}`, err);
});

// **基础指令**
const messages = {
    'zh-CN': {
        help: `指令列表：
1. +100 -- 记录入款 100 CNY
2. +100u -- 记录入款 100 USDT
3. 下拨100 -- 记录出款 100 CNY
4. 账单 -- 查看当前账单，包含每笔交易时间
5. 汇总 -- 查看账单汇总
6. 设置汇率6.8 -- 设置汇率为 6.8
7. 设置费率0.5 -- 设置费率为 0.5
8. 删除当前数据 -- 清空当前账单
9. 添加操作员 -- 回复消息以添加操作员
10. 删除操作员 -- 回复消息以删除操作员
11. 全局广播<消息> -- 广播消息至所有群
12. 计算<表达式> -- 计算数学表达式（如：5+6*6-1/(6+3)）
13. 设置时区<时区名称> -- 设置当前记录使用的时区（如：Asia/Shanghai）
14. 切换语言<语言代码> -- 切换机器人语言（如：zh-CN 或 en-US）`,
        languageChanged: "语言已切换为：中文。",
        invalidLanguage: "无效的语言代码，请输入 zh-CN 或 en-US。",
    },
    'en-US': {
        help: `Command list:
1. +100 -- Record deposit 100 CNY
2. +100u -- Record deposit 100 USDT
3. Withdraw 100 -- Record withdrawal 100 CNY
4. Bill -- View current bill, including transaction time
5. Summary -- View bill summary
6. Set exchange rate 6.8 -- Set exchange rate to 6.8
7. Set fee rate 0.5 -- Set fee rate to 0.5
8. Delete current data -- Clear current bill
9. Add operator -- Reply to message to add operator
10. Remove operator -- Reply to message to remove operator
11. Global broadcast <message> -- Broadcast message to all groups
12. Calculate <expression> -- Calculate mathematical expression (e.g., 5+6*6-1/(6+3))
13. Set timezone <timezone name> -- Set the timezone for current records (e.g., Asia/Shanghai)
14. Switch language <language code> -- Switch bot language (e.g., zh-CN or en-US)`,
        languageChanged: "Language switched to: English.",
        invalidLanguage: "Invalid language code. Please enter zh-CN or en-US.",
    }
};

// 帮助指令
bot.command('help', (ctx) => {
    const chatId = ctx.chat.id;
    const language = userLanguages[chatId] || 'zh-CN'; // 默认语言为中文

    if (language === 'zh-CN') {
        ctx.reply(messages['zh-CN'].help);
    } else if (language === 'en-US') {
        ctx.reply(messages['en-US'].help);
    }
});

// Ping 测试
bot.hears('ping', (ctx) => {
    console.log('Ping command triggered');
    ctx.reply('pong');
});

const moment = require('moment-timezone');

// 设置时区
bot.command('设置时区', async (ctx) => {
    const timezone = ctx.message.text.split(' ')[1];
    if (!moment.tz.zone(timezone)) {
        return ctx.reply('无效的时区，请输入有效的时区名称。例如：Asia/Shanghai');
    }

    const userId = ctx.from.id;
    await db.collection('users').updateOne(
        { userId },
        { $set: { timezone } },
        { upsert: true }
    );

    ctx.reply(`时区已设置为：${timezone}`);
});

// 显示当前时间
bot.command('当前时间', async (ctx) => {
    const userId = ctx.from.id;
    const user = await db.collection('users').findOne({ userId });
    const timezone = user?.timezone || 'UTC';

    const currentTime = moment().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
    ctx.reply(`当前时间（${timezone}）：${currentTime}`);
});


// 设置语言命令
bot.command('设置语言', async (ctx) => {
    const lang = ctx.message.text.split(' ')[1];
    const supportedLanguages = ['en', 'zh'];

    if (!supportedLanguages.includes(lang)) {
        return ctx.reply('不支持的语言，请选择：en（英语）或 zh（中文）');
    }

    const userId = ctx.from.id;
    await db.collection('users').updateOne(
        { userId },
        { $set: { language: lang } },
        { upsert: true }
    );

    ctx.reply(`语言已设置为：${lang === 'zh' ? '中文' : 'English'}`);
});

// 获取用户语言
async function getUserLanguage(userId) {
    const user = await db.collection('users').findOne({ userId });
    return user?.language || defaultLanguage;
}

// 示例回复
bot.command('测试语言', async (ctx) => {
    const userLang = await getUserLanguage(ctx.from.id);
    const responses = {
        en: 'Hello!',
        zh: '你好！',
    };
    ctx.reply(responses[userLang]);
});


// 计算数学表达式
const math = require('mathjs'); // 安装 math.js 库
// 处理计算命令
bot.command('计算', (ctx) => {
    const input = ctx.message.text.split(' ').slice(1).join(' ');
    try {
        const result = math.evaluate(input);
        ctx.reply(`结果：${result}`);
    } catch (error) {
        ctx.reply('无效的计算表达式，请输入正确的数学公式。例如：/计算 5+3*2');
    }
});


// **入款功能**
bot.hears(/^\+\d+(u?)$/i, (ctx) => {
    console.log('Deposit command triggered');
    try {
        const amount = parseFloat(ctx.match[0].replace('+', '').replace('u', ''));
        const currency = ctx.match[0].includes('u') ? 'USDT' : 'CNY';
        const id = ctx.chat.id;

        if (!accounts[id]) {
            accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
        }

        accounts[id].transactions.push({ type: 'deposit', amount, currency, time: getCurrentTime(id) });
        accounts[id].totalDeposit += amount;

        console.log('Updated accounts:', accounts);
        ctx.reply(`入款已记录：${amount} ${currency}\n时间：${new Date().toLocaleString()}\n当前总入款：${accounts[id].totalDeposit} ${currency}`);
    } catch (error) {
        console.error('Error in deposit command:', error);
        ctx.reply('处理入款时出错，请稍后再试。');
    }
});

// **出款功能**
bot.hears(/^下拨\d+(u?)$/i, (ctx) => {
    console.log('Withdrawal command triggered');
    try {
        const amount = parseFloat(ctx.match[0].replace('下拨', '').replace('u', ''));
        const currency = ctx.match[0].includes('u') ? 'USDT' : 'CNY';
        const id = ctx.chat.id;

        if (!accounts[id]) {
            accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
        }

        accounts[id].transactions.push({ type: 'withdrawal', amount, currency, time: getCurrentTime(id) });
        accounts[id].totalWithdrawal += amount;

        ctx.reply(`出款已记录：${amount} ${currency}\n时间：${new Date().toLocaleString()}\n当前总出款：${accounts[id].totalWithdrawal} ${currency}`);
    } catch (error) {
        console.error('Error in withdrawal command:', error);
        ctx.reply('处理出款时出错，请稍后再试。');
    }
});

// **查看账单**
bot.hears(/^账单$/i, (ctx) => {
    console.log('账单 command triggered');
    const id = ctx.chat.id;

    if (!accounts[id] || accounts[id].transactions.length === 0) {
        return ctx.reply('当前没有账单记录。');
    }

    const { transactions, totalDeposit, totalWithdrawal } = accounts[id];
    let details = `账单明细：\n`;
    transactions.forEach((entry, index) => {
    details += `${index + 1}. ${entry.type === 'deposit' ? '入款' : '出款'} ${entry.amount} ${entry.currency} 时间：${entry.time}\n`;
});

    details += `\n-------------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\n净回款：${totalDeposit - totalWithdrawal} CNY\n`;

    ctx.reply(details);
});

// **汇总账单**
bot.hears(/^汇总$/i, (ctx) => {
    console.log('汇总 command triggered');
    const id = ctx.chat.id;

    if (!accounts[id] || accounts[id].transactions.length === 0) {
        return ctx.reply('当前没有账单记录。');
    }

    const { totalDeposit, totalWithdrawal } = accounts[id];
    ctx.reply(`\n账单汇总：\n-------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\n净回款：${totalDeposit - totalWithdrawal} CNY`);
});

// **清空账单**
bot.hears(/^删除当前数据$/i, (ctx) => {
    console.log('删除当前数据 command triggered');
    const id = ctx.chat.id;
    accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
    ctx.reply('当前账单数据已清空。');
});

// **设置汇率**
bot.hears(/^设置汇率(\d+(\.\d+)?)$/i, (ctx) => {
    try {
        const rate = parseFloat(ctx.match[1]);
        exchangeRate = rate;
        console.log(`Exchange rate set to: ${exchangeRate}`);
        ctx.reply(`汇率已设置为：${exchangeRate}`);
    } catch (error) {
        console.error('Error setting exchange rate:', error);
        ctx.reply('设置汇率失败，请检查输入格式（如：设置汇率6.8）');
    }
});

// **设置费率**
bot.hears(/^设置费率(\d+(\.\d+)?)$/i, (ctx) => {
    try {
        const rate = parseFloat(ctx.match[1]);
        fees = rate;
        console.log(`Fees set to: ${fees}`);
        ctx.reply(`费率已设置为：${fees}`);
    } catch (error) {
        console.error('Error setting fees:', error);
        ctx.reply('设置费率失败，请检查输入格式（如：设置费率0.5）');
    }
});

// **添加操作员**
bot.hears(/^添加操作员$/i, (ctx) => {
    try {
        const replyTo = ctx.message.reply_to_message;
        if (!replyTo) {
            return ctx.reply('请回复用户的消息以添加操作员。');
        }

        const userId = replyTo.from.id;
        if (!operators.includes(userId)) {
            operators.push(userId);
            console.log(`Added operator: ${userId}`);
            ctx.reply(`已添加操作员：${userId}`);
        } else {
            ctx.reply('该用户已是操作员。');
        }
    } catch (error) {
        console.error('Error adding operator:', error);
        ctx.reply('添加操作员时出错，请稍后再试。');
    }
});

// **删除操作员**
bot.hears(/^删除操作员$/i, (ctx) => {
    try {
        const replyTo = ctx.message.reply_to_message;
        if (!replyTo) {
            return ctx.reply('请回复用户的消息以删除操作员。');
        }

        const userId = replyTo.from.id;
        operators = operators.filter((id) => id !== userId);
        console.log(`Removed operator: ${userId}`);
        ctx.reply(`已删除操作员：${userId}`);
    } catch (error) {
        console.error('Error removing operator:', error);
        ctx.reply('删除操作员时出错，请稍后再试。');
    }
});

// **查询命令**
bot.hears(/^查询<(.+)>$/, (ctx) => {
    try {
        const query = ctx.match[1];
        console.log(`Query command triggered with query: ${query}`);
        ctx.reply(`查询结果：暂时无法获取 "${query}" 的信息。`);
    } catch (error) {
        console.error('Error in query command:', error);
        ctx.reply('查询失败，请稍后再试。');
    }
});

// **上课与下课**
bot.command('上课', (ctx) => {
    console.log('上课 command triggered');
    ctx.reply('允许群成员发言');
});

bot.command('下课', (ctx) => {
    console.log('下课 command triggered');
    ctx.reply('禁止群成员发言');
});

// **全局广播（需要 OWNER_ID 权限）**
bot.hears(/^全局广播(.+)$/i, (ctx) => {
    console.log('广播 command triggered');
    if (ctx.chat.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply('无权限操作。');
    }

    const message = ctx.match[1];
    ctx.reply(`广播消息：${message}`);
});

// **超时和重试机制**
async function callTelegramApiWithRetries(method, data, retries = 3, timeout = 15000) {
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
    let attempts = 0;

    while (attempts < retries) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
            });

            clearTimeout(id);

            if (!response.ok) {
                throw new Error(`Telegram API error: ${response.statusText}`);
            }

            console.log(`API call succeeded on attempt ${attempts + 1}`);
            return await response.json();
        } catch (error) {
            attempts++;
            console.error(`Attempt ${attempts} failed:`, error.message);
            if (attempts >= retries) {
                throw new Error('Max retries reached. Request failed.');
            }
        }
    }
}
