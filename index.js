const express = require('express');
const Redis = require('ioredis');
const { promisify } = require('util');

const app = express();
const port = 3000;

const redisClient = new Redis({
  host: 'localhost', // Update with your Redis host
  port: 6379, // Default Redis port
  // Add other configuration options if needed
});

const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const decrAsync = promisify(redisClient.decr).bind(redisClient);

async function rateLimitUsingTokenBucket(userID, intervalInSeconds, maximumRequests) {
  const value = await getAsync(userID + '_last_reset_time');
  const lastResetTime = parseInt(value, 10);
  const timeComparison = Date.now() / 1000 - lastResetTime >= intervalInSeconds;

  if (isNaN(lastResetTime) || timeComparison) {
    await setAsync(userID + '_counter', maximumRequests);
    await setAsync(userID + '_last_reset_time', Date.now() / 1000);
  } else {
    const requestLeft = await getAsync(userID + '_counter');
    if (parseInt(requestLeft, 10) <= 0) {
      return false;
    }
  }

  await decrAsync(userID + '_counter');
  return true;
}


//TODO: [1] replace harcoded username woth req ip [2]
app.get('/rate-limiter', async (req, res) => {
  try {
    const result = await rateLimitUsingTokenBucket('apikey123', 60, 2);
    console.log(result ? 'Request allowed' : 'Request blocked');
    res.send(result ? 'Request allowed' : 'Request blocked');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Handle cleanup when Express is fully closed
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

process.on('SIGINT', async () => {
  console.log('Server is shutting down...');
  server.close(() => {
    console.log('Express server closed.');
    redisClient.quit();
    console.log('Redis connection closed.');
    process.exit(0);
  });
});
