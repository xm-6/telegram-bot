const { Telegraf } = require('telegraf');
require('dotenv').config();
const { json } = require('micro');

// 初始化 Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储（内存模拟）
let accounts = {};
let exchangeRate = 6.8;
let fees = 0;
let operators = [];

// 基础指令
bot.start((ctx) => ctx.reply('欢迎使用账单机器人！输入 /help 查看指令。'));
bot.help((ctx) => ctx.reply(
  `指令列表：\n` +
  `+100 -- 记录入款 100 CNY\n` +
  `+100u -- 记录入款 100 USDT\n` +
  `下拨100 -- 记录出款 100 CNY\n` +
  `账单 -- 查看当前账单\n` +
  `汇总 -- 查看账单汇总\n` +
  `设置汇率6.8 -- 设置汇率为 6.8\n` +
  `设置费率0.5 -- 设置费率为 0.5\n` +
  `删除当前数据 -- 清空当前账单\n` +
  `添加操作员 -- 回复消息以添加操作员\n` +
  `删除操作员 -- 回复消息以删除操作员\n` +
  `全局广播<消息> -- 广播消息至所有群\n`
));

// 调试日志
bot.on('message', (ctx) => {
  console.log('Received message:', ctx.message);
});

// 功能实现

// 入款功能
bot.hears(/^\+(\d+)(u?)$/, (ctx) => {
  const amount = parseFloat(ctx.match[1]);
  const currency = ctx.match[2] === 'u' ? 'USDT' : 'CNY';
  const id = ctx.chat.id;

  if (!accounts[id]) accounts[id] = [];
  accounts[id].push({ type: 'deposit', amount, currency });

  ctx.reply(`已记录入款：${amount} ${currency}`);
});

// 出款功能
bot.hears(/^下拨(\d+)(u?)$/, (ctx) => {
  const amount = parseFloat(ctx.match[1]);
  const currency = ctx.match[2] === 'u' ? 'USDT' : 'CNY';
  const id = ctx.chat.id;

  if (!accounts[id]) accounts[id] = [];
  accounts[id].push({ type: 'withdrawal', amount, currency });

  ctx.reply(`已记录出款：${amount} ${currency}`);
});

// 查看账单
bot.command('账单', (ctx) => {
  const id = ctx.chat.id;

  if (!accounts[id] || accounts[id].length === 0) {
    return ctx.reply('账单为空。');
  }

  let summary = `账单编号：${String(id).padStart(4, '0')}\n`;
  accounts[id].forEach((entry, index) => {
    summary += `${index + 1}. ${entry.type === 'deposit' ? '入款' : '出款'} ${entry.amount} ${entry.currency}\n`;
  });

  ctx.reply(summary);
});

// 汇总账单
bot.command('汇总', (ctx) => {
  const id = ctx.chat.id;

  if (!accounts[id] || accounts[id].length === 0) {
    return ctx.reply('账单为空。');
  }

  let totalDeposit = 0;
  let totalWithdrawal = 0;

  accounts[id].forEach((entry) => {
    if (entry.type === 'deposit') totalDeposit += entry.amount;
    if (entry.type === 'withdrawal') totalWithdrawal += entry.amount;
  });

  const summary = `
账单汇总：
-------------------
入款总计：${totalDeposit} CNY
出款总计：${totalWithdrawal} CNY
未回款：${totalDeposit - totalWithdrawal} CNY
`;

  ctx.reply(summary);
});

// 删除当前数据
bot.command('删除当前数据', (ctx) => {
  const id = ctx.chat.id;
  accounts[id] = [];
  ctx.reply('已清空当前账单。');
});

// 设置汇率
bot.hears(/^设置汇率(\d+(\.\d+)?)$/, (ctx) => {
  exchangeRate = parseFloat(ctx.match[1]);
  ctx.reply(`汇率已设置为：${exchangeRate}`);
});

// 设置费率
bot.hears(/^设置费率(\d+(\.\d+)?)$/, (ctx) => {
  fees = parseFloat(ctx.match[1]);
  ctx.reply(`费率已设置为：${fees}`);
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
bot.hears(/^全局广播(.+)$/, (ctx) => {
  if (ctx.chat.id.toString() !== process.env.OWNER_ID) {
    return ctx.reply('无权限操作。');
  }
  const message = ctx.match[1];
  ctx.reply(`广播消息：${message}`);
});

// 添加操作员
bot.command('添加操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;

  if (!replyTo) return ctx.reply('请回复用户的消息以添加操作员。');

  const userId = replyTo.from.id;
  if (!operators.includes(userId)) {
    operators.push(userId);
    ctx.reply(`已添加操作员：${userId}`);
  } else {
    ctx.reply('该用户已是操作员。');
  }
});

// 删除操作员
bot.command('删除操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;

  if (!replyTo) return ctx.reply('请回复用户的消息以删除操作员。');

  const userId = replyTo.from.id;
  operators = operators.filter((id) => id !== userId);
  ctx.reply(`已删除操作员：${userId}`);
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

// 测试命令
bot.command('测试', async (ctx) => {
  try {
    const response = await callTelegramApiWithRetries('sendMessage', {
      chat_id: ctx.chat.id,
      text: '测试消息',
    });
    console.log('Message sent:', response);
  } catch (error) {
    console.error('Failed to send message:', error.message);
    ctx.reply('发送失败，请稍后重试。');
  }
});

// Webhook 处理逻辑
const { json } = require('micro'); // 安装 micro: npm install micro

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const body = await json(req); // 解析请求体
      await bot.handleUpdate(body); // 处理 Telegram 更新
    } catch (error) {
      console.error('Error handling update:', error);
    }
  }
  res.status(200).send('OK'); // 返回 HTTP 200 响应
};
