import manifest from "./non-votable.json";
import { REELS } from "./reels";
import { LOADING_ANIM } from "./loading-anim";
import { CAUGHT_UP, WINNER_FINAL_REELS } from "./cast-content";

// Videos that get cast to the hall screen but are NOT open for voting.
// Drop the file in public/non-votable-videos/ and add an entry here. While
// one is on the big screen, the audience sees a fixed "This video is not an
// entry" message instead of the voting slider.
export interface NonVotableReel {
  reel_id: string;
  file_path: string;
  title: string;
  runtime: number;
}

export const NON_VOTABLE_REELS: readonly NonVotableReel[] =
  manifest as NonVotableReel[];

// The orange filler clip is the new "blank" state for the hall — it plays
// muted/looping whenever nothing else is cued and is one-click castable
// from admin's Pin Orange button.
export const ORANGE_FILLER: NonVotableReel | null =
  NON_VOTABLE_REELS.find((r) => r.title === "Orange filler screen") ??
  NON_VOTABLE_REELS.find((r) => r.reel_id === "nv-009") ??
  null;

export function findNonVotableReel(
  reelId: string | null | undefined,
): NonVotableReel | null {
  if (!reelId) return null;
  return NON_VOTABLE_REELS.find((r) => r.reel_id === reelId) ?? null;
}

// True for anything cast to the hall that should leave the audience on the
// "This video is not an entry" screen — the non-votable videos plus the
// caught-up image and winner-final clips.
export function isCastOnly(reelId: string | null | undefined): boolean {
  if (!reelId) return false;
  if (reelId === CAUGHT_UP.reel_id) return true;
  if (WINNER_FINAL_REELS.some((r) => r.reel_id === reelId)) return true;
  return NON_VOTABLE_REELS.some((r) => r.reel_id === reelId);
}

// Resolve a broadcast reel_id to whatever the hall should play. Includes a
// `loop` flag for items that should loop forever until something else is
// cast (Mood gradient and winner-final clips).
export interface PlayableInfo {
  reel_id: string;
  file_path: string;
  loop?: boolean;
}

export function findPlayable(
  reelId: string | null | undefined,
): PlayableInfo | null {
  if (!reelId) return null;
  if (reelId === LOADING_ANIM.reel_id) return LOADING_ANIM;
  const wf = WINNER_FINAL_REELS.find((r) => r.reel_id === reelId);
  if (wf) return { ...wf, loop: true };
  return (
    REELS.find((r) => r.reel_id === reelId) ??
    NON_VOTABLE_REELS.find((r) => r.reel_id === reelId) ??
    null
  );
}

// Full show order: all non-votable videos play first (no interstitials
// between them), then every votable reel. Used by admin's prev/next and the
// hall's auto-advance.
export function showOrderNext(
  currentReelId: string | null | undefined,
): { reel_id: string; isVotable: boolean } | null {
  if (!currentReelId) return null;
  const nvIdx = NON_VOTABLE_REELS.findIndex((r) => r.reel_id === currentReelId);
  if (nvIdx >= 0) {
    if (nvIdx + 1 < NON_VOTABLE_REELS.length) {
      return {
        reel_id: NON_VOTABLE_REELS[nvIdx + 1].reel_id,
        isVotable: false,
      };
    }
    return REELS[0]
      ? { reel_id: REELS[0].reel_id, isVotable: true }
      : null;
  }
  const vIdx = REELS.findIndex((r) => r.reel_id === currentReelId);
  if (vIdx >= 0 && vIdx + 1 < REELS.length) {
    return { reel_id: REELS[vIdx + 1].reel_id, isVotable: true };
  }
  return null;
}
