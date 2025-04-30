'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SteamOwnedGamesResponse, SteamProfileResponse } from '~/types/steam';
import { Button } from './ui/Button';

interface SessionStatusResponse {
  session: {
    value: string;
  };
}

export function Demo2() {
  const router = useRouter();
  const [steamId, setSteamId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [ownedGames, setOwnedGames] = useState<SteamOwnedGamesResponse | null>(null);
  const [isLoadingOwnedGames, setIsLoadingOwnedGames] = useState<boolean>(true);

  const handleSteamLogin = () => {
    // Construct the return URL pointing to the backend API route
    const returnTo = `${window.location.origin}/api/auth/steam/session`;
    const realm = window.location.origin;
    const loginParams = {
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    };
    const steamLoginUrl = `https://steamcommunity.com/openid/login?${new URLSearchParams(loginParams).toString()}`;
    // Navigate the top-level window to break out of the iframe
    // Fallback to window.location if window.top is null (unlikely in this context)
    if (window.top) {
      window.top.location.href = steamLoginUrl;
    } else {
      window.location.href = steamLoginUrl;
    }
  };

  //check cookies
  useEffect(() => {
    const fetchSteamProfile = async () => {
      const response = await fetch('/api/steam/get-player-summaries');
      const data = await response.json();
      return data;
    };
    
    const fetchSessionStatus = async () => {
      if (steamId) {
        return {session: {value: steamId}};
      }
      const response = await fetch('/api/auth/steam/session/status');
      const data = await response.json();
      return data;
    };

    fetchSessionStatus().then((data: SessionStatusResponse) => {
      console.log('Session status fetched');
      setSteamId(data.session.value);
    }).catch((error) => {
      console.error('Error fetching session status:', error);
      setSteamId(null);
    }).finally(() => {
      setIsLoading(false);
    });

    fetchSteamProfile().then((data: SteamProfileResponse) => {
      console.log('Steam profile fetched');
      setPersonaName(data.response.personaname);
    }).catch((error) => {
      console.error('Error fetching steam profile:', error);
      setPersonaName(null);
    });
  }, []);

   //grab steam owned games
   useEffect(() => {
     if (!steamId) return;

     const cacheTotalHoursKey = `owned_games_${steamId}_total_hours_played`;
     const cacheTTL = 3600 * 1000; // 1 hour in milliseconds

     const fetchOwnedGames = async () => {
       // Check cache first
       try {
         const cachedItem = localStorage.getItem(cacheTotalHoursKey);
         if (cachedItem) {
           const { timestamp, data } = JSON.parse(cachedItem);
           const now = Date.now();
           if (now - timestamp < cacheTTL) {
             console.log('Using cached owned games');
             setOwnedGames(data);
             setIsLoadingOwnedGames(false); // Already loaded from cache
             return; // Don't fetch if valid cache exists
           } else {
             console.log('Cached owned games expired');
             localStorage.removeItem(cacheTotalHoursKey); // Remove expired item
           }
         }
       } catch (error) {
         console.error('Error reading from localStorage:', error);
         // Proceed to fetch if cache reading fails
       }


       setIsLoadingOwnedGames(true); // Set loading only if fetching
       try {
        const response = await fetch('/api/steam/owned-games');
        if (!response.ok) {
          // Handle HTTP errors like 4xx/5xx
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: SteamOwnedGamesResponse = await response.json(); // Assume response is valid JSON

        console.log('Owned games fetched from API');
        setOwnedGames(data);

        // Store fetched data in cache
        try {
          const itemToCache = {
            timestamp: Date.now(),
            data: data
          };
          localStorage.setItem(cacheTotalHoursKey, JSON.stringify(itemToCache));
        } catch (error) {
          console.error('Error writing to localStorage:', error);
        }
       } catch (error) {
         console.error('Error fetching owned games:', error);
         setOwnedGames(null); // Clear potentially stale data on error
       } finally {
         setIsLoadingOwnedGames(false);
       }
     };

     fetchOwnedGames();

   }, [steamId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      {isLoading ? (
        <p className="text-xl text-black-600">Loading session...</p>
      ) : steamId === null ? (
        <Button onClick={handleSteamLogin}>
          Connect to Steam
        </Button>
      ) : (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-black">Welcome, {personaName}! Select a game to view achievements.</h2>
          {
          ownedGames && ownedGames.response && ownedGames.response.games ? (
            <ul className="w-full max-w-2xl space-y-2">
              {ownedGames.response.games
                .map((game) => (
                  <li key={game.appid}>
                    <button
                      onClick={() => {
                        router.push(`/games/${game.appid}/achievements`);
                      }}
                      className="flex items-center w-full p-3 border rounded-lg hover:bg-gray-200 transition duration-150 ease-in-out text-left space-x-4"
                    >
                      <Image
                        src={`http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`}
                        alt={`${game.name} icon`}
                        width={40}
                        height={40}
                        className="flex-shrink-0 rounded"
                        unoptimized
                      />
                      <div className="flex-grow">
                        <span className="font-medium text-black">{game.name}</span>
                        {game.playtime_forever > 0 && (
                          <p className="text-sm text-gray-600">
                            {(game.playtime_forever / 60).toFixed(1)} hours played
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p>{isLoadingOwnedGames ? 'Loading owned games...' : 'No owned games found or error fetching.'}</p>
          )}
        </div>
      )}
    </div>
  );
} 