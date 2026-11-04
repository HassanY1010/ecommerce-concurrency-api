# ==========================================
# Multi-stage Dockerfile for Production
# ==========================================

# Stage 1: Build & compile TypeScript
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install openssl for Prisma engines
RUN apt-get update -y && apt-get install -y openssl ca-certificates

# Install build dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build configs
COPY tsconfig*.json ./
COPY src ./src/

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-slim AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install openssl and ca-certificates in runtime container
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install only production dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production && npm cache clean --force

# Copy compiled artifacts and generated Prisma engines from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Standard non-root node user in Debian
USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
