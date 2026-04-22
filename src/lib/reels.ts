import manifest from "./reels.json";

export interface Reel {
  reel_id: string;
  file_path: string;
  title: string;
  creator: string;
  category: string;
  runtime: number; // seconds
}

// Voter clients must never see file_path (spec §1.3).
export type VoterReel = Omit<Reel, "file_path">;

export const REELS: readonly Reel[] = manifest as Reel[];

export const VOTER_REELS: readonly VoterReel[] = REELS.map(
  ({ file_path: _file_path, ...rest }) => rest,
);

export function findReel(reelId: string | null | undefined): Reel | null {
  if (!reelId) return null;
  return REELS.find((r) => r.reel_id === reelId) ?? null;
}

export function findVoterReel(
  reelId: string | null | undefined,
): VoterReel | null {
  if (!reelId) return null;
  return VOTER_REELS.find((r) => r.reel_id === reelId) ?? null;
}

export function formatRuntime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
