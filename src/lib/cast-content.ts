// Cast-only content that runs on the hall screen but is never up for voting.
// Three flavours beyond the regular non-votable videos:
//
//   - LOOP_GRADIENT — auto-loops after every non-votable video until the
//     operator casts something else.
//   - WINNER_FINAL_REELS — winner reveals; loop on screen, cast from admin
//     behind a confirmation prompt.
//   - CAUGHT_UP — a static image, stays on the hall until something else
//     is cast.

export const LOOP_GRADIENT = {
  reel_id: "__loop_gradient__",
  file_path: "/loop-this/Mood%20gradient.mp4",
  title: "Mood gradient (loop)",
  runtime: 21,
  loop: true,
} as const;

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

export function findWinnerFinal(
  reelId: string | null | undefined,
): WinnerFinalReel | null {
  if (!reelId) return null;
  return WINNER_FINAL_REELS.find((r) => r.reel_id === reelId) ?? null;
}
