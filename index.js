// 引入依赖
const { Telegraf } = require('telegraf');
const { json } = require('micro'); // 确保 micro 已安装
require('dotenv').config();

// 初始化 Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

console.log('Bot Token:', process.env.BOT_TOKEN);

// 示例监听器，用于测试 Bot 是否正常运行
bot.hears('ping', (ctx) => ctx.reply('pong'));

// Webhook 入口
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const body = await json(req); // 解析请求体
      await bot.handleUpdate(body); // 交由 Telegram Bot 处理
    } catch (error) {
      console.error('Error handling update:', error);
    }
  }
  res.status(200).send('OK'); // 确保 HTTP 200 响应
};

// 数据存储（内存模拟）
let accounts = {};
let exchangeRate = 6.8;
let fees = 0;
let operators = [];

// 基础指令
bot.help((ctx) => {
    ctx.reply(`指令列表：\n1. +100 -- 记录入款 100 CNY\n2. +100u -- 记录入款 100 USDT\n3. 下拨100 -- 记录出款 100 CNY\n4. 账单 -- 查看当前账单\n5. 汇总 -- 查看账单汇总\n6. 设置汇率6.8 -- 设置汇率为 6.8\n7. 设置费率0.5 -- 设置费率为 0.5\n8. 删除当前数据 -- 清空当前账单\n9. 添加操作员 -- 回复消息以添加操作员\n10. 删除操作员 -- 回复消息以删除操作员\n11. 全局广播<消息> -- 广播消息至所有群`);
});

// 调试日志
bot.on('message', (ctx) => {
  console.log('Received message:', ctx.message);
});

// 功能实现

// 入款功能
bot.hears(/^\+\d+(u?)$/i, (ctx) => {
    const amount = parseFloat(ctx.match[0].replace('+', '').replace('u', ''));
    const currency = ctx.match[0].includes('u') ? 'USDT' : 'CNY';
    const id = ctx.chat.id;

    if (!accounts[id]) {
        accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
    }

    accounts[id].transactions.push({ type: 'deposit', amount, currency });
    accounts[id].totalDeposit += amount;

    ctx.reply(`入款已记录：${amount} ${currency}\n当前总入款：${accounts[id].totalDeposit} ${currency}`);
});

// 出款功能
bot.hears(/^下拨\d+(u?)$/i, (ctx) => {
    const amount = parseFloat(ctx.match[0].replace('下拨', '').replace('u', ''));
    const currency = ctx.match[0].includes('u') ? 'USDT' : 'CNY';
    const id = ctx.chat.id;

    if (!accounts[id]) {
        accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
    }

    accounts[id].transactions.push({ type: 'withdrawal', amount, currency });
    accounts[id].totalWithdrawal += amount;

    ctx.reply(`出款已记录：${amount} ${currency}\n当前总出款：${accounts[id].totalWithdrawal} ${currency}`);
});

// 查看账单
bot.hears(/^账单$/i, (ctx) => {
    const id = ctx.chat.id;
    if (!accounts[id] || accounts[id].transactions.length === 0) {
        return ctx.reply('当前没有账单记录。');
    }

    const { transactions, totalDeposit, totalWithdrawal } = accounts[id];
    let details = `账单明细：\n`;
    transactions.forEach((entry, index) => {
        details += `${index + 1}. ${entry.type === 'deposit' ? '入款' : '出款'} ${entry.amount} ${entry.currency}\n`;
    });

    details += `\n-------------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\n净回款：${totalDeposit - totalWithdrawal} CNY\n`;

    ctx.reply(details);
});

// 汇总账单
bot.hears(/^汇总$/i, (ctx) => {
    const id = ctx.chat.id;
    if (!accounts[id] || accounts[id].transactions.length === 0) {
        return ctx.reply('当前没有账单记录。');
    }

    const { totalDeposit, totalWithdrawal } = accounts[id];
    ctx.reply(`\n账单汇总：\n-------------------\n总入款：${totalDeposit} CNY\n总出款：${totalWithdrawal} CNY\n净回款：${totalDeposit - totalWithdrawal} CNY`);
});

// 删除当前数据
bot.hears(/^删除当前数据$/i, (ctx) => {
    const id = ctx.chat.id;
    accounts[id] = { transactions: [], totalDeposit: 0, totalWithdrawal: 0 };
    ctx.reply('当前账单数据已清空。');
});

// 设置汇率
bot.hears(/^设置汇率(\d+(\.\d+)?)$/i, (ctx) => {
    exchangeRate = parseFloat(ctx.match[1]);
    ctx.reply(`汇率已设置为：${exchangeRate}`);
});

// 设置费率
bot.hears(/^设置费率(\d+(\.\d+)?)$/i, (ctx) => {
    fees = parseFloat(ctx.match[1]);
    ctx.reply(`费率已设置为：${fees}`);
});

// 添加操作员
bot.hears(/^添加操作员$/i, (ctx) => {
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
        return ctx.reply('请回复用户的消息以添加操作员。');
    }

    const userId = replyTo.from.id;
    if (!operators.includes(userId)) {
        operators.push(userId);
        ctx.reply(`已添加操作员：${userId}`);
    } else {
        ctx.reply('该用户已是操作员。');
    }
});

// 删除操作员
bot.hears(/^删除操作员$/i, (ctx) => {
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
        return ctx.reply('请回复用户的消息以删除操作员。');
    }

    const userId = replyTo.from.id;
    operators = operators.filter((id) => id !== userId);
    ctx.reply(`已删除操作员：${userId}`);
});

// 查询命令
bot.hears(/^查询<(.+)>$/, (ctx) => {
  const query = ctx.match[1];
  ctx.reply(`查询结果：暂时无法获取 "${query}" 的信息。`);
});

// 上课与下课
bot.command('上课', (ctx) => ctx.reply('允许群成员发言'));
bot.command('下课', (ctx) => ctx.reply('禁止群成员发言'));

// 全局广播
bot.hears(/^全局广播(.+)$/i, (ctx) => {
    if (ctx.chat.id.toString() !== process.env.OWNER_ID) {
        return ctx.reply('无权限操作。');
    }

    const message = ctx.match[1];
    ctx.reply(`广播消息：${message}`);
});

// 超时和重试机制
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
