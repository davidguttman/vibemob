#!/bin/bash

echo "Running aider-js test in REPLAY mode..."

# Get the directory of the script itself
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Go one level up to the project root relative to the script
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"

# Check if OPENROUTER_API_KEY is set (still needed by the script, even if not used by aider in replay)
if [ -z "${OPENROUTER_API_KEY}" ]; then
  echo "Warning: OPENROUTER_API_KEY environment variable is not set." >&2
  echo "While not strictly needed for replay, the script expects it." >&2
  # Decide if this should be a fatal error or just a warning
  # exit 1
fi

# Define the image name
IMAGE_NAME="aider-js-test-image"

# Define the host recordings path relative to the script location
HOST_RECORDINGS_PATH="$SCRIPT_DIR/recordings"

# Check if recordings directory exists
if [ ! -d "$HOST_RECORDINGS_PATH" ]; then
  echo "Error: Recordings directory not found at $HOST_RECORDINGS_PATH" >&2
  echo "Please run the record script first (run-record.sh) to generate recordings." >&2
  exit 1
fi

# Check if there are recordings within the expected sequence directory
SEQUENCE_DIR="$HOST_RECORDINGS_PATH/aider-test-sequence"
if [ ! -d "$SEQUENCE_DIR" ] || [ -z "$(ls -A "$SEQUENCE_DIR")" ]; then
    echo "Error: No recordings found in $SEQUENCE_DIR" >&2
    echo "Please run the record script first (run-record.sh)." >&2
    exit 1
fi

echo "Building image $IMAGE_NAME (if needed)..."
# Build might not be strictly necessary if record was just run, but ensures image exists
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$PROJECT_ROOT" || exit 1

echo "Running container in REPLAY mode..."
docker run --rm \
  -e ECHOPROXIA_MODE=replay \
  -e AIDER_TARGET_API="https://openrouter.ai/api/v1" \
  -e OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-dummy_key}" \
  -v "$HOST_RECORDINGS_PATH:/test-app/recordings" \
  "$IMAGE_NAME"

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "Replay mode completed successfully."
else
  echo "Replay mode failed with exit code $EXIT_CODE." >&2
fi

exit $EXIT_CODE 