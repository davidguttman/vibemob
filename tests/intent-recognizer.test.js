import test from 'ava'
import { recognizeIntent } from '../lib/intent-recognizer.js'

test('recognizeIntent should return null for empty or invalid input', async (t) => {
  t.is(await recognizeIntent(), null)
  t.is(await recognizeIntent(null), null)
  t.is(await recognizeIntent(''), null)
  t.is(await recognizeIntent(123), null)
  t.is(await recognizeIntent({}), null)
})

test('recognizeIntent should return null for messages without recognized intent', async (t) => {
  t.is(await recognizeIntent('Hello there'), null)
  t.is(await recognizeIntent('What is the weather today?'), null)
  t.is(await recognizeIntent('Can you help me with something?'), null)
})

test('recognizeIntent should recognize "generate_plan" intent', async (t) => {
  t.is(
    await recognizeIntent('Please generate plan for this project'),
    'generate_plan',
  )
  t.is(
    await recognizeIntent('I want you to generate plan now'),
    'generate_plan',
  )
  t.is(await recognizeIntent('Can you make a plan for me?'), 'generate_plan')
  t.is(
    await recognizeIntent("Let's make a plan for the project"),
    'generate_plan',
  )

  t.is(await recognizeIntent('GENERATE PLAN please'), 'generate_plan')
  t.is(await recognizeIntent('Make A Plan for this feature'), 'generate_plan')

  t.is(
    await recognizeIntent(
      'I think we should generate plan based on our discussion',
    ),
    'generate_plan',
  )
  t.is(
    await recognizeIntent('After all this talk, can you make a plan?'),
    'generate_plan',
  )
})
