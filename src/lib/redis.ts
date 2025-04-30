import { createClient } from 'redis';

// Use environment variables for connection details
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Infer the client type directly from createClient
type InferredRedisClientType = ReturnType<typeof createClient>;

let redisClient: InferredRedisClientType | null = null;
// The promise that resolves when connection is established, or null if not connecting
let connectPromise: Promise<InferredRedisClientType> | null = null;

const getRedisClient = (): Promise<InferredRedisClientType> => {
  // If already connected and the connection is open, return the existing client
  if (redisClient && redisClient.isOpen) {
    // Ensure we return a Promise for consistency
    return Promise.resolve(redisClient);
  }

  // If a connection attempt is already in progress, return that promise
  if (connectPromise) {
    return connectPromise;
  }

  // Start a new connection attempt
  console.log('Creating and connecting Redis client...');
  // Create the client instance - Types are inferred here
  const client = createClient({
      url: redisUrl
  });

  client.on('error', (err) => console.error('Redis Client Error', err));

  // Store the promise for concurrent requests
  // Explicitly type the new Promise to match the return type
  connectPromise = new Promise<InferredRedisClientType>((resolve, reject) => {
    client.connect()
      .then(() => {
        console.log('Redis client connected.');
        // Type assertion might still be necessary depending on TS version/strictness
        // but client is already of the correct type after connect resolves.
        redisClient = client as InferredRedisClientType; // Assign the connected client
        connectPromise = null; // Clear the promise variable, connection is done
        resolve(redisClient); // Resolve the promise with the client
      })
      .catch(err => {
        console.error('Redis connection failed:', err);
        connectPromise = null; // Clear the promise variable on failure
        redisClient = null; // Ensure client is null on failure
        reject(err); // Reject the promise
      });
  });

  return connectPromise;
};

export default getRedisClient;

// Re-export the specific client type if needed elsewhere
export type { InferredRedisClientType };
