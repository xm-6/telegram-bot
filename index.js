const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 数据存储
let accounts = {};
let exchangeRate = 6.8;
let fees = 0;
let operators = [];

// 基础命令
bot.start((ctx) => ctx.reply('欢迎使用定制机器人！输入 /help 查看指令。'));

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
      await bot.handleUpdate(req.body); // 使用 Webhook 处理更新
    } catch (error) {
      console.error('Error handling update:', error);
    }
  }
  res.status(200).send('OK'); // 确保响应成功
};

// 入款和出款
bot.hears(/^\+(\d+)(u?)$/, (ctx) => {
  const amount = parseFloat(ctx.match[1]);
  const isUSDT = ctx.match[2] === 'u';
  const type = isUSDT ? 'USDT' : 'CNY';
  const id = ctx.chat.id;

  if (!accounts[id]) accounts[id] = [];
  accounts[id].push({ type: 'deposit', amount, currency: type });
  ctx.reply(`入款成功：${amount} ${type}`);
});

bot.hears(/^下拨(\d+)(u?)$/, (ctx) => {
  const amount = parseFloat(ctx.match[1]);
  const isUSDT = ctx.match[2] === 'u';
  const type = isUSDT ? 'USDT' : 'CNY';
  const id = ctx.chat.id;

  if (!accounts[id]) accounts[id] = [];
  accounts[id].push({ type: 'withdrawal', amount, currency: type });
  ctx.reply(`出款成功：${amount} ${type}`);
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

// 设置汇率和费率
bot.hears(/^设置汇率(\d+(\.\d+)?)$/, (ctx) => {
  exchangeRate = parseFloat(ctx.match[1]);
  ctx.reply(`汇率已设置为：${exchangeRate}`);
});

bot.hears(/^设置费率(\d+(\.\d+)?)$/, (ctx) => {
  fees = parseFloat(ctx.match[1]);
  ctx.reply(`费率已设置为：${fees}`);
});

// 查询操作
bot.hears(/^查询<(.+)>$/, (ctx) => {
  const query = ctx.match[1];
  ctx.reply(`查询结果：${query} 暂无数据。`);
});

// 广播
bot.hears(/^全局广播(.+)$/, (ctx) => {
  if (ctx.chat.id !== process.env.OWNER_ID) {
    return ctx.reply('无权限操作。');
  }
  const message = ctx.match[1];
  ctx.reply(`已广播消息：${message}`);
});

// 操作员管理
bot.command('添加操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;
  if (!replyTo) return ctx.reply('请回复用户消息以添加操作员。');
  const userId = replyTo.from.id;
  if (!operators.includes(userId)) operators.push(userId);
  ctx.reply('操作员已添加。');
});

bot.command('删除操作员', (ctx) => {
  const replyTo = ctx.message.reply_to_message;
  if (!replyTo) return ctx.reply('请回复用户消息以删除操作员。');
  const userId = replyTo.from.id;
  operators = operators.filter((id) => id !== userId);
  ctx.reply('操作员已删除。');
});

bot.launch();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
