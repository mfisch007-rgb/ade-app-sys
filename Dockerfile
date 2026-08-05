# Multi-stage production build container
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

USER node
CMD ["node", "run-runtime-verification.js"]