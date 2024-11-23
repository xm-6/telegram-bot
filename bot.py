import openai
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters
import os
import logging
import time

# 从环境变量读取 API 密钥
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # OpenAI API 密钥
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")  # Telegram Bot Token

# 设置 OpenAI API 密钥
openai.api_key = OPENAI_API_KEY

# 用户会话上下文存储（以用户 ID 为键，附带最后活跃时间）
user_sessions = {}

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 与 ChatGPT 通信的函数
def chat_with_gpt(user_id, prompt):
    # 当前时间
    current_time = time.time()

    # 初始化用户上下文
    if user_id not in user_sessions:
        user_sessions[user_id] = {"messages": [], "last_active": current_time}

    # 更新用户的最后活跃时间
    user_sessions[user_id]["last_active"] = current_time

    # 添加用户消息
    user_sessions[user_id]["messages"].append({"role": "user", "content": prompt})

    # 限制上下文长度
    if len(user_sessions[user_id]["messages"]) > 20:  # 限制最近 20 条记录
        user_sessions[user_id]["messages"].pop(0)

    try:
        # 调用 OpenAI API
        response = openai.ChatCompletion.create(
            model="gpt-4-0613",  # 使用 gpt-4-0613 模型
            messages=user_sessions[user_id]["messages"],
            temperature=0.7
        )
        reply = response['choices'][0]['message']['content'].strip()

        # 将 AI 的回复添加到上下文
        user_sessions[user_id]["messages"].append({"role": "assistant", "content": reply})

        # 记录日志
        logging.info(f"User {user_id}: {prompt}")
        logging.info(f"GPT-4-Turbo Response: {reply}")

        return reply
    except openai.error.OpenAIError as e:
        logging.error(f"OpenAI Error for user {user_id}: {e}")
        return "服务器开小差了，请稍后再试。"
    except Exception as e:
        logging.error(f"Unexpected Error for user {user_id}: {e}")
        return "发生了一个意外错误，请稍后重试。"

# 清理不活跃的用户会话
def cleanup_sessions(inactive_duration=3600):
    current_time = time.time()
    inactive_users = [user_id for user_id, data in user_sessions.items()
                      if current_time - data["last_active"] > inactive_duration]

    for user_id in inactive_users:
        del user_sessions[user_id]
        logging.info(f"Removed inactive session for user {user_id}")

# 清除用户会话命令
def clear_session(update, context):
    user_id = update.message.chat_id
    if user_id in user_sessions:
        del user_sessions[user_id]  # 删除该用户的会话上下文
        update.message.reply_text("您的对话上下文已清除。")
    else:
        update.message.reply_text("当前没有对话上下文需要清除。")

# 处理 /start 命令
def start(update, context):
    update.message.reply_text("你好！我是一个 ChatGPT 4 Turbo 驱动的机器人，我会记住你的上下文对话。如果需要清除上下文，请输入 /clear。")

# 处理用户的消息
def handle_message(update, context):
    user_message = update.message.text
    user_id = update.message.chat_id

    # 告诉用户消息正在处理中
    update.message.reply_text("正在思考中，请稍候...")

    # 获取 GPT 的响应
    gpt_response = chat_with_gpt(user_id, user_message)
    update.message.reply_text(gpt_response)

# 主函数
def main():
    # 创建 Telegram Updater
    updater = Updater(TELEGRAM_BOT_TOKEN, use_context=True)
    dp = updater.dispatcher

    # 添加命令处理器
    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CommandHandler("clear", clear_session))  # 清除上下文命令

    # 添加普通消息处理器
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    # 启动 Bot
    updater.start_polling()
    logging.info("Bot is running...")
    updater.idle()

if __name__ == '__main__':
    main()
