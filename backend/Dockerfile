FROM node:20-alpine
ENV TZ=Asia/Shanghai
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p uploads backups

EXPOSE 3000
CMD ["node", "src/index.js"]
