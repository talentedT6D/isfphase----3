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
import {
  NON_VOTABLE_REELS,
  ORANGE_FILLER,
  type NonVotableReel,
} from "@/lib/non-votable";
import { LOADING_ANIM } from "@/lib/loading-anim";
import {
  CAUGHT_UP,
  WIFI_IMAGE,
  WINNER_FINAL_REELS,
  type WinnerFinalReel,
} from "@/lib/cast-content";
import { supabase } from "@/lib/supabase";

const ADMIN_PASSWORD = "adminstack";
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="ISF"
          className="h-10 w-auto mb-4"
        />
        <div className="text-[10px] tracking-[0.3em] text-stone-500 mb-2">
          ADMIN
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

  const [query, setQuery] = useState("");
  const [prevVotingReel, setPrevVotingReel] = useState<string | null>(null);

  // Track the last reel that had voting open, so we can re-open it after an
  // accidental close.
  useEffect(() => {
    if (voting.status === "open" && voting.reel_id) {
      setPrevVotingReel(voting.reel_id);
    }
  }, [voting.status, voting.reel_id]);

  const playbackIdx = useMemo(
    () => REELS.findIndex((r) => r.reel_id === playback.reel_id),
    [playback.reel_id],
  );
  // What's currently on the hall screen — votable reel or non-votable cast.
  // Synthesises a minimal Reel shape for non-votable items so the existing
  // play/pause/seek controls just work.
  const playbackReel = useMemo(() => {
    if (playbackIdx >= 0) return REELS[playbackIdx];
    const nv = NON_VOTABLE_REELS.find(
      (r) => r.reel_id === playback.reel_id,
    );
    if (nv) {
      return {
        reel_id: nv.reel_id,
        file_path: nv.file_path,
        title: nv.title,
        creator: "Non-votable",
        category: "Cast",
        runtime: nv.runtime,
      };
    }
    return null;
  }, [playbackIdx, playback.reel_id]);
  const nextReel =
    playbackIdx >= 0 ? REELS[playbackIdx + 1] ?? null : REELS[0] ?? null;

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

  // Locally-tracked estimate of where the hall video is right now, in seconds.
  // Drives the seek bar without needing the hall to report back.
  const [estimated, setEstimated] = useState(playback.position);
  useEffect(() => {
    setEstimated(playback.position);
    if (playback.status !== "playing") return;
    const runtime =
      playbackReel?.runtime ??
      (playback.reel_id === LOADING_ANIM.reel_id
        ? LOADING_ANIM.runtime
        : null);
    if (!runtime) return;
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - playback.timestamp) / 1000;
      setEstimated(Math.min(playback.position + elapsed, runtime));
    }, 250);
    return () => window.clearInterval(id);
  }, [playback, playbackReel]);

  // One-shot action: cue a reel, start it on the hall screen, and open voting.
  const playReel = (idx: number) => {
    const reel = REELS[idx];
    if (!reel) return;
    sendPlayback({
      reel_id: reel.reel_id,
      status: "playing",
      timestamp: Date.now(),
      position: 0,
    });
    sendVoting({
      reel_id: reel.reel_id,
      status: "open",
      opened_at: Date.now(),
      closed_at: null,
    });
  };

  // Cast any item to the hall screen without opening voting.
  const castIdle = (reelId: string) => {
    sendPlayback({
      reel_id: reelId,
      status: "playing",
      timestamp: Date.now(),
      position: 0,
    });
    sendVoting({
      reel_id: null,
      status: "idle",
      opened_at: null,
      closed_at: null,
    });
  };

  const castNonVotable = (idx: number) => {
    const reel = NON_VOTABLE_REELS[idx];
    if (!reel) return;
    castIdle(reel.reel_id);
  };

  const castCaughtUp = () => castIdle(CAUGHT_UP.reel_id);
  const castWifi = () => castIdle(WIFI_IMAGE.reel_id);

  // Quick "pin the orange filler to the hall" action — same effect as
  // casting the Orange filler screen from the non-votable list but
  // accessible from the always-visible top bar.
  const pinOrange = () => {
    if (ORANGE_FILLER) castIdle(ORANGE_FILLER.reel_id);
  };

  const castWinnerFinal = (idx: number) => {
    const reel = WINNER_FINAL_REELS[idx];
    if (!reel) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Cast "${reel.title}" as the WINNER? It will loop on the hall screen until you cast something else.`,
      )
    ) {
      return;
    }
    castIdle(reel.reel_id);
  };

  // Auto-advance lives on the hall page: it fires off the video element's
  // actual `ended` event, which is more accurate than running it off a
  // clock here (the manifest's Duration is rounded to whole seconds, so a
  // clock-based trigger would cut reels off ~1 second early).

  const onPlayPause = () => {
    if (!playbackReel) {
      playReel(0);
      return;
    }
    sendPlayback({
      reel_id: playbackReel.reel_id,
      status: playback.status === "playing" ? "paused" : "playing",
      timestamp: Date.now(),
      position: estimated,
    });
  };

  const onPrev = () => {
    if (playbackIdx <= 0) return;
    playReel(playbackIdx - 1);
  };

  const onNext = () => {
    if (playbackIdx < 0) {
      playReel(0);
      return;
    }
    if (playbackIdx >= REELS.length - 1) return;
    playReel(playbackIdx + 1);
  };

  const onStop = () => {
    // "Stop" = pause-and-rewind: keep the reel on screen frozen on frame 0
    // instead of bouncing the hall to the holding slate.
    if (!playbackReel) return;
    sendPlayback({
      reel_id: playbackReel.reel_id,
      status: "paused",
      timestamp: Date.now(),
      position: 0,
    });
    if (voting.status === "open") {
      sendVoting({ ...voting, status: "closed", closed_at: Date.now() });
    }
  };

  const onSeek = (newPosition: number) => {
    if (!playbackReel) return;
    const clamped = Math.max(
      0,
      Math.min(newPosition, playbackReel.runtime),
    );
    sendPlayback({
      reel_id: playbackReel.reel_id,
      status: playback.status === "stopped" ? "playing" : playback.status,
      timestamp: Date.now(),
      position: clamped,
    });
  };

  const onSkip = (delta: number) => onSeek(estimated + delta);

  const toggleVoting = () => {
    if (!playbackReel) return;
    const isOpenForCurrent =
      voting.status === "open" && voting.reel_id === playbackReel.reel_id;
    if (isOpenForCurrent) {
      sendVoting({ ...voting, status: "closed", closed_at: Date.now() });
    } else {
      sendVoting({
        reel_id: playbackReel.reel_id,
        status: "open",
        opened_at: Date.now(),
        closed_at: null,
      });
    }
  };

  const reopenPrevVoting = () => {
    if (!prevVotingReel) return;
    sendVoting({
      reel_id: prevVotingReel,
      status: "open",
      opened_at: Date.now(),
      closed_at: null,
    });
  };

  const canReopenPrev =
    !!prevVotingReel &&
    !(voting.status === "open" && voting.reel_id === prevVotingReel);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-mono">
      <TopBar
        playback={playback}
        voting={voting}
        onPinOrange={pinOrange}
        orangePinned={
          !!ORANGE_FILLER && playback.reel_id === ORANGE_FILLER.reel_id
        }
      />
      <NowShowing
        reel={playbackReel}
        next={nextReel}
        playback={playback}
        voting={voting}
        estimated={estimated}
        onPlayPause={onPlayPause}
        onPrev={onPrev}
        onNext={onNext}
        onStop={onStop}
        onSeek={onSeek}
        onSkip={onSkip}
        onToggleVoting={toggleVoting}
        onReopenPrevVoting={reopenPrevVoting}
        canReopenPrev={canReopenPrev}
      />
      {/* Sections are laid out in run-of-show order: pre-show non-votable
          assets, then the shortlist (votable), then the caught-up image,
          then the winner reveal clips. */}
      <NonVotableLibrary
        reels={NON_VOTABLE_REELS}
        castReelId={playback.reel_id}
        onCast={castNonVotable}
      />
      <ImageCastLibrary
        title="WI-FI INFO"
        rowTitle={WIFI_IMAGE.title}
        rowSubtitle="Image stays on screen until you cast something else"
        active={playback.reel_id === WIFI_IMAGE.reel_id}
        onCast={castWifi}
      />
      <Library
        query={query}
        onQueryChange={setQuery}
        reels={filtered}
        playbackReelId={playbackReel?.reel_id ?? null}
        onPlay={playReel}
      />
      <CaughtUpLibrary
        active={playback.reel_id === CAUGHT_UP.reel_id}
        onCast={castCaughtUp}
      />
      <WinnerFinalLibrary
        reels={WINNER_FINAL_REELS}
        castReelId={playback.reel_id}
        onCast={castWinnerFinal}
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
  onPinOrange,
  orangePinned,
}: {
  playback: PlaybackState;
  voting: VotingState;
  onPinOrange: () => void;
  orangePinned: boolean;
}) {
  const logout = () => {
    window.localStorage.removeItem(ADMIN_KEY);
    location.reload();
  };
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-stone-300 bg-white text-xs">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ISF" className="h-5 w-auto" />
        <span className="font-semibold tracking-wider">ADMIN</span>
        <Pill tone={playback.status === "playing" ? "live" : "muted"}>
          {playback.status === "playing"
            ? "On stage"
            : playback.status === "paused"
              ? "Paused"
              : "Off air"}
        </Pill>
        <Pill tone={voting.status === "open" ? "vote" : "muted"}>
          {voting.status === "open" ? "Voting open" : "Voting closed"}
        </Pill>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onPinOrange}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-opacity hover:opacity-90 active:scale-95"
          style={{
            backgroundColor: "#FF7A00",
            color: orangePinned ? "#fff" : "#1c1917",
            boxShadow: orangePinned ? "0 0 0 2px #1c1917" : "none",
          }}
        >
          {orangePinned ? "Orange Pinned" : "Pin Orange"}
        </button>
        <a
          href="/leaderboard"
          target="_blank"
          rel="noreferrer"
          className="text-stone-600 hover:text-stone-900 underline underline-offset-2"
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

function Pill({
  tone,
  children,
}: {
  tone: "live" | "vote" | "muted";
  children: React.ReactNode;
}) {
  const map = {
    live: "bg-emerald-100 text-emerald-800",
    vote: "bg-sky-100 text-sky-800",
    muted: "bg-stone-100 text-stone-600",
  } as const;
  return (
    <span
      className={`${map[tone]} px-2 py-0.5 rounded-full text-[10px] tracking-wider`}
    >
      {children}
    </span>
  );
}

function NowShowing({
  reel,
  next,
  playback,
  voting,
  estimated,
  onPlayPause,
  onPrev,
  onNext,
  onStop,
  onSeek,
  onSkip,
  onToggleVoting,
  onReopenPrevVoting,
  canReopenPrev,
}: {
  reel: ReturnType<typeof findReel>;
  next: ReturnType<typeof findReel>;
  playback: PlaybackState;
  voting: VotingState;
  estimated: number;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (deltaSeconds: number) => void;
  onToggleVoting: () => void;
  onReopenPrevVoting: () => void;
  canReopenPrev: boolean;
}) {
  const playing = playback.status === "playing";
  const votingOpen =
    voting.status === "open" && voting.reel_id === reel?.reel_id;
  const stats = useVoteStats(votingOpen ? voting.reel_id : null);

  return (
    <section className="p-5 bg-white border-b border-stone-300">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
            {reel ? "NOW SHOWING" : "READY"}
          </h2>
          {reel && next && (
            <span className="text-[10px] text-stone-400 tracking-wider">
              UP NEXT · {next.title}
            </span>
          )}
        </div>

        <div className="border border-stone-300 bg-stone-50 p-5">
          {reel ? (
            <>
              <div className="text-[10px] tracking-wider text-stone-500 mb-1">
                {reel.category} · {formatRuntime(reel.runtime)}
              </div>
              <div className="text-2xl font-semibold">{reel.title}</div>
              <div className="text-stone-600">by {reel.creator}</div>
            </>
          ) : (
            <div className="text-stone-500 text-sm">
              Hit Play to start with the first reel, or pick one from the
              library below.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          <BigBtn
            onClick={onPrev}
            disabled={!reel || playback.reel_id === REELS[0]?.reel_id}
          >
            ⏮ Prev
          </BigBtn>
          <BigBtn onClick={() => onSkip(-10)} disabled={!reel}>
            −10s
          </BigBtn>
          <BigBtn onClick={onPlayPause} primary>
            {playing ? "⏸ Pause" : "▶ Play"}
          </BigBtn>
          <BigBtn onClick={() => onSkip(10)} disabled={!reel}>
            +10s
          </BigBtn>
          <BigBtn
            onClick={onNext}
            disabled={
              reel != null &&
              playback.reel_id === REELS[REELS.length - 1]?.reel_id
            }
          >
            ⏭ Next
          </BigBtn>
          <BigBtn onClick={onStop} disabled={!reel}>
            ⏹ Stop
          </BigBtn>
        </div>

        {reel && (
          <div className="mt-5 border-t border-stone-200 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5 text-xs text-stone-600">
              <span>
                <b className="text-stone-900">{stats.count}</b> votes
              </span>
              <span>
                avg{" "}
                <b className="text-stone-900">
                  {stats.count ? stats.avg.toFixed(1) : "—"}
                </b>
              </span>
              <span>
                top{" "}
                <b className="text-stone-900">{stats.topReaction ?? "—"}</b>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canReopenPrev && (
                <button
                  onClick={onReopenPrevVoting}
                  className="px-3 py-2 text-xs font-medium border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
                >
                  Re-open previous
                </button>
              )}
              <button
                onClick={onToggleVoting}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  votingOpen
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-stone-900 text-white hover:bg-stone-700"
                }`}
              >
                {votingOpen ? "Close voting" : "Open voting"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BigBtn({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const cls = primary
    ? "bg-stone-900 text-white hover:bg-stone-700"
    : "bg-white border border-stone-300 text-stone-800 hover:bg-stone-100";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${cls} px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Library({
  query,
  onQueryChange,
  reels,
  playbackReelId,
  onPlay,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  reels: readonly (typeof REELS)[number][];
  playbackReelId: string | null;
  onPlay: (idx: number) => void;
}) {
  return (
    <section className="p-5 bg-stone-50">
      <header className="flex items-center justify-between mb-3 max-w-3xl mx-auto">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
          REEL LIBRARY · {REELS.length}
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search title, creator, category…"
          className="border border-stone-300 px-3 py-1.5 text-sm bg-white w-64 focus:outline-none focus:border-stone-900"
        />
      </header>
      <div className="bg-white border border-stone-300 divide-y divide-stone-200 max-w-3xl mx-auto">
        {reels.map((reel) => {
          const idx = REELS.indexOf(reel);
          const isPlayback = reel.reel_id === playbackReelId;
          return (
            <div
              key={reel.reel_id}
              className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 ${
                isPlayback ? "bg-emerald-50" : ""
              }`}
            >
              <span className="text-stone-400 text-xs">#{idx + 1}</span>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  {reel.title}
                </div>
                <div className="text-stone-500 text-xs truncate">
                  {reel.creator} · {reel.category} ·{" "}
                  {formatRuntime(reel.runtime)}
                </div>
              </div>
              <button
                onClick={() => onPlay(idx)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isPlayback
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-900 text-white hover:bg-stone-700"
                }`}
              >
                {isPlayback ? "On stage" : "Play this"}
              </button>
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

// Non-votable videos: cast to the hall screen, never opens voting.
function NonVotableLibrary({
  reels,
  castReelId,
  onCast,
}: {
  reels: readonly NonVotableReel[];
  castReelId: string | null;
  onCast: (idx: number) => void;
}) {
  return (
    <section className="p-5 bg-stone-50 border-t border-stone-200">
      <header className="mb-3 max-w-3xl mx-auto">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
          NON-VOTABLE · {reels.length}
        </h2>
      </header>
      {reels.length === 0 ? (
        <p className="max-w-3xl mx-auto text-sm text-stone-500">
          Drop video files in <code>public/non-votable-videos/</code> and list
          them in <code>src/lib/non-votable.json</code>. Casting one plays it
          on the hall screen without opening voting.
        </p>
      ) : (
        <div className="bg-white border border-stone-300 divide-y divide-stone-200 max-w-3xl mx-auto">
          {reels.map((reel, idx) => {
            const isCast = reel.reel_id === castReelId;
            return (
              <div
                key={reel.reel_id}
                className={`grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 ${
                  isCast ? "bg-emerald-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {reel.title}
                  </div>
                  <div className="text-stone-500 text-xs truncate">
                    Cast only · not up for voting
                  </div>
                </div>
                <button
                  onClick={() => onCast(idx)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isCast
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-900 text-white hover:bg-stone-700"
                  }`}
                >
                  {isCast ? "On screen" : "Cast"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// "You are all caught up" image. Casts to the hall and stays on screen.
function CaughtUpLibrary({
  active,
  onCast,
}: {
  active: boolean;
  onCast: () => void;
}) {
  return (
    <ImageCastLibrary
      title="CAUGHT UP IMAGE"
      rowTitle="You are all caught up"
      rowSubtitle="Image stays on screen until you cast something else"
      active={active}
      onCast={onCast}
    />
  );
}

// Generic single-image cast section. Renders a labelled section with one
// row + one Cast button; flips to "On screen" while the image is live.
function ImageCastLibrary({
  title,
  rowTitle,
  rowSubtitle,
  active,
  onCast,
}: {
  title: string;
  rowTitle: string;
  rowSubtitle: string;
  active: boolean;
  onCast: () => void;
}) {
  return (
    <section className="p-5 bg-stone-50 border-t border-stone-200">
      <header className="mb-3 max-w-3xl mx-auto">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
          {title}
        </h2>
      </header>
      <div className="bg-white border border-stone-300 max-w-3xl mx-auto">
        <div
          className={`grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 ${
            active ? "bg-emerald-50" : ""
          }`}
        >
          <div className="min-w-0">
            <div className="font-semibold text-sm">{rowTitle}</div>
            <div className="text-stone-500 text-xs">{rowSubtitle}</div>
          </div>
          <button
            onClick={onCast}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-emerald-600 text-white"
                : "bg-stone-900 text-white hover:bg-stone-700"
            }`}
          >
            {active ? "On screen" : "Cast"}
          </button>
        </div>
      </div>
    </section>
  );
}

// Winner reveal videos. Cast loops on the hall; click prompts a confirm.
function WinnerFinalLibrary({
  reels,
  castReelId,
  onCast,
}: {
  reels: readonly WinnerFinalReel[];
  castReelId: string | null;
  onCast: (idx: number) => void;
}) {
  return (
    <section className="p-5 bg-stone-50 border-t border-stone-200">
      <header className="mb-3 max-w-3xl mx-auto">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
          WINNER FINAL · {reels.length}
        </h2>
      </header>
      {reels.length === 0 ? (
        <p className="max-w-3xl mx-auto text-sm text-stone-500">
          Drop video files in <code>public/winner-final/</code> and add them
          to <code>src/lib/cast-content.ts</code> to populate this list.
        </p>
      ) : (
        <div className="bg-white border border-stone-300 divide-y divide-stone-200 max-w-3xl mx-auto">
          {reels.map((reel, idx) => {
            const isCast = reel.reel_id === castReelId;
            return (
              <div
                key={reel.reel_id}
                className={`grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 ${
                  isCast ? "bg-emerald-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {reel.title}
                  </div>
                  <div className="text-stone-500 text-xs truncate">
                    Loops on the hall · confirm before casting
                  </div>
                </div>
                <button
                  onClick={() => onCast(idx)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isCast
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-900 text-white hover:bg-stone-700"
                  }`}
                >
                  {isCast ? "On screen" : "Cast"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

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
  user_name: string | null;
  score: number;
  reaction: string | null;
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
      const { data, error } = await supabase
        .from("votes")
        .select("user_id, user_name, score, reaction")
        .eq("reel_id", reelId);
      if (cancelled) return;
      if (error) {
        console.error("[useVoters] load failed", error);
        return;
      }
      setVoters((data as VoterRow[]) ?? []);
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
      <header className="flex items-center justify-between mb-3 max-w-3xl mx-auto">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-stone-500">
          VOTERS {reelTitle ? `· ${reelTitle}` : ""} · {voters.length}
        </h2>
      </header>
      <div className="max-w-3xl mx-auto">
        {!reelId ? (
          <div className="text-sm text-stone-500">
            Voters appear here once voting is open.
          </div>
        ) : voters.length === 0 ? (
          <div className="text-sm text-stone-500">No votes yet.</div>
        ) : (
          <div className="bg-white border border-stone-300 divide-y divide-stone-200">
            {voters.map((v, i) => (
              <div
                key={`${v.user_id}-${i}`}
                className="grid grid-cols-[2.5rem_1fr_5rem_5rem] items-center gap-3 px-3 py-2 text-xs"
              >
                <span className="text-stone-400">#{i + 1}</span>
                <span className="font-semibold text-sm truncate">
                  {v.user_name ?? v.user_id.slice(0, 8)}
                </span>
                <span className="text-stone-600">{v.reaction ?? "—"}</span>
                <span className="font-mono tabular-nums text-right">
                  {v.score}/100
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
