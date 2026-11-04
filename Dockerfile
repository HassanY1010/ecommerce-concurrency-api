# ==========================================
# Multi-stage Dockerfile for Production
# ==========================================

# Stage 1: Build & compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

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
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production && npm cache clean --force

# Copy compiled artifacts from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Create non-root user for security best practices
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
