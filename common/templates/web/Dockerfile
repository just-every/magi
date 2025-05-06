FROM node:22-alpine AS builder

WORKDIR /tmp
COPY . .
RUN ls -la && npm ci --quiet && npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --production --silent && mv node_modules ../
COPY . .
COPY --from=builder /tmp/dist ./dist
COPY --from=builder /tmp/public ./public
EXPOSE 3000
RUN chown -R node /app
USER node
CMD ["node", "./dist/server.js"]
