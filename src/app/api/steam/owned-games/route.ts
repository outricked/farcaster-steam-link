import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, SteamGame } from '../../../../types/steam';

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_GET_OWNED_GAMES_URL = 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';

export async function GET(_request: NextRequest) {
    const cookieStore = cookies();
    const steamId = (await cookieStore).get(COOKIE_NAME)?.value;

    if (!STEAM_API_KEY) {
        console.error('STEAM_API_KEY environment variable is not set.');
        return NextResponse.json({ error: 'Server configuration error: Missing Steam API key.' }, { status: 500 });
    }

    if (!steamId) {
        console.log('No Steam session cookie found.');
        return NextResponse.json({ error: 'Unauthorized: No Steam session found.' }, { status: 401 });
    }

    console.log(`Fetching owned games for SteamID: ${steamId}`);

    try {
        const params = new URLSearchParams({
            key: STEAM_API_KEY,
            steamid: steamId,
            format: 'json',
            include_appinfo: 'true', // Get game names, icons, etc.
            include_played_free_games: 'true', // Include free games if played
        });

        const fetchUrl = `${STEAM_GET_OWNED_GAMES_URL}?${params.toString()}`;
        console.log(`Calling Steam API: ${fetchUrl}`);

        const steamResponse = await fetch(fetchUrl, {
            method: 'GET',
            cache: 'no-store', // Ensure fresh data
        });

        if (!steamResponse.ok) {
            console.error(`Steam API request failed with status: ${steamResponse.status}`, await steamResponse.text());
            return NextResponse.json({ error: `Failed to fetch data from Steam API (Status: ${steamResponse.status})` }, { status: steamResponse.status });
        }
        
        const data = await steamResponse.json();
        console.log('Steam response:', data);

        if (!data.response || !data.response.games) {
            // Handle cases where the profile might be private or empty
            if (data.response && Object.keys(data.response).length === 0) {
                 console.log(`Received empty response for SteamID ${steamId}. Profile might be private or has no games.`);
                 return NextResponse.json({ game_count: 0, games: [] }, { status: 200 }); // Return empty list
            }
             // Handle unexpected structure
            console.error('Unexpected response structure from Steam API:', data);
            return NextResponse.json({ error: 'Unexpected response structure from Steam API.' }, { status: 500 });
        }

        // Sort games by playtime_forever descending
        const sortedGames = data.response.games.sort(
            (a: SteamGame, b: SteamGame) => b.playtime_forever - a.playtime_forever
        );

        console.log(`Successfully fetched and sorted ${sortedGames.length} games for SteamID: ${steamId}`);

        // Return the sorted games list
        return NextResponse.json({
            response:{
                game_count: data.response.game_count,
                games: sortedGames
            }
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching or processing owned games:', error);
        // Use unknown type assertion for better error logging if needed
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
    }
} 