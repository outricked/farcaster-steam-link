// src/types/steam.ts

export interface SteamGame {
    appid: number;
    name: string;
    playtime_forever: number;
    img_icon_url: string;
    img_logo_url: string;
    playtime_2weeks?: number; // Optional playtime in the last 2 weeks
}

export interface SteamOwnedGamesResponse {
    response: {
        game_count: number;
        games: SteamGame[];
    };
} 

export const COOKIE_NAME = 'steamSession';

export interface SteamProfileResponse {
    response: {
       steamid: string;
       personaname: string;
    };
}


export interface PlayerAchievement {
    apiname: string;
    achieved: number;
    unlocktime: number;
}

export interface AchievementSchema {
    name: string;
    defaultvalue: number;
    displayName: string;
    hidden: number;
    description: string;
    icon: string;
    icongray: string;
}

export interface GlobalAchievementPercentage {
    name: string;
    percent: number;
}


export interface CombinedAchievement extends AchievementSchema {
    achieved: boolean;
    unlocktime: number;
    percent: number;
}

export interface AchievementsResponse {
    gameName?: string;
    steamId?: string;
    achievements?: CombinedAchievement[];
    message?: string; // For error messages from the API
}

/*
export interface AchievementsDisplayProps {
  selectedGameId: number | null; // Pass the App ID of the selected game
  gameName?: string; // Optional: Pass game name for display
}
*/
