import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../../types/steam";

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_GET_PLAYER_SUMMARIES_URL = 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';

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
            steamids: steamId,
            format: 'json',
        });

        const fetchUrl = `${STEAM_GET_PLAYER_SUMMARIES_URL}?${params.toString()}`;
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
        console.log('Steam Profile response:', data);



        if (!data.response) {
            console.error('Unexpected response structure from Steam API:', data);
            return NextResponse.json({ error: 'Unexpected response structure from Steam API.' }, { status: 500 });
        }

        if (data.response.players.length === 0) {
            console.error('No players found for SteamID:', steamId);
            return NextResponse.json({ error: 'No players found for SteamID.' }, { status: 404 });
        }

        // Return the sorted games list
        return NextResponse.json({
            response:{
                steamid: data.response.players[0].steamid,
                communityvisibilitystate: data.response.players[0].communityvisibilitystate,
                profilestate: data.response.players[0].profilestate,
                personaname: data.response.players[0].personaname,
            }
        }, { status: 200 });

    } catch (error) {
        console.error('Error fetching or processing owned games:', error);
        // Use unknown type assertion for better error logging if needed
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
    }
}