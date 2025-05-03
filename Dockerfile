# Dockerfile - Production (Mimicking Test Setup)

# Use a specific Node.js LTS version
FROM node:22

# Install essential OS dependencies: git, ssh client, tree
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    tree \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
# Run full install like Dockerfile.test (includes devDeps)
RUN npm install 

# Copy the rest of the application code needed to run
# Assuming ./lib and ./app.js are sufficient
COPY lib ./lib
COPY app.js .

# No user change - run as root like Dockerfile.test

# Set the default command to run the application
CMD ["node", "app.js"]