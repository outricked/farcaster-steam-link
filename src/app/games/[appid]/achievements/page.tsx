'use client';

import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AchievementsResponse } from '~/types/steam'; // Assuming types are correctly set up

export default function AchievementsPage() {
  const params = useParams();
  const appId = params.appid ? Number(params.appid) : null;
  // Optional: could also get gameName from query params if passed during navigation
  // const searchParams = useSearchParams();
  // const gameName = searchParams.get('gameName');

  const [achievementsData, setAchievementsData] = useState<AchievementsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [gameNameState, setGameNameState] = useState<string | null>(null); // To store fetched game name if needed

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
         {/* Optional: Add a link back */} 
         {/* <Link href="/" className="mt-4 text-blue-600 hover:underline">Back to Games</Link> */}
      </div>
    );
  }

  const { achievements } = achievementsData;

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
      <h2 className="text-2xl font-semibold mb-6 text-black">Achievements for {gameNameState || `App ID: ${appId}`}</h2>
      <div className="w-full max-w-4xl">
          {/* Optional: Add a link back */} 
          {/* <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">&larr; Back to Games</Link> */} 
          <ul className="space-y-2">
            {achievements.map((ach) => (
              <li key={ach.name} className="flex items-center p-3 border rounded-lg bg-white shadow-sm space-x-4">
                <Image
                  src={ach.achieved ? ach.icon : ach.icongray}
                  alt={ach.displayName}
                  width={50} // Slightly larger icons might be nice on a dedicated page
                  height={50}
                  className={`flex-shrink-0 rounded ${!ach.achieved ? 'grayscale opacity-70' : ''}`}
                  unoptimized // Add if getting 403 errors on Steam images
                />
                <div className="flex-grow">
                  <span className={`font-medium text-lg ${ach.achieved ? 'text-green-700' : 'text-black'}`}>{ach.displayName}</span>
                  <p className="text-sm text-gray-700 mt-1">{ach.description || 'No description available.'}</p>
                  {ach.achieved && ach.unlocktime > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Unlocked: {new Date(ach.unlocktime * 1000).toLocaleString()}
                    </p>
                  )}
                </div>
                {ach.percent && (
                  <span className="text-sm text-gray-500 font-semibold">{ach.percent}%</span>
                )}
              </li>
            ))}
          </ul>
      </div>
    </div>
  );
} 