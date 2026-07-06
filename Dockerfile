# ============================================================
# Quill Backend - Dockerfile
# Multi-stage build keeps the runtime image smaller than a
# single-stage image because build tools stay in the builder.
# ============================================================

# ---- Stage 1: Builder ----
# Node 20 Alpine gives the backend a current Node runtime on a
# small Linux base, which reduces image size and attack surface.
FROM node:20-alpine AS builder

# /app is the isolated application directory inside the image.
# Keeping all commands under one directory makes later COPY paths clear.
WORKDIR /app

# Copy dependency manifests first so Docker can cache npm install layers.
# Source-only edits then rebuild faster because dependencies do not reinstall.
COPY package*.json ./

# npm ci installs exactly what package-lock.json records.
# --legacy-peer-deps preserves this repo's Express 5 dependency resolution.
RUN npm ci --legacy-peer-deps

# Copy the backend source and configuration after dependencies are installed.
# tsconfig.json is intentionally included because npm run build needs it.
COPY . .

# Compile TypeScript into dist/.
# The production image copies only compiled JavaScript from this stage.
RUN npm run build

# ---- Stage 2: Production ----
# Start again from a clean minimal image so dev tools and TypeScript source
# are not automatically carried into the runtime container.
FROM node:20-alpine AS production

# Keep runtime files under /app for predictable paths and volume mounts.
WORKDIR /app

# Copy package manifests so the runtime stage can install production packages.
COPY package*.json ./

# Install only runtime dependencies.
# Omitting devDependencies removes TypeScript, ts-node, test tools, and nodemon.
RUN npm ci --omit=dev --legacy-peer-deps

# Copy only compiled JavaScript from the builder stage.
# This avoids shipping the TypeScript source tree in the production image.
COPY --from=builder /app/dist ./dist

# Create directories that are mounted by docker-compose.
# Ownership is assigned before switching users so the app can write logs/uploads.
RUN mkdir -p certs logs uploads \
  && addgroup -S quill \
  && adduser -S quill -G quill \
  && chown -R quill:quill /app

# Run as a non-root user so an application compromise has less container-level power.
USER quill

# Document the backend HTTPS port.
# docker-compose publishes this port to the host machine.
EXPOSE 5000

# Start the compiled backend entrypoint.
# The repo builds src/index.ts to dist/index.js, so this must match the actual app.
CMD ["node", "dist/index.js"]
