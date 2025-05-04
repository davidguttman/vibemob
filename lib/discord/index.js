// lib/discord/index.js

// Conditionally export the real discord.js or the mock implementation
// based on the NODE_ENV environment variable.
if (process.env.NODE_ENV === 'test') {
  console.log('Using Discord Double (Test Environment)');
  // Ensure this path correctly points to the test implementation
  module.exports = require('./discord-test.js'); 
} else {
  // Export the real discord.js library
  module.exports = require('discord.js');
} 