// Cast-only content that runs on the hall screen but is never up for voting.
// Two flavours beyond the regular non-votable videos:
//
//   - WINNER_FINAL_REELS — winner reveals; loop on screen, cast from admin
//     behind a confirmation prompt.
//   - CAUGHT_UP — a static image, stays on the hall until something else
//     is cast.

import winnerManifest from "./winner-final.json";

export interface WinnerFinalReel {
  reel_id: string;
  file_path: string;
  title: string;
  runtime: number;
}

// Drop more videos in public/winner-final/ and re-run the gen script to
// repopulate src/lib/winner-final.json.
export const WINNER_FINAL_REELS: readonly WinnerFinalReel[] =
  winnerManifest as WinnerFinalReel[];

export const CAUGHT_UP = {
  reel_id: "__caught_up__",
  image_path: "/caught-up/You%20are%20all%20caught%20up.png",
  title: "You are all caught up",
} as const;

export const WIFI_IMAGE = {
  reel_id: "__wifi__",
  image_path: "/wifi/wife%20eye%402x-100.jpg",
  title: "Wi-Fi",
} as const;

export function findWinnerFinal(
  reelId: string | null | undefined,
): WinnerFinalReel | null {
  if (!reelId) return null;
  return WINNER_FINAL_REELS.find((r) => r.reel_id === reelId) ?? null;
}
