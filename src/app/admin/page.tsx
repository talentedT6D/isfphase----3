"use client";

import { useEffect, useMemo, useState } from "react";
import {
  INITIAL_PLAYBACK,
  INITIAL_VOTING,
  usePlaybackBroadcaster,
  useVotingBroadcaster,
  type PlaybackState,
  type VotingState,
} from "@/lib/channels";
import { REELS, findReel, formatRuntime } from "@/lib/reels";
import { supabase } from "@/lib/supabase";

const ADMIN_PASSWORD = "admin123";
const ADMIN_KEY = "isf-admin-ok";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(
      typeof window !== "undefined" &&
        window.localStorage.getItem(ADMIN_KEY) === "1",
    );
  }, []);

  if (authed === null) return null;
  if (!authed) return <GateView onUnlock={() => setAuthed(true)} />;
  return <Panel />;
}

function GateView({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      window.localStorage.setItem(ADMIN_KEY, "1");
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
        <div className="text-[10px] tracking-[0.3em] text-stone-500 mb-2">
          ISF 2026 · ADMIN
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

function Panel() {
  const { state: playback, broadcast: sendPlayback } =
    usePlaybackBroadcaster(INITIAL_PLAYBACK);
  const { state: voting, broadcast: sendVoting } =
    useVotingBroadcaster(INITIAL_VOTING);

  // Admin keeps its own queue pointers, independent of state
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [votingIdx, setVotingIdx] = useState(0);
  const [prevVotingReel, setPrevVotingReel] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REELS;
    return REELS.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.creator.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q),
    );
  }, [query]);

  const playbackReel = REELS[playbackIdx] ?? null;
  const playbackNext = REELS[playbackIdx + 1] ?? null;
  const votingReel = REELS[votingIdx] ?? null;
  const votingNext = REELS[votingIdx + 1] ?? null;

  // Voting actions (declared first so playback actions can reuse openVoting)
  const openVoting = (idx: number) => {
    const reel = REELS[idx];
    if (!reel) return;
    if (voting.reel_id && voting.reel_id !== reel.reel_id) {
      setPrevVotingReel(voting.reel_id);
    }
    setVotingIdx(idx);
    sendVoting({
      reel_id: reel.reel_id,
      status: "open",
      opened_at: Date.now(),
      closed_at: null,
    });
  };

  // Playback actions
  const cueAndPlay = (idx: number) => {
    const reel = REELS[idx];
    if (!reel) return;
    setPlaybackIdx(idx);
    sendPlayback({
      reel_id: reel.reel_id,
      status: "playing",
      timestamp: Date.now(),
    });
  };
  const onPlay = () => {
    if (!playbackReel) return;
    sendPlayback({
      reel_id: playbackReel.reel_id,
      status: "playing",
      timestamp: Date.now(),
    });
  };
  const onPause = () => {
    if (!playbackReel) return;
    sendPlayback({
      reel_id: playbackReel.reel_id,
      status: "paused",
      timestamp: Date.now(),
    });
  };
  const onStop = () => {
    sendPlayback({ reel_id: null, status: "stopped", timestamp: Date.now() });
  };
  const onPrev = () => {
    const idx = Math.max(0, playbackIdx - 1);
    cueAndPlay(idx);
    openVoting(idx);
  };
  const onNext = () => {
    const idx = Math.min(REELS.length - 1, playbackIdx + 1);
    cueAndPlay(idx);
    openVoting(idx);
  };
  const closeVotingAndAdvance = () => {
    if (voting.reel_id) setPrevVotingReel(voting.reel_id);
    sendVoting({
      ...voting,
      status: "closed",
      closed_at: Date.now(),
    });
    setVotingIdx((i) => Math.min(REELS.length - 1, i + 1));
  };
  const pauseVoting = () => {
    sendVoting({ ...voting, status: "closed", closed_at: Date.now() });
  };
  const reopenPrevious = () => {
    if (!prevVotingReel) return;
    sendVoting({
      reel_id: prevVotingReel,
      status: "open",
      opened_at: Date.now(),
      closed_at: null,
    });
    const idx = REELS.findIndex((r) => r.reel_id === prevVotingReel);
    if (idx >= 0) setVotingIdx(idx);
  };
  const changeNextVoting = () => {
    setVotingIdx((i) => Math.min(REELS.length - 1, i + 1));
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-mono">
      <TopBar playback={playback} voting={voting} />
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-stone-300 border-b border-stone-300">
        <PlaybackZone
          reel={playbackReel}
          next={playbackNext}
          state={playback}
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
          onPrev={onPrev}
          onNext={onNext}
          onCueFromLibrary={() => cueAndPlay(playbackIdx)}
        />
        <VotingZone
          reel={votingReel}
          next={votingNext}
          state={voting}
          onOpen={() => openVoting(votingIdx)}
          onCloseAdvance={closeVotingAndAdvance}
          onPause={pauseVoting}
          onReopenPrev={reopenPrevious}
          onChangeNext={changeNextVoting}
        />
      </div>
      <Library
        query={query}
        onQueryChange={setQuery}
        reels={filtered}
        playbackReelId={playbackReel?.reel_id ?? null}
        votingReelId={votingReel?.reel_id ?? null}
        onCuePlayback={(idx) => cueAndPlay(idx)}
        onQueueVoting={(idx) => setVotingIdx(idx)}
      />
      <VoterList
        reelId={voting.reel_id}
        reelTitle={findReel(voting.reel_id)?.title ?? null}
      />
    </div>
  );
}

