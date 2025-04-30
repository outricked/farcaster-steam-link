import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config(); // Load .env file

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

if (!DEPLOYER_PRIVATE_KEY) {
  console.warn("⚠️ WARNING: DEPLOYER_PRIVATE_KEY not set in .env file.");
}

const config: HardhatUserConfig = {
  solidity: "0.8.20", // Match the pragma in AchievementNFT.sol
  networks: {
    hardhat: {
      // Configuration for the local Hardhat Network
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532, // Base Sepolia Chain ID
    },
  },
  // Optional: Etherscan configuration for verification
  // etherscan: {
  //   apiKey: {
  //     baseSepolia: process.env.BASESCAN_API_KEY || "",
  //   },
  // },
};

export default config;
