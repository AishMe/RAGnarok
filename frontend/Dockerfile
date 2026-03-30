# Stage 1: install ALL dependencies (dev included — needed for build tools like lightningcss)
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Do NOT use --only=production here.
# lightningcss and tailwind ship platform-specific native binaries as
# optionalDependencies. npm ci resolves the correct Linux binary at install
# time; --only=production skips them, causing "Cannot find module" at build.
RUN npm ci

# Stage 2: build
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Stage 3: production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]