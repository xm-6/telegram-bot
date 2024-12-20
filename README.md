运行 -- cmd

清除Webhook设置

curl -F "url=" https://api.telegram.org/bot1234567890:AAERamDo8a3DziM8P8vwUu-aBKAVh2VMoBU/deleteWebhook

重设Webhook

curl -F "url=https://telegram-bot-teal-six.vercel.app" https://api.telegram.org/bot1234567890:AAERamDo8a3DziM8P8vwUu-aBKAVh2VMoBU/setWebhook

浏览器查看
https://api.telegram.org/bot1234567890:AAERamDo8a3DziM8P8vwUu-aBKAVh2VMoBU/getWebhookInfo

浏览器设置
https://api.telegram.org/bot1234567890:AAERamDo8a3DziM8P8vwUu-aBKAVh2VMoBU/setWebhook?url=https://telegram-bot-teal-six.vercel.app


清除  重设  很重要

.env 

BOT_TOKEN：电报机器人api
OWNER_ID：创建机器人账号用户【ID】

可不上传 部署时设置  部署平台 vercel
