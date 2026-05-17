"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { REELS } from "@/lib/reels";
import { JUDGES, JUDGE_IDS } from "@/lib/judges";

const LEADERBOARD_PASSWORD = "leadstack";
const LEADERBOARD_KEY = "isf-leaderboard-ok";

interface RawVote {
  user_id: string;
  reel_id: string;
  score: number;
}

interface ReelResult {
  reel_id: string;
  title: string;
  creator: string;
  judgeScores: (number | null)[]; // one slot per judge, in JUDGES order
  judgeAvg: number | null;
  // Position when reels are ranked by judge average alone. Null until at
  // least one judge has scored the reel.
  judgeRank: number | null;
  audienceAvg: number | null;
  // Position when reels are ranked by audience average alone. Null until at
  // least one audience member has scored the reel.
  audienceRank: number | null;
  audienceCount: number;
  // (sum of all judge scores + audience avg) / (judge count + 1).
  // Missing judge scores count as 0; audience avg falls back to 0 if no
  // one has voted yet.
  total: number;
}

const JUDGE_ID_SET = new Set(JUDGE_IDS);

export default function LeaderboardPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(
      typeof window !== "undefined" &&
        window.localStorage.getItem(LEADERBOARD_KEY) === "1",
    );
  }, []);

  if (authed === null) return null;
  if (!authed) return <GateView onUnlock={() => setAuthed(true)} />;
  return <Results />;
}

function GateView({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === LEADERBOARD_PASSWORD) {
      window.localStorage.setItem(LEADERBOARD_KEY, "1");
      onUnlock();
    } else {
      setErr("Wrong password");
    }
  };
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 font-mono">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-stone-300 p-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ISF" className="h-10 w-auto mb-4" />
        <div className="text-[10px] tracking-[0.3em] text-stone-500 mb-2">
          RESULTS
        </div>
        <h1 className="text-lg font-semibold text-stone-900 mb-4">Unlock</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr("");
          }}
          autoFocus
          placeholder="Password"
          className="w-full border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
        />
        {err && <p className="text-red-600 text-xs mt-2">{err}</p>}
        <button
          type="submit"
          className="w-full mt-4 py-2 bg-stone-900 text-white text-sm"
        >
          Enter
        </button>
      </form>
    </div>
  );
}

