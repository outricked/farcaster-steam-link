'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AchievementsResponse } from '~/types/steam'; // Assuming types are correctly set up

// --- Step 1: Add Imports ---
import { BaseError, bytesToHex, encodePacked, hexToBigInt, keccak256, stringToBytes } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';

// --- Step 2: Define Constants ---
const NFT_CONTRACT_ADDRESS = '0xD346e4F8b3F78446be526d7BA5a9c6532e46348c' as const;
const TARGET_CHAIN_ID = baseSepolia.id; // 84532

// --- Step 3: Define Minimal ABI ---
const achievementNftAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint32", "name": "appId", "type": "uint32" },
      { "internalType": "string", "name": "achievementApiId", "type": "string" },
      { "internalType": "bytes", "name": "data", "type": "bytes" }
    ],
    "name": "mintAchievement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export default function AchievementsPage() {
  const params = useParams();
  const appId = params.appid ? Number(params.appid) : null;
  const router = useRouter();

  // --- Step 4: Initialize Hooks and State ---
  const { address: accountAddress, isConnected } = useAccount();
  const { writeContract, data: writeContractHash, error: writeContractError, isPending: isWriteContractPending } = useWriteContract();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [achievementsData, setAchievementsData] = useState<AchievementsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gameNameState, setGameNameState] = useState<string | null>(null);

  // State for minting process
  const [mintingStatus, setMintingStatus] = useState<{ [achievementApiName: string]: 'idle' | 'loading' | 'switching_chain' | 'submitting' | 'success' | 'error' | 'warning_cache_failed' }>({});
  const [mintError, setMintError] = useState<string | null>(null);


  useEffect(() => {
    const fetchAchievements = async (id: number) => {
      setIsLoading(true);
      setAchievementsData(null); // Clear previous data
      try {
        const response = await fetch(`/api/steam/get-achievements?appId=${id}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: AchievementsResponse = await response.json();
        setAchievementsData(data);
        // API might return gameName, if so, use it
        if (data.gameName) {
          setGameNameState(data.gameName);
        }
        console.log('Achievements fetched for page', data);
      } catch (error) {
        console.error('Error fetching achievements:', error);
        setAchievementsData({ message: 'Error fetching achievements.' }); // Set error message
      } finally {
        setIsLoading(false);
      }
    };

    if (appId) {
      fetchAchievements(appId);
    } else {
      // Handle case where appId is missing or invalid
      setIsLoading(false);
      setAchievementsData({ message: 'Invalid App ID.' });
    }
  }, [appId]);

  // --- Minting Function ---
  const handleMint = useCallback(async (achievementApiName: string) => {

    // 1. Prerequisite Checks
    if (!appId) {
        setMintError("App ID is missing. Cannot mint.");
        console.error("Mint prerequisites not met: App ID missing");
        return;
    }
    if (!isConnected || !accountAddress) {
        setMintError("Wallet not connected. Please connect to mint.");
        console.error("Mint prerequisites not met: Wallet not connected or address unavailable");
        // Optionally, prompt user to connect here
        return;
    }

    setMintError(null); // Clear previous general errors
    setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'loading' }));

    // 2. Check Chain ID
    if (chainId !== TARGET_CHAIN_ID) {
        setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'switching_chain' }));
        setMintError(`Wrong network. Please switch to Base Sepolia (ID: ${TARGET_CHAIN_ID}).`); // Inform user
        try {
            await switchChain({ chainId: TARGET_CHAIN_ID });
            // After switchChain resolves, chainId *might* not update immediately.
            // We set an error message prompting the user to click again.
            setMintError("Network switch initiated. Please click Mint again once connected to Base Sepolia.");
            setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'idle' })); // Reset status as action needed
        } catch (e: unknown) {
            const switchError = e as Error; // Assuming basic Error structure
            console.error("Failed to switch chain:", switchError);
            // Type check for more specific error message
            let errorMsg = `Failed to switch to Base Sepolia. Please switch manually in your wallet.`;
            if (switchError instanceof BaseError) {
              errorMsg = switchError.shortMessage;
            } else if (switchError instanceof Error) {
              errorMsg = switchError.message;
            }
            setMintError(errorMsg);
            setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'error' }));
        }
        return; // Stop execution, user needs to confirm switch and potentially click again
    }

    // 3. Generate Token ID
    let tokenId: bigint;
    try {
        // Use uint32 for appId as per contract argument type
        const packedData = encodePacked(['uint32', 'string'], [appId, achievementApiName]);
        const hash = keccak256(packedData);
        tokenId = hexToBigInt(hash);
        console.log(`Generated tokenId for ${achievementApiName} (App ${appId}): ${tokenId.toString()}`);
    } catch (err) {
        console.error("Error generating tokenId:", err);
        setMintError("Failed to generate token ID.");
        setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'error' }));
        return;
    }

    // 4. Call Contract using writeContract
    console.log("Initiating mint transaction for token ID:", tokenId.toString());
    setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'submitting' })); // Update status before async call

    writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: achievementNftAbi,
        functionName: 'mintAchievement',
        args: [
            accountAddress, // to
            tokenId,        // tokenId
            appId,          // appId (as number - wagmi/viem handle type conversion)
            achievementApiName, // achievementApiId
            bytesToHex(stringToBytes('')) // data (empty bytes, converted to hex string '0x')
        ],
        chainId: TARGET_CHAIN_ID, // Specify target chain
    }, {
        onSuccess: async (txHash) => {
            console.log(`Mint transaction submitted: ${txHash}`);
            setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'submitting' })); // Keep as submitting until API call finishes
            // Optional: Could use useWaitForTransactionReceipt here for more confidence before calling API

            // 5. Cache Token ID via Backend API (Optimistic Call)
            // try {
            //     console.log(`Attempting to cache token info: AppId=${appId}, Ach=${achievementApiName}, TokenId=${tokenId.toString()}`);
            //     const cacheResponse = await fetch('/api/cache/store-token', { // Ensure this endpoint exists
            //         method: 'POST',
            //         headers: { 'Content-Type': 'application/json' },
            //         body: JSON.stringify({ appId, achievementName: achievementApiName, tokenId: tokenId.toString() }),
            //     });
            //     if (!cacheResponse.ok) {
            //          // Log error but still consider mint potentially successful on-chain
            //         console.error(`API error caching token: ${cacheResponse.status} ${cacheResponse.statusText}`);
            //         const errorBody = await cacheResponse.text();
            //         console.error("API Cache Error Body:", errorBody);
            //         setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'warning_cache_failed' }));
            //         // Optionally set a specific warning message for the user
            //         setMintError(`Mint successful, but failed to update achievement status. Please try refreshing. (API Status: ${cacheResponse.status})`);
            //     } else {
            //         console.log(`Token ID ${tokenId.toString()} successfully sent to cache API.`);
            //         setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'success' })); // Final success state
            //     }
            // } catch (e: unknown) {
            //     const apiError = e as Error; // Assuming basic Error structure
            //     console.error("Error calling cache token API:", apiError);
            //     setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'warning_cache_failed' }));
            //     // Extract message safely from potential error object
            //     const apiErrorMessage = apiError instanceof Error ? apiError.message : String(apiError);
            //     setMintError(`Mint successful, but failed to update achievement status. Please try refreshing. (Error: ${apiErrorMessage})`);
            // }
        },
        onError: (error) => {
            console.error("Minting transaction error:", error);
            // Use BaseError for short messages if available, otherwise generic
            const message = error instanceof BaseError ? error.shortMessage : error.message || 'Minting failed.';
            setMintError(`Minting failed: ${message}`);
            setMintingStatus(prev => ({ ...prev, [achievementApiName]: 'error' }));
        }
    });

  }, [
      appId, // Include all external variables used inside
      accountAddress,
      isConnected,
      chainId,
      switchChain,
      writeContract,
      setMintingStatus,
      setMintError
    ]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-black">Loading achievements...</p>
      </div>
    );
  }

  if (!achievementsData || achievementsData.message) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-center text-red-500">{achievementsData?.message || 'Could not load achievements.'}</p>
      </div>
    );
  }

  if (!achievementsData.achievements || achievementsData.achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
         <h2 className="text-2xl font-semibold mb-4 text-black">Achievements for {gameNameState || `App ID: ${appId}`}</h2>
         <p className="text-center text-black">No achievements found for this game.</p>
         <button 
            onClick={() => router.back()} 
            className="mb-4 inline-block text-blue-600 hover:underline"
          >
            &larr; Back
          </button>
      </div>
    );
  }

  const { achievements } = achievementsData;

  // Helper to render general minting errors
  const renderMintError = () => {
    if (!mintError) return null;
    return (
      <div className="my-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded w-full max-w-4xl">
        <p><strong>Minting Error:</strong> {mintError}</p>
        <button onClick={() => setMintError(null)} className="mt-1 text-sm text-red-900 underline hover:text-red-700">
          Dismiss
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
      <h2 className="text-2xl font-semibold mb-6 text-black">Achievements for {gameNameState || `App ID: ${appId}`}</h2>
      {renderMintError()} {/* Render general errors here */}
      <div className="w-full max-w-4xl">
          {/* Add Back Button */}
          <button 
            onClick={() => router.back()} 
            className="mb-4 inline-block text-blue-600 hover:underline"
          >
            &larr; Back
          </button>
          <ul className="space-y-3">
            {achievements.map((ach) => (
              <li key={ach.name} className="flex flex-col sm:flex-row items-start sm:items-center p-3 sm:p-4 border rounded-lg bg-white shadow-sm space-y-3 sm:space-y-0 sm:space-x-4">
                <Image
                  src={ach.achieved ? ach.icon : ach.icongray}
                  alt={ach.displayName}
                  width={50}
                  height={50}
                  className={`flex-shrink-0 rounded ${!ach.achieved ? 'grayscale opacity-70' : ''} mb-2 sm:mb-0 sm:mr-0`}
                  unoptimized
                />
                <div className="flex-grow">
                  <span className={`font-medium text-lg ${ach.achieved ? 'text-green-700' : 'text-black'}`}>{ach.displayName}</span>
                  {ach.hidden ? <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">Hidden Achievement</span> : null}
                  <p className="text-sm text-gray-700 mt-1">{ach.description || 'No description available.'}</p>
                  {ach.achieved && ach.unlocktime > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Unlocked: {new Date(ach.unlocktime * 1000).toLocaleString()}
                    </p>
                  )}
                  {/* --- Add Mint Button and Status Display --- */}
                  {ach.achieved && isConnected && (
                    <div className="mt-2">
                      <button
                        onClick={() => handleMint(ach.name) /* Use ach.name as the unique identifier */}
                        disabled={isWriteContractPending || mintingStatus[ach.name] === 'loading' || mintingStatus[ach.name] === 'submitting' || mintingStatus[ach.name] === 'switching_chain'}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150
                          ${ (isWriteContractPending && mintingStatus[ach.name] === 'loading') || mintingStatus[ach.name] === 'submitting' || mintingStatus[ach.name] === 'switching_chain'
                            ? 'bg-gray-400 text-gray-800 cursor-not-allowed'
                            : mintingStatus[ach.name] === 'success'
                            ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                            : mintingStatus[ach.name] === 'error'
                            ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                            : mintingStatus[ach.name] === 'warning_cache_failed'
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-400'
                            : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500' // Default/Idle state
                          }`
                        }
                      >
                        {mintingStatus[ach.name] === 'loading' ? 'Preparing...' :
                         mintingStatus[ach.name] === 'switching_chain' ? 'Switching Net...' :
                         mintingStatus[ach.name] === 'submitting' ? 'Minting (Check Wallet)...' :
                         mintingStatus[ach.name] === 'success' ? 'Minted Successfully!' :
                         mintingStatus[ach.name] === 'error' ? 'Error - Retry Mint' :
                         mintingStatus[ach.name] === 'warning_cache_failed' ? 'Minted (Cache Failed)' :
                         'Mint Achievement NFT' // Idle state
                        }
                      </button>
                      {/* Display transaction hash while submitting */}
                      {writeContractHash && mintingStatus[ach.name] === 'submitting' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Tx submitted: <a href={`${baseSepolia.blockExplorers.default.url}/tx/${writeContractHash}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">{`${writeContractHash.substring(0, 6)}...${writeContractHash.substring(writeContractHash.length - 4)}`}</a>
                        </p>
                      )}
                      {/* Specific per-achievement errors could potentially be shown here too */}
                    </div>
                  )}
                  {ach.achieved && !isConnected && (
                    <p className="text-sm text-yellow-700 mt-2 font-medium">
                      Connect wallet to mint this achievement NFT.
                    </p>
                  )}
                </div>
                {ach.percent !== undefined && (
                   <div className="flex-shrink-0 text-right sm:text-left mt-2 sm:mt-0">
                      <span className="text-sm text-gray-600 font-semibold block sm:inline">{ach.percent}%</span>
                      <span className="text-xs text-gray-500 block sm:inline sm:ml-1"> global</span>
                   </div>
                )}
              </li>
            ))}
          </ul>
      </div>
    </div>
  );
} 