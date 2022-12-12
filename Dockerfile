FROM node:lts-alpine

WORKDIR /app
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Dependencies
COPY package*.json ./
RUN npm ci

# Bundle
COPY . .
EXPOSE 3000
CMD ["node", "src/app.js"]
