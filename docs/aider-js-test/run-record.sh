#!/bin/bash

echo "Running aider-js test in RECORD mode..."

# Get the directory of the script itself
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Go one level up to the project root relative to the script
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"

# Check if OPENROUTER_API_KEY is set
if [ -z "${OPENROUTER_API_KEY}" ]; then
  echo "Error: OPENROUTER_API_KEY environment variable is not set." >&2
  echo "Please export your OpenRouter API key before running this script." >&2
  exit 1
fi

# Define the image name
IMAGE_NAME="aider-js-test-image"

# Define the host recordings path relative to the script location
HOST_RECORDINGS_PATH="$SCRIPT_DIR/recordings"

# Ensure the host recordings directory exists
mkdir -p "$HOST_RECORDINGS_PATH"

echo "Building image $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT" || exit 1

echo "Running container in RECORD mode..."
docker run --rm \
  -e AIDER_TARGET_API="https://openrouter.ai/api/v1" \
  -e OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" \
  -v "$HOST_RECORDINGS_PATH:/test-app/recordings" \
  "$IMAGE_NAME"

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "Record mode completed successfully."
else
  echo "Record mode failed with exit code $EXIT_CODE." >&2
fi

exit $EXIT_CODE 