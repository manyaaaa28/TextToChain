FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8083

CMD ["npx", "tsx", "src/api-server.ts"]
