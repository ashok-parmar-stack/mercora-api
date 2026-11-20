# Multi-stage production build for NestJS Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configs
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/

# Install dependencies and build
RUN npm install
RUN npm --workspace=packages/theme-config run build || true
RUN npm --workspace=packages/shared-types run build || true
RUN npm --workspace=apps/backend run build

# Production runner image
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json* ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000

CMD ["node", "apps/backend/dist/main.js"]
