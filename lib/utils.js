import debug from 'debug'

const log = debug('vibemob:utils')

const DISCORD_MAX_MESSAGE_LENGTH = 2000

/**
 * Splits a string into chunks suitable for Discord messages.
 * Tries to split at newlines first, then spaces, then resorts to hard splitting.
 * Respects markdown code blocks (```) and tries not to split within them.
 *
 * @param {string} text The text to split.
 * @param {number} [maxLength=DISCORD_MAX_MESSAGE_LENGTH] The maximum length for each chunk.
 * @returns {string[]} An array of string chunks.
 */
export function splitMessage(text, maxLength = DISCORD_MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) {
    return [text]
  }

  log(
    `Splitting message of length ${text.length} into chunks of max ${maxLength}`,
  )
  const chunks = []
  let currentChunk = ''
  let inCodeBlock = false
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Toggle code block state
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
    }

    // Check if adding the next line exceeds the limit
    if (currentChunk.length + line.length + 1 > maxLength) {
      // Can we split the current chunk further if it's too long by itself?
      if (currentChunk.length > maxLength) {
        log(
          `Current chunk too long (${currentChunk.length}), performing hard split.`,
        )
        // Hard split needed within the oversized chunk (rare case)
        for (let j = 0; j < currentChunk.length; j += maxLength) {
          chunks.push(currentChunk.substring(j, j + maxLength))
        }
      } else if (currentChunk.length > 0) {
        // Push the current chunk if it's not empty
        chunks.push(currentChunk)
      }
      currentChunk = ''

      // If the single line itself is too long, split it
      if (line.length > maxLength) {
        log(`Single line too long (${line.length}), performing hard split.`)
        // Try to split the long line by spaces if not in a code block
        if (!inCodeBlock && line.includes(' ')) {
          let linePart = ''
          const words = line.split(' ')
          for (const word of words) {
            if (linePart.length + word.length + 1 > maxLength) {
              chunks.push(linePart)
              linePart = word
            } else {
              linePart += (linePart.length > 0 ? ' ' : '') + word
            }
          }
          // Add the last part of the long line
          if (linePart.length > 0) {
            currentChunk = linePart // Start new chunk with remaining part
          }
        } else {
          // Hard split the line (inside code block or no spaces)
          for (let j = 0; j < line.length; j += maxLength) {
            const subLine = line.substring(j, j + maxLength)
            // If this is the last part of the hard split, start the new chunk with it
            // Otherwise, push the sub-line directly
            if (j + maxLength >= line.length) {
              currentChunk = subLine
            } else {
              chunks.push(subLine)
            }
          }
        }
      } else {
        // Start the new chunk with the current line
        currentChunk = line
      }
    } else {
      // Add line to current chunk
      currentChunk += (currentChunk.length > 0 ? '\n' : '') + line
    }
  }

  // Push the last remaining chunk
  if (currentChunk.length > 0) {
    // Final check: if the last chunk is still too long, hard split it
    if (currentChunk.length > maxLength) {
      log(
        `Final chunk too long (${currentChunk.length}), performing hard split.`,
      )
      for (let j = 0; j < currentChunk.length; j += maxLength) {
        chunks.push(currentChunk.substring(j, j + maxLength))
      }
    } else {
      chunks.push(currentChunk)
    }
  }

  log(`Split message into ${chunks.length} chunks.`)
  return chunks
}

// Export utilities
export const utils = {
  splitMessage,
}
