import manifest from "./non-votable.json";
import { REELS } from "./reels";

// Videos that get cast to the hall screen but are NOT open for voting.
//
// To add one: drop its video file in public/non-votable-videos/ and add an
// entry here (via non-votable.json). `voter_text` is the message shown to
// the audience on their phones while this video is on the big screen — each
// non-votable video has its own text.
export interface NonVotableReel {
  reel_id: string;
  file_path: string;
  title: string;
  voter_text: string;
}

export const NON_VOTABLE_REELS: readonly NonVotableReel[] =
  manifest as NonVotableReel[];

export function findNonVotableReel(
  reelId: string | null | undefined,
): NonVotableReel | null {
  if (!reelId) return null;
  return NON_VOTABLE_REELS.find((r) => r.reel_id === reelId) ?? null;
}

// Resolve a broadcast reel_id to whatever is playable — a votable reel or a
// non-votable one. The hall screen only needs reel_id + file_path.
export function findPlayable(
  reelId: string | null | undefined,
): { reel_id: string; file_path: string } | null {
  if (!reelId) return null;
  return (
    REELS.find((r) => r.reel_id === reelId) ??
    NON_VOTABLE_REELS.find((r) => r.reel_id === reelId) ??
    null
  );
}
