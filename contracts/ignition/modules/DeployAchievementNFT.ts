import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const BASE_URI = "http://localhost:3000/api/metadata/achievement/"; // Placeholder - Update required for testnet/mainnet

const AchievementNFTModule = buildModule("AchievementNFTModule", (m) => {
  // Get the deployer account (account 0)
  const owner = m.getAccount(0);

  // Define the base URI parameter for the constructor
  const baseMetadataURI = m.getParameter("_baseMetadataURI", BASE_URI);

  // Deploy the AchievementNFT contract
  const achievementNFT = m.contract("AchievementNFT", [
    baseMetadataURI,
    owner, // Pass the deployer address as the initial owner
  ], {
    id: "alpha_1",
  });

  // Return the deployed contract instance
  return { achievementNFT };
});

export default AchievementNFTModule;