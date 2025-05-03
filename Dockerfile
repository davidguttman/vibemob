# Dockerfile - Production Build

# Use a specific Node.js LTS version
FROM node:22-slim AS base

# Install essential OS dependencies: git and ssh client
# Use --no-install-recommends to minimize image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies using package-lock.json for reproducibility
FROM base AS dependencies
WORKDIR /app

COPY package.json package-lock.json* ./
# Use npm ci for clean installs based on lockfile, install only production dependencies
RUN npm ci --omit=dev

# Build the production image
FROM base AS production
WORKDIR /app

# Copy installed dependencies from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
# Copy application code
COPY package.json .
COPY lib ./lib
COPY app.js .

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Change ownership of the app directory to the non-root user
# Note: Adjust ownership as needed if writing to other directories (e.g., /tmp for ssh key)
RUN chown -R nodejs:nodejs /app

# Switch to the non-root user
USER nodejs

# Set the default command to run the application
# Assumes lib/discord-adapter.js is the entry point
CMD ["node", "app.js"] 