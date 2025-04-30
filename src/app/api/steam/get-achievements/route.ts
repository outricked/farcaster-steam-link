import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import getRedisClient, { InferredRedisClientType } from '~/lib/redis';
import { AchievementSchema, CombinedAchievement, COOKIE_NAME, GlobalAchievementPercentage, PlayerAchievement } from '~/types/steam';

// Define cache expiration time in seconds (e.g., 1 hour)
const CACHE_TTL_SECONDS = 3600;

// Define interfaces for the expected raw API responses (simplified)
interface PlayerStatsResponse {
    playerstats?: {
        steamID?: string;
        gameName?: string;
        achievements?: PlayerAchievement[];
        success: boolean;
        message?: string;
    };
}

interface SchemaResponse {
    game?: {
        gameName: string;
        gameVersion: string;
        availableGameStats?: {
            achievements: AchievementSchema[];
            // stats?: any[]; // Add if needed
        };
    };
}

interface GlobalPercentagesResponse {
    achievementpercentages?: {
        achievements: GlobalAchievementPercentage[];
    };
}

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const steamId = cookieStore.get(COOKIE_NAME)?.value;

    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId');

    if (!steamId) {
        return NextResponse.json({ message: 'Missing steamId query parameter.' }, { status: 400 });
    }
    if (!appId) {
        return NextResponse.json({ message: 'Missing appId query parameter.' }, { status: 400 });
    }

    const steamApiKey = process.env.STEAM_API_KEY;
    if (!steamApiKey) {
        console.error('STEAM_API_KEY environment variable is not set.');
        return NextResponse.json({ message: 'Server configuration error: Missing Steam API Key.' }, { status: 500 });
    }

    let redis: InferredRedisClientType | undefined;
    try {
        redis = await getRedisClient();
    } catch (redisError) {
        console.error("Failed to connect to Redis, proceeding without cache:", redisError);
        // redis remains undefined
    }

    try {
        // Use specific types for the data variables
        let playerAchievementsData: PlayerStatsResponse | undefined;
        let schemaData: SchemaResponse | undefined;
        let globalPercentagesData: GlobalPercentagesResponse | undefined;

        // --- Fetch Player Achievements (with cache) ---
        const playerCacheKey = `playerAch:${steamId}:${appId}`;
        if (redis) {
            try {
                const cachedPlayerAch = await redis.get(playerCacheKey);
                if (cachedPlayerAch) {
                    console.log(`Using cached player achievements for ${playerCacheKey}`);
                    playerAchievementsData = JSON.parse(cachedPlayerAch);
                }
            } catch (err) {
                console.error(`Redis GET error for ${playerCacheKey}:`, err);
            }
        }

        if (!playerAchievementsData) {
            const playerAchievementsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamApiKey}&steamid=${steamId}&appid=${appId}&l=english`;
            console.log('Fetching player achievements from:', playerAchievementsUrl);
            const playerAchievementsResponse = await fetch(playerAchievementsUrl);

            if (!playerAchievementsResponse.ok) {
                console.error(`Steam API error (PlayerAchievements): ${playerAchievementsResponse.status} ${playerAchievementsResponse.statusText}`);
                const errorBody = await playerAchievementsResponse.text();
                console.error('Steam API error body:', errorBody);
                try {
                    const errorJson = JSON.parse(errorBody);
                    if (errorJson?.playerstats?.success === false && errorJson?.playerstats?.message) {
                         return NextResponse.json({ message: errorJson.playerstats.message }, { status: 404 });
                    }
                } catch { /* Ignore parsing error */ }
                return NextResponse.json({ message: `Failed to fetch player achievements. Status: ${playerAchievementsResponse.status}` }, { status: playerAchievementsResponse.status });
            }

            // Assign fetched data, type should be compatible with PlayerStatsResponse
            playerAchievementsData = await playerAchievementsResponse.json();
            console.log('Received player achievements data:', playerAchievementsData);

            // Cache the result only if Redis is available and data seems valid
            if (redis && playerAchievementsData?.playerstats?.success) {
                 try {
                     await redis.set(playerCacheKey, JSON.stringify(playerAchievementsData), {
                         EX: CACHE_TTL_SECONDS
                     });
                     console.log(`Cached player achievements for ${playerCacheKey}`);
                 } catch (err) {
                     console.error(`Redis SET error for ${playerCacheKey}:`, err);
                 }
            }
        }

        // --- Validate Player Achievements Data ---
        // Ensure playerAchievementsData and nested properties exist before accessing
        if (!playerAchievementsData?.playerstats?.success) {
             console.error('Failed to get player achievements, success=false or missing playerstats:', playerAchievementsData);
             const message = playerAchievementsData?.playerstats?.message || 'Could not retrieve achievements (profile private or no stats for this game?).';
             return NextResponse.json({ message: message }, { status: 404 });
        }
        // Default to empty array if achievements are missing
        const playerAchievements: PlayerAchievement[] = playerAchievementsData.playerstats.achievements || [];
        const playerAchievementsMap = new Map(playerAchievements.map(a => [a.apiname, a]));


        // --- Fetch Game Schema (with cache) ---
        const schemaCacheKey = `schema:${appId}`;
        if (redis) {
            try {
                const cachedSchema = await redis.get(schemaCacheKey);
                if (cachedSchema) {
                    console.log(`Using cached schema for ${schemaCacheKey}`);
                    schemaData = JSON.parse(cachedSchema);
                }
            } catch (err) {
                console.error(`Redis GET error for ${schemaCacheKey}:`, err);
            }
        }

        if (!schemaData) {
            const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${steamApiKey}&appid=${appId}&l=english`;
            console.log('Fetching game schema from:', schemaUrl);
            const schemaResponse = await fetch(schemaUrl);

            if (!schemaResponse.ok) {
                console.error(`Steam API error (Schema): ${schemaResponse.status} ${schemaResponse.statusText}`);
                const errorBody = await schemaResponse.text();
                console.error('Steam API error body:', errorBody);
                return NextResponse.json({ message: `Failed to fetch game schema. Status: ${schemaResponse.status}` }, { status: schemaResponse.status });
            }

            schemaData = await schemaResponse.json();
            console.log('Received schema data:', schemaData);

            // Cache the result only if Redis is available and data seems valid
             if (redis && schemaData?.game?.availableGameStats?.achievements) {
                 try {
                     await redis.set(schemaCacheKey, JSON.stringify(schemaData), {
                         EX: CACHE_TTL_SECONDS
                     });
                     console.log(`Cached schema for ${schemaCacheKey}`);
                 } catch (err) {
                     console.error(`Redis SET error for ${schemaCacheKey}:`, err);
                 }
             }
        }

        // --- Validate Schema Data ---
        // Use optional chaining for safer access
        if (!schemaData?.game?.availableGameStats?.achievements) {
            console.error('Unexpected schema data format:', schemaData);
            return NextResponse.json({ message: 'Failed to parse game schema data.' }, { status: 500 });
        }
        // schemaData and nested properties are now guaranteed to exist here
        const schemaAchievements: AchievementSchema[] = schemaData.game.availableGameStats.achievements;
        const gameName = schemaData.game.gameName; // Extract game name here for clarity

        // --- Fetch Global Achievement Percentages (with cache) ---
        const globalCacheKey = `globalAch:${appId}`;
        if (redis) {
            try {
                const cachedGlobal = await redis.get(globalCacheKey);
                if (cachedGlobal) {
                    console.log(`Using cached global percentages for ${globalCacheKey}`);
                    globalPercentagesData = JSON.parse(cachedGlobal);
                }
            } catch (err) {
                console.error(`Redis GET error for ${globalCacheKey}:`, err);
            }
        }

        if (!globalPercentagesData) {
            const globalPercentagesUrl = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}&format=json`;
            console.log('Fetching global achievement percentages from:', globalPercentagesUrl);
            const globalPercentagesResponse = await fetch(globalPercentagesUrl);

            if (!globalPercentagesResponse.ok) {
                console.error(`Steam API error (GlobalPercentages): ${globalPercentagesResponse.status} ${globalPercentagesResponse.statusText}`);
                const errorBody = await globalPercentagesResponse.text();
                console.error('Steam API error body:', errorBody);
                console.warn('Failed to fetch global achievement percentages. Proceeding without them.');
                // Provide default structure even on fetch failure
                globalPercentagesData = { achievementpercentages: { achievements: [] } };
            } else {
                 globalPercentagesData = await globalPercentagesResponse.json();
                 console.log('Received global percentages data:', globalPercentagesData);

                 // Cache the result only if Redis is available
                 if (redis) {
                     try {
                         // Cache even if achievementpercentages might be missing, the structure itself is cached
                         await redis.set(globalCacheKey, JSON.stringify(globalPercentagesData), {
                             EX: CACHE_TTL_SECONDS
                         });
                         console.log(`Cached global percentages for ${globalCacheKey}`);
                     } catch (err) {
                         console.error(`Redis SET error for ${globalCacheKey}:`, err);
                     }
                 }
            }
        }

        // --- Validate Global Percentages Data ---
        // Use optional chaining and provide default if necessary
        const globalAchievements: GlobalAchievementPercentage[] = globalPercentagesData?.achievementpercentages?.achievements || [];
        const globalPercentagesMap = new Map(globalAchievements.map(a => [a.name, a.percent]));

        // --- Combine Data ---
        const combinedAchievements: CombinedAchievement[] = schemaAchievements.map(schemaAch => {
            const playerAch = playerAchievementsMap.get(schemaAch.name);
            const globalPercent = globalPercentagesMap.get(schemaAch.name) ?? 100;
            return {
                ...schemaAch,
                achieved: playerAch ? playerAch.achieved === 1 : false,
                unlocktime: playerAch ? playerAch.unlocktime : 0,
                percent: globalPercent,
            };
        });

        // --- Sort Achievements ---
        combinedAchievements.sort((a, b) => {
            if (a.achieved && !b.achieved) return -1;
            if (!a.achieved && b.achieved) return 1;
            const percentA = typeof a.percent === 'number' ? a.percent : 100;
            const percentB = typeof b.percent === 'number' ? b.percent : 100;
            return percentA - percentB;
        });

        // Return combined data along with game name
        return NextResponse.json({
             gameName: gameName, // Use extracted variable
             steamId: steamId,
             achievements: combinedAchievements
         });

    } catch (error) {
        console.error('Error processing achievement request:', error);
        if (error instanceof Error && !redis && error.message.includes('Redis')) {
             // Check if the error might be related to a failed Redis operation when redis was expected
             console.error("Operation failed potentially due to Redis client issue after initial connection attempt.");
        }
        return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
    }
} 