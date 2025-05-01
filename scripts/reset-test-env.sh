#!/bin/bash
set -e

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.test.yml"

echo "Stopping and removing old test containers/network..."
docker-compose -f "$COMPOSE_FILE" down

echo "Building and starting new test containers in detached mode..."
docker-compose -f "$COMPOSE_FILE" up -d --build

echo "Test environment reset complete." 