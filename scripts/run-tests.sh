#!/bin/bash
set -e

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

# Ensure the test environment is built (if needed) and up
echo "Ensuring test environment is up (building if necessary)..."
npm run test:env:up > /dev/null   # Suppress verbose output

# Read the private key, encode it
SSH_KEY_PATH="tests/fixtures/ssh/id_test"
if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "Error: SSH private key not found at $SSH_KEY_PATH" >&2
    exit 1
fi
SSH_PRIVATE_KEY_B64=$(base64 < "$SSH_KEY_PATH" | tr -d '\n')

# Execute the tests inside the test-runner container, passing the key
# Also pass the REPO_URL for consistency
REPO_URL="ssh://git@git-server/home/git/repo.git"

echo "Running tests inside container..."
docker compose -f docker-compose.test.yml exec \
    -e SSH_PRIVATE_KEY_B64="$SSH_PRIVATE_KEY_B64" \
    -e REPO_URL="$REPO_URL" \
    -e DEBUG="vibemob:core*,echoproxia:*" \
    -e PWD=/app \
    -w /app \
    test-runner npm run test:container "$@"

# Optional: Bring down the environment after tests
# echo "Stopping test environment containers..."
# npm run test:env:down > /dev/null 