import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createPublicClient, decodeEventLog, http, Log, parseAbiItem } from 'viem';
import { baseSepolia } from 'viem/chains'; // Or the chain you are targeting

// --- Configuration & Setup ---

// Load environment variables from .env file at the root of the project
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration from environment variables
const NODE_HTTP_URL = process.env.NODE_HTTP_URL || 'https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY'; // Default to Base Sepolia - **UPDATE .env!**
const CONTRACT_ADDRESS = (process.env.ACHIEVEMENT_NFT_CONTRACT_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512') as `0x${string}`; // Default to provided address
const ABI_PATH = path.resolve(__dirname, '../lib/abi/AchievementNFT.json'); // Adjust if ABI location differs
const POLLING_INTERVAL_MS = 15000; // Poll every 15 seconds
const BLOCKS_PER_POLL = 500n; // Process up to 500 blocks at a time to avoid hitting provider limits

// Define the event signature we are interested in
const achievementMintedEvent = parseAbiItem(
    'event AchievementMinted(address indexed owner, uint256 indexed tokenId, uint32 appId, string achievementApiName)'
);

// State variable to keep track of the last processed block
let lastProcessedBlock: bigint | null = null; // Start with null to fetch from a recent block initially

// --- Check Configuration ---
if (!NODE_HTTP_URL || NODE_HTTP_URL.includes('YOUR_ALCHEMY_API_KEY')) {
    console.warn("Warning: NODE_HTTP_URL environment variable is not set or uses a placeholder. Using default or placeholder URL.");
    // Consider exiting if a valid URL is strictly required: process.exit(1);
}
if (!CONTRACT_ADDRESS) {
    console.error("Error: ACHIEVEMENT_NFT_CONTRACT_ADDRESS environment variable is not set.");
    process.exit(1);
}
if (!fs.existsSync(ABI_PATH)) {
    console.error(`Error: ABI file not found at ${ABI_PATH}`);
    console.error("Please copy the ABI JSON from 'contracts/artifacts/contracts/AchievementNFT.sol/AchievementNFT.json' to 'src/lib/abi/'");
    process.exit(1);
}

// --- Viem Client Setup ---
const client = createPublicClient({
    chain: baseSepolia, // Make sure this matches your NODE_HTTP_URL network
    transport: http(NODE_HTTP_URL),
    pollingInterval: undefined, // We are doing manual polling
});

// --- Log Processing Function ---
async function processLogs(logs: readonly Log[]) {
    console.log(`Processing ${logs.length} raw logs...`);
    for (const log of logs) {
        try {
            // Viem's getLogs already filtered by the event signature.
            // We just need to decode. Ensure topics exist for indexed args if needed.
            // For AchievementMinted(address indexed owner, uint256 indexed tokenId, ...)
            // topics[0] = event signature hash
            // topics[1] = owner (address)
            // topics[2] = tokenId (uint256)
            if (log.topics.length >= 3) { // Check if expected indexed topics are present
                 const decodedLog = decodeEventLog({
                    abi: [achievementMintedEvent], // Provide ABI item for decoding
                    data: log.data,
                    topics: log.topics,
                });

                if (decodedLog.eventName === 'AchievementMinted') {
                    const { owner, tokenId, appId, achievementApiName } = decodedLog.args;
                    console.log("--- AchievementMinted Event Decoded ---");
                    console.log(`  Owner: ${owner}`);
                    console.log(`  Token ID: ${tokenId?.toString()}`);
                    console.log(`  App ID: ${appId}`);
                    console.log(`  API Name: ${achievementApiName}`);
                    console.log(`  Block Number: ${log.blockNumber}`);
                    console.log(`  Transaction Hash: ${log.transactionHash}`);
                    console.log("----------------------------------------");

                    // TODO: Add logic here to save this information to your database
                    // Ensure idempotency: check if this txHash/logIndex has already been processed.
                    // Example: await saveEventData({ owner, tokenId: tokenId.toString(), appId, achievementApiName, txHash: log.transactionHash, blockNumber: log.blockNumber });
                } else {
                    console.warn(`Log at block ${log.blockNumber} tx ${log.transactionHash} does not have enough topics for AchievementMinted, skipping.`);
                }
             }

        } catch (error) {
            console.error(`Error decoding log at index ${log.logIndex} in block ${log.blockNumber}:`, error);
            // Decide if you want to skip this log or stop processing
        }
    }
}


// --- Polling Function ---
async function pollForEvents() {
    try {
        console.log("Polling for new events...");
        const latestBlock = await client.getBlockNumber();

        if (lastProcessedBlock === null) {
            // On first run, start from a recent block (e.g., 100 blocks back)
            // to avoid processing the entire chain history unnecessarily. Adjust as needed.
            lastProcessedBlock = latestBlock > 100n ? latestBlock - 100n : 0n;
            console.log(`Initial poll: starting from block ${lastProcessedBlock}`);
        }

        const toBlock = lastProcessedBlock + BLOCKS_PER_POLL > latestBlock
            ? latestBlock // Don't go past the latest block
            : lastProcessedBlock + BLOCKS_PER_POLL; // Process in chunks


        if (lastProcessedBlock >= latestBlock) {
            console.log(`No new blocks to process (current: ${latestBlock}).`);
            return; // Nothing to do
        }

        console.log(`Fetching logs from block ${lastProcessedBlock + 1n} to ${toBlock}...`);

        const logs = await client.getLogs({
            address: CONTRACT_ADDRESS,
            event: achievementMintedEvent,
            fromBlock: lastProcessedBlock + 1n, // Start from the block *after* the last processed one
            toBlock: toBlock,
        });

        if (logs.length > 0) {
            await processLogs(logs);
        } else {
            console.log("No relevant logs found in this range.");
        }

        // Update the last processed block *only after successful processing*
        lastProcessedBlock = toBlock;
        console.log(`Advanced lastProcessedBlock to: ${lastProcessedBlock}`);


    } catch (error) {
        console.error("Error during polling:", error);
        // Implement more sophisticated error handling (e.g., retry logic, specific error checking)
    } finally {
        // Schedule the next poll regardless of success or failure in this round
        setTimeout(pollForEvents, POLLING_INTERVAL_MS);
    }
}

// --- Initial Setup & Start Polling ---
async function initialize() {
    console.log("Initializing worker...");
    // Perform any async setup needed before starting polling (e.g., DB connection)

    // Start the first poll
    console.log(`Starting polling with interval: ${POLLING_INTERVAL_MS}ms`);
    await pollForEvents(); // Start the loop
}

initialize().catch(error => {
    console.error("Worker initialization failed:", error);
    process.exit(1);
}); 