function TopBar({
  playback,
  voting,
}: {
  playback: PlaybackState;
  voting: VotingState;
}) {
  const logout = () => {
    window.localStorage.removeItem(ADMIN_KEY);
    location.reload();
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-300 bg-white text-xs">
      <div className="flex items-center gap-4">
        <span className="font-semibold tracking-wider">ISF · ADMIN</span>
        <span className="flex items-center gap-1.5 text-stone-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Supabase connected
        </span>
        <span className="text-stone-400">·</span>
        <span className="text-stone-600">{REELS.length} reels loaded</span>
        <span className="text-stone-400">·</span>
        <span className="text-stone-600">
          Playback {playback.status} · Voting {voting.status}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="/leaderboard"
          target="_blank"
          rel="noreferrer"
          className="text-stone-700 hover:text-stone-900 underline underline-offset-2"
        >
          Leaderboard ↗
        </a>
        <button
          onClick={logout}
          className="text-stone-600 hover:text-stone-900"
        >
          Lock
        </button>
      </div>
    </div>
  );
}

function PlaybackZone({
  reel,
  next,
  state,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  onCueFromLibrary,
}: {
  reel: ReturnType<typeof findReel>;
  next: ReturnType<typeof findReel>;
  state: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCueFromLibrary: () => void;
}) {
  const playing = state.status === "playing";
  return (
    <section className="p-5 bg-white">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-wider">
          PLAYBACK CONTROL
        </h2>
        <span className="text-[10px] text-stone-500 tracking-wider">
          DRIVES HALL SCREEN
        </span>
      </header>

      <Card label="NOW PLAYING ON STAGE" live={playing}>
        {reel ? (
          <>
            <div className="text-xs text-stone-500">
              {reel.category} · {formatRuntime(reel.runtime)}
            </div>
            <div className="text-lg font-semibold mt-1">{reel.title}</div>
            <div className="text-sm text-stone-600">by {reel.creator}</div>
          </>
        ) : (
          <div className="text-sm text-stone-500">No reel cued.</div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 mt-4">
        <Btn onClick={onPrev}>⏮ Prev</Btn>
        {playing ? (
          <Btn onClick={onPause} primary>
            ⏸ Pause
          </Btn>
        ) : (
          <Btn onClick={onPlay} primary>
            ▶ Play
          </Btn>
        )}
        <Btn onClick={onNext}>⏭ Next</Btn>
        <Btn onClick={onStop}>⏹ Stop</Btn>
        <Btn onClick={onCueFromLibrary}>Cue from library</Btn>
      </div>

      <div className="mt-5">
        <Card label="UP NEXT">
          {next ? (
            <>
              <div className="text-xs text-stone-500">
                {next.category} · {formatRuntime(next.runtime)}
              </div>
              <div className="text-base font-semibold mt-1">{next.title}</div>
              <div className="text-sm text-stone-600">by {next.creator}</div>
            </>
          ) : (
            <div className="text-sm text-stone-500">End of playlist.</div>
          )}
        </Card>
      </div>
    </section>
  );
}

function VotingZone({
  reel,
  next,
  state,
  onOpen,
  onCloseAdvance,
  onPause,
  onReopenPrev,
  onChangeNext,
}: {
  reel: ReturnType<typeof findReel>;
  next: ReturnType<typeof findReel>;
  state: VotingState;
  onOpen: () => void;
  onCloseAdvance: () => void;
  onPause: () => void;
  onReopenPrev: () => void;
  onChangeNext: () => void;
}) {
  const isOpen = state.status === "open";
  const stats = useVoteStats(isOpen ? state.reel_id : null);

  return (
    <section className="p-5 bg-white">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-wider">
          VOTING CONTROL
        </h2>
        <span className="text-[10px] text-stone-500 tracking-wider">
          DRIVES VOTER PHONES
        </span>
      </header>

      <Card
        label={isOpen ? "CURRENTLY OPEN FOR VOTING" : "VOTING IDLE"}
        live={isOpen}
      >
        {reel ? (
          <>
            <div className="text-xs text-stone-500">{reel.category}</div>
            <div className="text-lg font-semibold mt-1">{reel.title}</div>
            <div className="text-sm text-stone-600">by {reel.creator}</div>
          </>
        ) : (
          <div className="text-sm text-stone-500">No reel queued.</div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
          <Stat label="Votes cast" value={stats.count.toString()} />
          <Stat
            label="Avg score"
            value={stats.count ? stats.avg.toFixed(1) : "—"}
          />
          <Stat
            label="Top reaction"
            value={stats.topReaction ?? "—"}
          />
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 mt-4">
        {!isOpen && (
          <Btn onClick={onOpen} primary>
            Open voting
          </Btn>
        )}
        {isOpen && (
          <Btn onClick={onCloseAdvance} primary>
            Close &amp; advance
          </Btn>
        )}
        <Btn onClick={onPause}>Pause voting</Btn>
        <Btn onClick={onReopenPrev}>Re-open previous</Btn>
      </div>

      <div className="mt-5">
        <Card label="UP NEXT FOR VOTING">
          {next ? (
            <>
              <div className="text-xs text-stone-500">{next.category}</div>
              <div className="text-base font-semibold mt-1">{next.title}</div>
              <div className="text-sm text-stone-600">by {next.creator}</div>
              <div className="mt-3">
                <Btn onClick={onChangeNext}>Change next reel</Btn>
              </div>
            </>
          ) : (
            <div className="text-sm text-stone-500">End of queue.</div>
          )}
        </Card>
      </div>
    </section>
  );
}

function Library({
  query,
  onQueryChange,
  reels,
  playbackReelId,
  votingReelId,
  onCuePlayback,
  onQueueVoting,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  reels: readonly (typeof REELS)[number][];
  playbackReelId: string | null;
  votingReelId: string | null;
  onCuePlayback: (idx: number) => void;
  onQueueVoting: (idx: number) => void;
}) {
  return (
    <section className="p-5 bg-stone-50">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wider">
          REEL LIBRARY · {REELS.length} TOTAL
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search title, creator, category…"
          className="border border-stone-300 px-2 py-1 text-xs bg-white w-64 focus:outline-none focus:border-stone-900"
        />
      </header>

      <div className="bg-white border border-stone-300 divide-y divide-stone-200">
        {reels.map((reel) => {
          const idx = REELS.indexOf(reel);
          const isPlayback = reel.reel_id === playbackReelId;
          const isVoting = reel.reel_id === votingReelId;
          return (
            <div
              key={reel.reel_id}
              className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-3 py-2 text-xs"
            >
              <span className="text-stone-400">#{idx + 1}</span>
              <div>
                <div className="font-semibold text-sm">{reel.title}</div>
                <div className="text-stone-500">
                  {reel.creator} · {reel.category} ·{" "}
                  {formatRuntime(reel.runtime)}
                </div>
              </div>
              <div className="flex gap-2">
                {isPlayback && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5">
                    on stage
                  </span>
                )}
                {isVoting && (
                  <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5">
                    voting
                  </span>
                )}
                <Btn onClick={() => onCuePlayback(idx)} small>
                  Cue playback
                </Btn>
                <Btn onClick={() => onQueueVoting(idx)} small>
                  Queue voting
                </Btn>
              </div>
            </div>
          );
        })}
        {reels.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-stone-500">
            No reels match “{query}”.
          </div>
        )}
      </div>
    </section>
  );
}

function Card({
  label,
  live,
  children,
}: {
  label: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-stone-300 bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-200 text-[10px] tracking-wider text-stone-500">
        <span>{label}</span>
        {live && (
          <span className="flex items-center gap-1 text-red-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-200 px-2 py-1.5 bg-stone-50">
      <div className="text-[10px] text-stone-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  const base = small ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  const cls = primary
    ? "bg-stone-900 text-white hover:bg-stone-700"
    : "bg-white border border-stone-300 text-stone-800 hover:bg-stone-100";
  return (
    <button onClick={onClick} className={`${base} ${cls} transition-colors`}>
      {children}
    </button>
  );
}

// Live vote aggregate for a single reel. Uses Realtime on the votes table
// (admin role reads via RLS policy you enable in supabase-setup.sql).
function useVoteStats(reelId: string | null) {
  const [stats, setStats] = useState<{
    count: number;
    avg: number;
    topReaction: string | null;
  }>({ count: 0, avg: 0, topReaction: null });

  useEffect(() => {
    if (!reelId) {
      setStats({ count: 0, avg: 0, topReaction: null });
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("votes")
        .select("score, reaction")
        .eq("reel_id", reelId);
      if (cancelled || !data) return;
      const count = data.length;
      const avg = count
        ? data.reduce((s, r) => s + (r.score as number), 0) / count
        : 0;
      const tally: Record<string, number> = {};
      for (const r of data) {
        const rx = (r as { reaction: string | null }).reaction;
        if (rx) tally[rx] = (tally[rx] ?? 0) + 1;
      }
      let top: string | null = null;
      let topN = 0;
      for (const [k, v] of Object.entries(tally)) {
        if (v > topN) {
          top = k;
          topN = v;
        }
      }
      setStats({ count, avg, topReaction: top });
    };
    load();
    const ch = supabase
      .channel(`votes-stats-${reelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `reel_id=eq.${reelId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [reelId]);

  return stats;
}

interface VoterRow {
  user_id: string;
  score: number;
  reaction: string | null;
  created_at: string;
}

function useVoters(reelId: string | null) {
  const [voters, setVoters] = useState<VoterRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!reelId) {
        if (!cancelled) setVoters([]);
        return;
      }
      const { data } = await supabase
        .from("votes")
        .select("user_id, score, reaction, created_at")
        .eq("reel_id", reelId)
        .order("created_at", { ascending: false });
      if (cancelled || !data) return;
      setVoters(data as VoterRow[]);
    };
    load();
    if (!reelId) {
      return () => {
        cancelled = true;
      };
    }
    const ch = supabase
      .channel(`votes-list-${reelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `reel_id=eq.${reelId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [reelId]);

  return voters;
}

function VoterList({
  reelId,
  reelTitle,
}: {
  reelId: string | null;
  reelTitle: string | null;
}) {
  const voters = useVoters(reelId);
  return (
    <section className="p-5 bg-white border-t border-stone-300">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wider">
          VOTERS {reelTitle ? `· ${reelTitle}` : ""} · {voters.length} TOTAL
        </h2>
        <span className="text-[10px] text-stone-500 tracking-wider">
          LIVE FROM SUPABASE
        </span>
      </header>
      {!reelId ? (
        <div className="text-sm text-stone-500">
          Open voting on a reel to see voters here.
        </div>
      ) : voters.length === 0 ? (
        <div className="text-sm text-stone-500">No votes yet.</div>
      ) : (
        <div className="bg-white border border-stone-300 divide-y divide-stone-200">
          {voters.map((v, i) => (
            <div
              key={`${v.user_id}-${v.created_at}`}
              className="grid grid-cols-[3rem_1fr_5rem_5rem] items-center gap-3 px-3 py-2 text-xs"
            >
              <span className="text-stone-400">#{i + 1}</span>
              <span className="font-mono text-sm">
                {v.user_id.slice(0, 8)}
              </span>
              <span className="text-stone-600">{v.reaction ?? "—"}</span>
              <span className="font-mono tabular-nums text-right">
                {v.score}/100
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
