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
# The second command bundles the seed, which is the only way to create the
# first login. The runtime image has neither tsx to run the .ts nor bcryptjs in
# node_modules — Next bundles that into its own server chunks, where a
# standalone script cannot reach it — so the seed is inlined here into one file
# that needs nothing but the Prisma client the image already carries. It ships
# with prisma/ below, and runs in a deployed container as:
#   node prisma/seed.cjs
# CJS rather than ESM: bcryptjs is CommonJS, and the ESM interop wrapper breaks
# its salt handling, which fails at the first password hash.
RUN npx prisma generate && npx next build && node_modules/.bin/esbuild prisma/seed.ts --bundle --platform=node --format=cjs --target=node22 --external:@prisma/client --outfile=prisma/seed.cjs

# The Prisma CLI, installed with its own dependency tree.
#
# Copying node_modules/prisma out of the builder is not enough: the CLI loads
# @prisma/config, which loads `effect`, which loads more again — 25 packages in
# all. Picking directories out by hand gets one more "Cannot find module" per
# attempt. Installing it here lets npm resolve the tree properly, and keeps the
# runtime image clear of the 1.1GB of build tooling a full node_modules carries.
# The version follows package.json so the CLI cannot drift from the client.
# The file is copied under another name on purpose: with a package.json beside
# it, npm installs that whole project — 541 packages — instead of the one asked
# for. Without it, this stage is 35 packages and 133MB.
FROM node:22-alpine AS prismacli
WORKDIR /cli
COPY package.json ./version-source.json
RUN npm install --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('./version-source.json').devDependencies.prisma")" \
 && rm version-source.json

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

# Migrations and the seed run from the container, so the CLI and schema come
# too. The CLI and its dependencies arrive first; the generated client and
# engines follow, so the build's own artefacts win on anything that overlaps.
COPY --from=builder /app/prisma ./prisma
COPY --from=prismacli /cli/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Where the local storage driver writes. Mount a volume here, or use S3.
RUN mkdir -p /app/uploads && chown app:app /app/uploads
VOLUME /app/uploads

USER app
EXPOSE 3000

# Apply any pending migrations before serving, so a deploy is one step.
#
# Prisma is invoked through its entry point rather than `npx prisma`, because
# only the package directories are copied above and not node_modules/.bin, so
# the shim npx looks for does not exist here. `npx prisma` therefore died with
# "sh: prisma: not found" the moment the container started — after a build that
# had succeeded, which made it look like an application fault rather than a
# missing file.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
