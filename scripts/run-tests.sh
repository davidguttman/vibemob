#!/bin/bash
set -e

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

# Execute the tests inside the test-runner container
docker-compose -f docker-compose.test.yml exec test-runner npm run test:container "$@" 