function Results() {
  const [votes, setVotes] = useState<RawVote[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("user_id, reel_id, score");
      if (cancelled) return;
      if (error) {
        console.error("[leaderboard] load failed", error);
        return;
      }
      setVotes((data as RawVote[]) ?? []);
      setLoaded(true);
    };
    load();
    const ch = supabase
      .channel("leaderboard-votes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  const results = useMemo<ReelResult[]>(() => {
    const rows = REELS.map((reel) => {
      const forReel = votes.filter((v) => v.reel_id === reel.reel_id);
      const judgeVotes = forReel.filter((v) => JUDGE_ID_SET.has(v.user_id));
      const audienceVotes = forReel.filter(
        (v) => !JUDGE_ID_SET.has(v.user_id),
      );

      const judgeScores = JUDGES.map((j) => {
        const v = judgeVotes.find((row) => row.user_id === j.id);
        return v ? v.score : null;
      });
      const castJudgeScores = judgeScores.filter(
        (s): s is number => s !== null,
      );
      const judgeAvg = castJudgeScores.length
        ? castJudgeScores.reduce((a, b) => a + b, 0) / castJudgeScores.length
        : null;
      const audienceAvg = audienceVotes.length
        ? audienceVotes.reduce((a, b) => a + b.score, 0) /
          audienceVotes.length
        : null;

      // Missing judge votes count as 0 in the total. Audience falls back
      // to 0 too if nobody has voted yet, so the total is always shown.
      const judgeSumForTotal = judgeScores.reduce<number>(
        (acc, s) => acc + (s ?? 0),
        0,
      );
      const total =
        (judgeSumForTotal + (audienceAvg ?? 0)) / (JUDGES.length + 1);

      return {
        reel_id: reel.reel_id,
        title: reel.title,
        creator: reel.creator,
        judgeScores,
        judgeAvg,
        judgeRank: null as number | null,
        audienceAvg,
        audienceRank: null as number | null,
        audienceCount: audienceVotes.length,
        total,
      };
    });

    // Rank by judge average alone, then stamp each reel with its position.
    [...rows]
      .filter((r) => r.judgeAvg !== null)
      .sort((a, b) => (b.judgeAvg ?? 0) - (a.judgeAvg ?? 0))
      .forEach((r, i) => {
        r.judgeRank = i + 1;
      });

    // Same, ranked by audience average alone.
    [...rows]
      .filter((r) => r.audienceAvg !== null)
      .sort((a, b) => (b.audienceAvg ?? 0) - (a.audienceAvg ?? 0))
      .forEach((r, i) => {
        r.audienceRank = i + 1;
      });

    return rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const ja = a.judgeAvg ?? -1;
      const jb = b.judgeAvg ?? -1;
      if (jb !== ja) return jb - ja;
      return (b.audienceAvg ?? -1) - (a.audienceAvg ?? -1);
    });
  }, [votes]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-mono">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-300 bg-white text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ISF" className="h-5 w-auto" />
        <span className="font-semibold tracking-wider">RESULTS</span>
        <span className="text-stone-400">· judges vs. audience</span>
      </div>

      <section className="p-5">
        <div className="max-w-4xl mx-auto">
          <header className="mb-3">
            <h1 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
              REEL RANKING · BY TOTAL SCORE
            </h1>
          </header>

          {!loaded ? (
            <div className="text-sm text-stone-500">Loading results…</div>
          ) : (
            <div className="bg-white border border-stone-300 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-300 text-stone-500 text-left">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Reel</th>
                    {JUDGES.map((j) => (
                      <th
                        key={j.id}
                        className="px-3 py-2 font-semibold text-right whitespace-nowrap"
                      >
                        {j.name}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                      Judge avg · rank
                    </th>
                    <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">
                      Audience avg · rank · n
                    </th>
                    <th className="px-3 py-2 font-semibold text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {results.map((r, i) => (
                    <tr key={r.reel_id}>
                      <td className="px-3 py-2.5 text-stone-400">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-sm">
                          {r.title}
                        </div>
                        <div className="text-stone-500">{r.creator}</div>
                      </td>
                      {r.judgeScores.map((s, idx) => (
                        <td
                          key={JUDGES[idx].id}
                          className="px-3 py-2.5 text-right tabular-nums"
                        >
                          {s === null ? (
                            <span className="text-stone-300">—</span>
                          ) : (
                            <span className="font-semibold">{s}</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-stone-900 whitespace-nowrap">
                        {r.judgeAvg === null ? (
                          <span className="text-stone-300">—</span>
                        ) : (
                          <>
                            {r.judgeAvg.toFixed(1)}
                            {r.judgeRank !== null && (
                              <span className="text-stone-400 font-normal">
                                {" · #"}
                                {r.judgeRank}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-stone-600 whitespace-nowrap">
                        {r.audienceAvg === null ? (
                          <span className="text-stone-300">—</span>
                        ) : (
                          <>
                            {r.audienceAvg.toFixed(1)}
                            {r.audienceRank !== null && (
                              <span className="text-stone-400">
                                {" · #"}
                                {r.audienceRank}
                              </span>
                            )}
                            <span className="text-stone-400">
                              {" · "}
                              {r.audienceCount}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-stone-900">
                        {r.total.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[10px] text-stone-400 tracking-wider">
            Total = (sum of the {JUDGES.length} judge scores + audience avg) ÷{" "}
            {JUDGES.length + 1}. Missing judge votes count as 0. Audience avg
            also shows the number of audience votes. Updates live.
          </p>
        </div>
      </section>
    </div>
  );
}
