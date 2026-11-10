# Myna API — production image.  docker build -t myna-api .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
# Install only the API and the shared package (not the mobile app's dependencies).
RUN npm ci --omit=dev -w @myna/server -w @myna/shared --include-workspace-root=false

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/apps/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/ready || exit 1
# Migrations run automatically at startup.
CMD ["node", "--import", "tsx", "src/index.ts"]
