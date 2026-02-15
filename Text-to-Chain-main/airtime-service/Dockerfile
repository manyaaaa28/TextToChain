FROM node:18-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --build-from-source

COPY . .

EXPOSE 8082

CMD ["npx", "ts-node", "src/index.ts"]
