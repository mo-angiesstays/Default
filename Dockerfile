# TurnKeep — production image.
#
# ffmpeg is installed in the runtime stage because video walkthrough analysis
# shells out to it. Everything else works without it, and the app degrades with
# a clear message rather than crashing if it's missing.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next needs these present at build time; the real values are injected at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl \
 && addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

# Migrations and the seed run from the container, so the CLI and schema come too.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Where the local storage driver writes. Mount a volume here, or use S3.
RUN mkdir -p /app/uploads && chown app:app /app/uploads
VOLUME /app/uploads

USER app
EXPOSE 3000

# Apply any pending migrations before serving, so a deploy is one step.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
