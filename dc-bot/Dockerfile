# 使用 Node 18
FROM node:18-slim

# 安裝 git 和 fontconfig
RUN apt-get update && apt-get install -y git fontconfig && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# 設定 GitHub Token（硬編碼版）
ENV GITHUB_TOKEN=

# 先 clone XX 分支
RUN git clone -b main https://$GITHUB_TOKEN@github.com/網址 .

# 安裝依賴
RUN npm install --production

# 啟動 bot
CMD ["node", "index.js"]