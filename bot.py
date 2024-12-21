import logging
import datetime
import pytz
from pymongo import MongoClient
from telegram import Update, ParseMode
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext
from decouple import config

# 获取 Telegram Bot API 令牌和 MongoDB URI
TOKEN = config('TELEGRAM_TOKEN')
MONGO_URI = config('MONGO_URI')
RESTRICTED_MODE = config('RESTRICTED_MODE', default='1')  # 默认为1，表示不限制

# 设置仅允许使用机器人的用户ID（例如，您的用户ID）
ALLOWED_USER_ID = 123456789  # 替换为您的实际用户ID

# 初始化日志记录器
logging.basicConfig(format='%(asctime)s - %(name)s - %(levellevel)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# 初始化 MongoDB 客户端
client = MongoClient(MONGO_URI)
db = client['accounting']
collection = db['records']

# 默认汇率和币种
default_exchange_rate = 1.0
default_currency = 'CNY'
user_settings = {}

# 检查用户是否被允许使用机器人
def is_user_allowed(user_id):
    if RESTRICTED_MODE == '0':
        return user_id == ALLOWED_USER_ID
    return True

# 处理 /start 命令
def start(update: Update, context: CallbackContext) -> None:
    update.message.reply_text('欢迎使用记账机器人！您可以使用以下指令：\n'
                              '+<金额> 记录入款\n'
                              '-<金额> 记录出款\n'
                              '账单 查看当前账单\n'
                              '删除 <时间> 删除指定时间的记录\n'
                              '汇率 <汇率> 设置 USDT 汇率\n'
                              '币种 <币种> 设置币种\n'
                              '时区 <时区> 设置时区\n'
                              '清除 清除当前账单记录\n'
                              '<表达式> 计算数学表达式')

# 处理入款
def add_record(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    chat_id = update.message.chat_id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        amount = float(context.args[0])
    except (IndexError, ValueError):
        update.message.reply_text('请提供一个有效的金额。')
        return
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    currency = user_settings.get(user_id, {}).get('currency', default_currency)
    exchange_rate = user_settings.get(user_id, {}).get('exchange_rate', default_exchange_rate)

    record = {
        "user_id": user_id,
        "chat_id": chat_id,
        "record_type": "+",
        "amount": amount,
        "currency": currency,
        "exchange_rate": exchange_rate,
        "timestamp": timestamp
    }
    collection.insert_one(record)
    update.message.reply_text(f'记录入款：{amount} {currency} (汇率：{exchange_rate})')

# 处理出款
def subtract_record(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    chat_id = update.message.chat_id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        amount = float(context.args[0])
    except (IndexError, ValueError):
        update.message.reply_text('请提供一个有效的金额。')
        return
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    currency = user_settings.get(user_id, {}).get('currency', default_currency)
    exchange_rate = user_settings.get(user_id, {}).get('exchange_rate', default_exchange_rate)

    record = {
        "user_id": user_id,
        "chat_id": chat_id,
        "record_type": "-",
        "amount": amount,
        "currency": currency,
        "exchange_rate": exchange_rate,
        "timestamp": timestamp
    }
    collection.insert_one(record)
    update.message.reply_text(f'记录出款：{amount} {currency} (汇率：{exchange_rate})')

# 查看账单
def view_records(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    chat_id = update.message.chat_id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    records = collection.find({"user_id": user_id, "chat_id": chat_id})
    response = '账单：\n'
    for record in records:
        response += f"{record['timestamp']} - {record['amount']} {record['currency']} (汇率：{record['exchange_rate']})\n"
    update.message.reply_text(response)

# 删除记录
def delete_record(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    chat_id = update.message.chat_id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        timestamp = context.args[0]
    except IndexError:
        update.message.reply_text('请提供一个有效的时间戳。')
        return
    collection.delete_one({"user_id": user_id, "chat_id": chat_id, "timestamp": timestamp})
    update.message.reply_text(f'已删除记录：{timestamp}')

# 设置汇率
def set_exchange_rate(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        exchange_rate = float(context.args[0])
    except (IndexError, ValueError):
        update.message.reply_text('请提供一个有效的汇率。')
        return
    if user_id not in user_settings:
        user_settings[user_id] = {}
    user_settings[user_id]['exchange_rate'] = exchange_rate
    update.message.reply_text(f'已设置汇率：{exchange_rate}')

# 设置币种
def set_currency(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        currency = context.args[0]
    except IndexError:
        update.message.reply_text('请提供一个有效的币种。')
        return
    if user_id not in user_settings:
        user_settings[user_id] = {}
    user_settings[user_id]['currency'] = currency
    update.message.reply_text(f'已设置币种：{currency}')

# 设置时区
def set_timezone(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    try:
        timezone = context.args[0]
    except IndexError:
        update.message.reply_text('请提供一个有效的时区。')
        return
    if user_id not in user_settings:
        user_settings[user_id] = {}
    user_settings[user_id]['timezone'] = timezone
    update.message.reply_text(f'已设置时区：{timezone}')

# 清除账单
def clear_records(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    chat_id = update.message.chat_id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    collection.delete_many({"user_id": user_id, "chat_id": chat_id})
    update.message.reply_text(f'已清除账单记录')

# 输入数学表达式计算结果
def calculate_expression(update: Update, context: CallbackContext) -> None:
    user_id = update.message.from_user.id
    if not is_user_allowed(user_id):
        update.message.reply_text('您没有权限使用此机器人。')
        return
    expression = ' '.join(context.args)
    try:
        result = eval(expression)
        update.message.reply_text(f'计算结果：{result}')
    except Exception as e:
        update.message.reply_text(f'计算错误：{e}')

# 处理消息
def handle_message(update: Update, context: CallbackContext) -> None:
    text = update.message.text.strip()
    if text.startswith('+'):
        amount = text[1:].strip()
        context.args = [amount]
        add_record(update, context)
    elif text.startswith('-'):
        amount = text[1:].strip()
        context.args = [amount]
        subtract_record(update, context)
    elif text == '账单':
        view_records(update, context)
    elif text.startswith('删除 '):
        timestamp = text.split(' ', 1)[1].strip()
        context.args = [timestamp]
        delete_record(update, context)
    elif text.startswith('汇率 '):
        exchange_rate = text.split(' ', 1)[1].strip()
        context.args = [exchange_rate]
        set_exchange_rate(update, context)
    elif text.startswith('币种 '):
        currency = text.split(' ', 1)[1].strip()
        context.args = [currency]
        set_currency(update, context)
    elif text.startswith('时区 '):
        timezone = text.split(' ', 1)[1].strip()
        context.args = [timezone]
        set_timezone(update, context)
    elif text == '清除':
        clear_records(update, context)
    else:
        context.args = text.split()
        calculate_expression(update, context)

# 主函数
def main() -> None:
    updater = Updater(TOKEN)
    dispatcher = updater.dispatcher

    dispatcher.add_handler(CommandHandler('start', start))
    dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main()
