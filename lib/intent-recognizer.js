import debug from 'debug'

const log = debug('vibemob:intent-recognizer')

/**
 * Recognizes user intent from message text
 * @param {string} messageText - The text message from the user
 * @returns {string|null} - The recognized intent or null if no intent is detected
 */
export function recognizeIntent(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    log('Invalid message text provided to recognizeIntent')
    return null
  }

  const normalizedText = messageText.toLowerCase().trim()

  log(`Analyzing message for intent: "${normalizedText}"`)

  if (
    normalizedText.includes('generate plan') ||
    normalizedText.includes('make a plan')
  ) {
    log('Recognized intent: generate_plan')
    return 'generate_plan'
  }

  log('No intent recognized')
  return null
}

export default {
  recognizeIntent,
}
