import test from 'ava'
import { recognizeIntent } from '../lib/intent-recognizer.js'

test('recognizeIntent should return null for empty or invalid input', (t) => {
  t.is(recognizeIntent(), null)
  t.is(recognizeIntent(null), null)
  t.is(recognizeIntent(''), null)
  t.is(recognizeIntent(123), null)
  t.is(recognizeIntent({}), null)
})

test('recognizeIntent should return null for messages without recognized intent', (t) => {
  t.is(recognizeIntent('Hello there'), null)
  t.is(recognizeIntent('What is the weather today?'), null)
  t.is(recognizeIntent('Can you help me with something?'), null)
})

test('recognizeIntent should recognize "generate_plan" intent', (t) => {
  t.is(
    recognizeIntent('Please generate plan for this project'),
    'generate_plan',
  )
  t.is(recognizeIntent('I want you to generate plan now'), 'generate_plan')
  t.is(recognizeIntent('Can you make a plan for me?'), 'generate_plan')
  t.is(recognizeIntent("Let's make a plan for the project"), 'generate_plan')

  t.is(recognizeIntent('GENERATE PLAN please'), 'generate_plan')
  t.is(recognizeIntent('Make A Plan for this feature'), 'generate_plan')

  t.is(
    recognizeIntent('I think we should generate plan based on our discussion'),
    'generate_plan',
  )
  t.is(
    recognizeIntent('After all this talk, can you make a plan?'),
    'generate_plan',
  )
})
