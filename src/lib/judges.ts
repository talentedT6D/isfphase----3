// The festival's main judges. They sign in on /judge with a shared password
// and then pick their name. Each judge has a fixed id so their votes land in
// the same `votes` table as the audience but stay individually attributable
// and separable on the results page.
//
// The ids are fixed UUIDs (valid whether the votes.user_id column is `uuid`
// or `text`). They are also referenced by supabase-migration-judges.sql,
// which grants these ids permission to insert votes — keep the two in sync.

export interface Judge {
  id: string;
  name: string;
}

export const JUDGES: readonly Judge[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Zervaan Bunshah" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Vir Saini" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Gajraj Rao" },
];

export const JUDGE_IDS: readonly string[] = JUDGES.map((j) => j.id);

export function isJudgeId(userId: string | null | undefined): boolean {
  return !!userId && JUDGE_IDS.includes(userId);
}

// Each judge's password is the first two letters of their name + "2107"
// (e.g. "Zervaan Bunshah" -> "ze2107"). Compared case-insensitively.
export function judgePassword(judge: Judge): string {
  return judge.name.slice(0, 2).toLowerCase() + "2107";
}

export function checkJudgePassword(judge: Judge, input: string): boolean {
  return input.trim().toLowerCase() === judgePassword(judge);
}
