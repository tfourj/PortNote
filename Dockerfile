# Builder Stage
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Copy package files and prisma schema
COPY package.json package-lock.json* ./
COPY ./prisma ./prisma

# Install dependencies
RUN npm install

# Copy application files and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Production Stage
FROM --platform=$TARGETPLATFORM node:20-alpine AS production

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js* ./

# Explicitly copy Prisma Engine binaries
COPY --from=builder /app/node_modules/.prisma/client/*.node ./node_modules/.prisma/client/

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3000

CMD ["sh", "-c", "\
  npx prisma migrate deploy && \
  npm start"]
