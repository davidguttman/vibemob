# Dockerfile - Production Build

# Use a specific Node.js LTS version
FROM node:22-slim AS base

# Install essential OS dependencies: git, ssh client, python3, python3-venv
# Use --no-install-recommends to minimize image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies using package-lock.json for reproducibility
FROM base AS dependencies
WORKDIR /app

# Create user/group first (needed for chown)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
# Ensure files created by npm ci have the correct ownership *before* copying
RUN chown -R nodejs:nodejs /app

# Build the production image
FROM base AS production
WORKDIR /app

# Create the user/group again in the final stage
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy installed dependencies from the 'dependencies' stage (should now have correct owner)
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
# Copy application code
COPY package.json .
COPY lib ./lib
COPY app.js .

# Explicitly chown the rest of the app files (redundant but safe)
RUN chown -R nodejs:nodejs /app

# Switch to the non-root user
USER nodejs

# Set the default command to run the application
CMD ["node", "app.js"] 