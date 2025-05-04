#!/bin/bash
set -e

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

# Check if a test file argument is provided
if [ -z "$1" ]; then
    echo "Error: Please provide the path to the test file as an argument." >&2
    exit 1
fi
TEST_FILE=$1

# Default recording name, can be overridden by env var if needed
RECORDING_NAME=${AIDER_RECORDING_NAME:-"markdown-rendering-test"}

# Ensure the test environment is up
echo "Ensuring test environment is up..."
npm run test:env:up > /dev/null

# Read the private key, encode it
SSH_KEY_PATH="tests/fixtures/ssh/id_test"
if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "Error: SSH private key not found at $SSH_KEY_PATH" >&2
    exit 1
fi
SSH_PRIVATE_KEY_B64=$(base64 < "$SSH_KEY_PATH" | tr -d '\n')

# Define REPO_URL
REPO_URL="ssh://git@git-server/home/git/repo.git"

# Execute the single test inside the test-runner container
echo "Running single test file: $TEST_FILE in record mode..."
docker compose -f docker-compose.test.yml exec \
    -e NODE_ENV="test" \
    -e ECHOPROXIA_MODE="record" \
    -e AIDER_RECORDING_NAME="$RECORDING_NAME" \
    -e SSH_PRIVATE_KEY_B64="$SSH_PRIVATE_KEY_B64" \
    -e REPO_URL="$REPO_URL" \
    -e DEBUG="vibemob:core*,vibemob:test:markdown" \
    -e PWD=/app \
    -w /app \
    test-runner npx ava --serial "$TEST_FILE" --timeout 120000

echo "Test run finished." 