import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AchievementSchema, CombinedAchievement, COOKIE_NAME, GlobalAchievementPercentage, PlayerAchievement } from '~/types/steam';


export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const steamId = cookieStore.get(COOKIE_NAME)?.value;

    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId')

    if (!steamId) {
        return NextResponse.json({ message: 'Missing steamId query parameter.' }, { status: 400 });
    }

    const steamApiKey = process.env.STEAM_API_KEY;
    if (!steamApiKey) {
        console.error('STEAM_API_KEY environment variable is not set.');
        return NextResponse.json({ message: 'Server configuration error: Missing Steam API Key.' }, { status: 500 });
    }

    try {
        // --- Fetch Player Achievements ---
        const playerAchievementsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamApiKey}&steamid=${steamId}&appid=${appId}&l=english`;
        console.log('Fetching player achievements from:', playerAchievementsUrl);
        const playerAchievementsResponse = await fetch(playerAchievementsUrl);

        if (!playerAchievementsResponse.ok) {
            console.error(`Steam API error (PlayerAchievements): ${playerAchievementsResponse.status} ${playerAchievementsResponse.statusText}`);
            const errorBody = await playerAchievementsResponse.text();
            console.error('Steam API error body:', errorBody);
            // Try to parse error message from Steam if available
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.playerstats?.success === false && errorJson?.playerstats?.message) {
                     return NextResponse.json({ message: errorJson.playerstats.message }, { status: 404 }); // e.g., Profile is private
                }
            } catch { /* Ignore parsing error */ }
            return NextResponse.json({ message: `Failed to fetch player achievements. Status: ${playerAchievementsResponse.status}` }, { status: playerAchievementsResponse.status });
        }

        const playerAchievementsData = await playerAchievementsResponse.json();
        console.log('Received player achievements data:', playerAchievementsData);

        if (!playerAchievementsData.playerstats || !playerAchievementsData.playerstats.success) {
             console.error('Failed to get player achievements, success=false or missing playerstats:', playerAchievementsData);
             const message = playerAchievementsData?.playerstats?.message || 'Could not retrieve achievements (profile private or no stats for this game?).';
             return NextResponse.json({ message: message }, { status: 404 });
        }

        const playerAchievements: PlayerAchievement[] = playerAchievementsData.playerstats.achievements || [];
        const playerAchievementsMap = new Map(playerAchievements.map(a => [a.apiname, a]));

        // --- Fetch Game Schema ---
        const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${steamApiKey}&appid=${appId}&l=english`;
        console.log('Fetching game schema from:', schemaUrl);
        const schemaResponse = await fetch(schemaUrl);

        if (!schemaResponse.ok) {
            console.error(`Steam API error (Schema): ${schemaResponse.status} ${schemaResponse.statusText}`);
            const errorBody = await schemaResponse.text();
            console.error('Steam API error body:', errorBody);
            return NextResponse.json({ message: `Failed to fetch game schema. Status: ${schemaResponse.status}` }, { status: schemaResponse.status });
        }

        const schemaData = await schemaResponse.json();
        console.log('Received schema data:', schemaData);

        if (!schemaData.game || !schemaData.game.availableGameStats || !schemaData.game.availableGameStats.achievements) {
            console.error('Unexpected schema data format:', schemaData);
            return NextResponse.json({ message: 'Failed to parse game schema data.' }, { status: 500 });
        }

        const schemaAchievements: AchievementSchema[] = schemaData.game.availableGameStats.achievements;

        // --- Fetch Global Achievement Percentages ---
        const globalPercentagesUrl = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}&format=json`;
        console.log('Fetching global achievement percentages from:', globalPercentagesUrl);
        const globalPercentagesResponse = await fetch(globalPercentagesUrl);

        if (!globalPercentagesResponse.ok) {
            console.error(`Steam API error (GlobalPercentages): ${globalPercentagesResponse.status} ${globalPercentagesResponse.statusText}`);
            const errorBody = await globalPercentagesResponse.text();
            console.error('Steam API error body:', errorBody);
            return NextResponse.json({ message: `Failed to fetch global achievement percentages. Status: ${globalPercentagesResponse.status}` }, { status: globalPercentagesResponse.status });
        }

        const globalPercentagesData = await globalPercentagesResponse.json();
        console.log('Received global percentages data:', globalPercentagesData);

        if (!globalPercentagesData.achievementpercentages || !globalPercentagesData.achievementpercentages.achievements) {
             console.error('Unexpected global percentages data format:', globalPercentagesData);
             // Allow proceeding without percentages if they are missing, just won't sort by rarity.
             // return NextResponse.json({ message: 'Failed to parse global achievement percentages.' }, { status: 500 });
        }

        const globalAchievements: GlobalAchievementPercentage[] = globalPercentagesData?.achievementpercentages?.achievements || [];
        const globalPercentagesMap = new Map(globalAchievements.map(a => [a.name, a.percent]));

        // --- Combine Data ---
        const combinedAchievements: CombinedAchievement[] = schemaAchievements.map(schemaAch => {
            const playerAch = playerAchievementsMap.get(schemaAch.name);
            const globalPercent = globalPercentagesMap.get(schemaAch.name) ?? 100; // Default to 100% if missing
            return {
                ...schemaAch,
                achieved: playerAch ? playerAch.achieved === 1 : false,
                unlocktime: playerAch ? playerAch.unlocktime : 0,
                percent: globalPercent,
            };
        });

        // --- Sort Achievements ---
        combinedAchievements.sort((a, b) => {
            // Prioritize achieved achievements
            if (a.achieved && !b.achieved) return -1;
            if (!a.achieved && b.achieved) return 1;

            // If both achieved or both not achieved, sort by lowest percentage (rarest first)
            return a.percent - b.percent;
        });

        // Return combined data along with game name
        return NextResponse.json({
             gameName: schemaData.game.gameName,
             steamId: steamId,
             achievements: combinedAchievements
         });

    } catch (error) {
        console.error('Error fetching achievements:', error);
        return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
    }
} 