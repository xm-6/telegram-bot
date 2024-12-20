const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储（简单实现）
let accounts = {};
let exchangeRate = 6.8;
let fees = 0;
let operators = [];

// 自定义 Telegram API 调用函数，增加超时和重试机制
async function callTelegramApi(method, data, maxRetries = 3, timeout = 10000) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal, // 超时信号
      });

      clearTimeout(id); // 请求成功后清理超时
      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }

      return await response.json(); // 返回解析后的响应
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed:`, error.message);
      if (attempts >= maxRetries) {
        throw new Error('Max retries reached, aborting.');
      }
    }
  }
}

// 基础功能
bot.start((ctx) => ctx.reply('欢迎使用后果定制机器人！输入 /help 查看指令。'));
bot.help((ctx) => ctx.reply(
  `操作帮助：\n` +
  `+1000 -- 入款1000\n` +
  `+1000u -- 入款1000 USDT\n` +
  `下拨1000 -- 出款1000\n` +
  `下拨1000u -- 出款1000 USDT\n` +
  `账单 -- 查看账单\n` +
  `删除当前数据 -- 清空当前账单\n` +
  `设置汇率6.8 -- 设置美元汇率\n` +
  `设置费率0 -- 设置费率\n` +
  `okx -- 获取实时欧易汇率\n` +
  `上课 -- 允许群成员发言\n` +
  `下课 -- 禁止群成员发言\n` +
  `添加操作员 -- 回复用户消息以添加操作员\n` +
  `删除操作员 -- 回复用户消息以删除操作员\n` +
  `查询<地址> -- 查询 TRX 地址信息\n` +
  `查询<手机号> -- 查询手机号信息\n` +
  `查询<银行卡号> -- 查询银行卡信息\n` +
  `全局广播<消息> -- 广播消息至所有群（仅所有者有权限）。`
));


// 包装为 Vercel 函数
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body); // 使用 handleUpdate 处理 Webhook 推送
    } catch (error) {
      console.error('Error handling update:', error);
    }
  }
  res.status(200).send('OK'); // 返回 200 表示成功处理
};


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

  let summary = '账单：\n';
  accounts[id].forEach((entry, index) => {
    summary += `${index + 1}. ${entry.type === 'deposit' ? '入款' : '出款'} ${entry.amount} ${entry.currency}\n`;
  });

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

// 操作员列表
let operators = [];

// 添加操作员
bot.command('添加操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;
  
  // 检查是否回复了一条消息
  if (!replyTo) return ctx.reply('请回复用户的消息以添加操作员。');

  const userId = replyTo.from.id;
  const userName = replyTo.from.username || replyTo.from.first_name;

  // 检查操作员是否已存在
  if (operators.includes(userId)) {
    return ctx.reply(`用户 @${userName || '无名用户'} 已是操作员。`);
  }

  // 添加到操作员列表
  operators.push(userId);
  ctx.reply(`已添加操作员：@${userName || '无名用户'}`);
});

// 删除操作员
bot.command('删除操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;

  // 检查是否回复了一条消息
  if (!replyTo) return ctx.reply('请回复用户的消息以删除操作员。');

  const userId = replyTo.from.id;
  const userName = replyTo.from.username || replyTo.from.first_name;

  // 检查操作员是否存在
  if (!operators.includes(userId)) {
    return ctx.reply(`用户 @${userName || '无名用户'} 不是操作员，无需删除。`);
  }

  // 从操作员列表中移除
  operators = operators.filter((id) => id !== userId);
  ctx.reply(`已删除操作员：@${userName || '无名用户'}`);
});

bot.command('操作员列表', (ctx) => {
  if (operators.length === 0) {
    return ctx.reply('当前没有操作员。');
  }

  const operatorList = operators.map((id) => `ID: ${id}`).join('\n');
  ctx.reply(`当前操作员列表：\n${operatorList}`);
});
