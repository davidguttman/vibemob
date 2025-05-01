# Dockerfile.aider-test
FROM node:22

# Install Git (likely needed by aider-js)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /test-app

# Install dependencies directly for isolation
RUN npm install @dguttman/aider-js@latest echoproxia@latest --save-dev --no-package-lock --omit=optional

# Copy the test script (relative to build context, which will be project root)
# COPY docs/aider-js-test/test-script.cjs .
COPY docs/aider-js-test/test-script.cjs .


# Command to run the test script
CMD ["node", "test-script.cjs"] 