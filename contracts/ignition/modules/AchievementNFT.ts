import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// dotenv.config({ path: "../../.env" }); // REMOVED: Loading is handled by hardhat.config.ts

const AchievementNFTModule = buildModule("AchievementNFTModule", (m) => {
  const initialOwner = m.getParameter(
    "initialOwner",
    process.env.DEPLOYER_ADDRESS
  );
  const baseMetadataURI = m.getParameter(
    "baseMetadataURI",
    process.env.BASE_METADATA_URI
  );

  // Validate that environment variables are set
  if (!process.env.DEPLOYER_ADDRESS || !process.env.BASE_METADATA_URI) {
    throw new Error(
      "Missing DEPLOYER_ADDRESS or BASE_METADATA_URI in the .env file in the 'contracts' directory."
    );
  }

  console.log("Preparing AchievementNFT deployment via Ignition...");
  console.log(`  Initial Owner (from env): ${process.env.DEPLOYER_ADDRESS}`);
  console.log(`  Base Metadata URI (from env): ${process.env.BASE_METADATA_URI}`);

  const achievementNFT = m.contract("AchievementNFT", [
    baseMetadataURI,
    initialOwner,
  ], {
    id: "deploy_1",
  });

  return { achievementNFT };
});

export default AchievementNFTModule; 