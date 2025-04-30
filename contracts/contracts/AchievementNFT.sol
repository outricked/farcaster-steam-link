// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title AchievementNFT
 * @dev ERC1155 contract to represent Steam achievements as NFTs.
 * Each achievement is represented by a unique token ID generated deterministically.
 * NFTs are minted on demand, emitting an event with mapping details.
 */
contract AchievementNFT is ERC1155, Ownable {
    string public baseMetadataURI; // Base URI for metadata, e.g., "https://yourapi.com/api/metadata/achievement/"

    // --- Events ---

    /**
     * @dev Emitted when a new achievement NFT is minted.
     * Used by off-chain indexers to map tokenId to achievement details.
     * @param owner The address receiving the NFT.
     * @param tokenId The unique ID of the minted token.
     * @param appId The Steam App ID for the game.
     * @param achievementApiId The unique API ID of the achievement within the game.
     */
    event AchievementMinted(
        address indexed owner,
        uint256 indexed tokenId,
        uint32 appId,
        string achievementApiId
    );

    // --- Constructor ---

    /**
     * @dev Sets the base URI for token metadata and the initial owner.
     */
    constructor(string memory _baseMetadataURI, address initialOwner)
        ERC1155(_baseMetadataURI)
        Ownable(initialOwner)
    {
        baseMetadataURI = _baseMetadataURI;
    }

    // --- Minting ---

    /**
     * @dev Mints a new achievement NFT for a specific user.
     * Requires the pre-calculated tokenId and the corresponding appId and apiName.
     * Ensures a user cannot mint the same achievement twice.
     * Emits an AchievementMinted event.
     * Access control should be handled off-chain or via extensions (e.g., signature verification).
     * @param to The address to mint the NFT to.
     * @param tokenId The unique identifier for the achievement NFT (e.g., keccak256(appId, apiName)).
     * @param appId The Steam App ID associated with the achievement.
     * @param achievementApiId The unique API ID for the achievement.
     * @param data Optional data to pass along with the mint operation.
     */
    function mintAchievement(
        address to,
        uint256 tokenId,
        uint32 appId,
        string memory achievementApiId,
        bytes memory data
    ) public {
        // Ensure the user doesn't already own this specific achievement NFT
        require(balanceOf(to, tokenId) == 0, "AchievementNFT: Already minted this achievement");

        // TODO: Consider adding verification logic here if needed (e.g., requiring a signature)

        _mint(to, tokenId, 1, data); // Mint 1 unit of the token

        // Emit the event for off-chain indexers
        emit AchievementMinted(to, tokenId, appId, achievementApiId);
    }

    // --- Metadata ---

    /**
     * @dev Returns the URI for a given token ID.
     * Overrides the default ERC1155 uri function to append the token ID to the base URI.
     * Assumes metadata is hosted at `baseMetadataURI/{id}` where {id} is the tokenId.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        // Ensure the base URI is set
        require(bytes(baseMetadataURI).length > 0, "ERC1155Metadata: base URI not set");

        // Convert tokenId to string and concatenate with base URI
        return string(abi.encodePacked(baseMetadataURI, Strings.toString(tokenId)));
    }

    // --- URI Management ---

    /**
     * @dev Allows the owner to update the base URI for the metadata.
     * @param newBaseMetadataURI The new base URI string.
     */
    function setBaseURI(string memory newBaseMetadataURI) public onlyOwner {
        baseMetadataURI = newBaseMetadataURI;
        // Note: ERC1155's internal _uri is set only in the constructor.
        // If you need to update it *after* deployment, you might need a custom implementation
        // or rely solely on the overridden uri function. This implementation relies on the override.
    }

    // --- Token ID Calculation (Helper - Conceptual) ---
    // This function is just for illustration and wouldn't typically be needed *on-chain*
    // if the IDs are calculated off-chain before calling mintAchievement.
    /*
    function calculateTokenId(uint32 appId, string memory achievementApiName) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(appId, achievementApiName)));
    }
    */
} 