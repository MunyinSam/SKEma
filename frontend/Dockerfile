FROM node:26-alpine AS builder
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY . .
RUN npm ci && npm run build

FROM node:26-alpine AS production
WORKDIR /app
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]