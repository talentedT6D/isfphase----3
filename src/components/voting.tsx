"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePlaybackSubscriber, useVotingSubscriber } from "@/lib/channels";
import { findVoterReel } from "@/lib/reels";
import { findNonVotableReel } from "@/lib/non-votable";

export type Reaction = "LOL" | "FIRE" | "DEAD" | "KISS";

const REACTIONS: { key: Reaction; emoji: string }[] = [
  { key: "LOL", emoji: "😂" },
  { key: "FIRE", emoji: "🔥" },
  { key: "DEAD", emoji: "💀" },
  { key: "KISS", emoji: "💋" },
];

export const YELLOW = "#F5F019";
export const HALO_BOX_SHADOW =
  "0 0 0 1px rgba(255,170,90,0.65), 0 0 18px rgba(255,140,60,0.45), 0 0 48px rgba(255,120,40,0.22)";

export interface VoteRow {
  reel_id: string;
  score: number;
  reaction: Reaction | null;
}

export interface Voter {
  id: string;
  name: string;
}

// --------------------------------------------------------------------------
// The shared voting flow used once an identity (audience member or judge) has
// been established: loads the voter's prior votes, follows the live voting
// state, and swaps between the active voting screen and the standby screens.
// --------------------------------------------------------------------------
export function VotingExperience({
  voter,
  onLogout,
}: {
  voter: Voter;
  onLogout: () => void;
}) {
  const [myVotes, setMyVotes] = useState<VoteRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("votes")
        .select("reel_id, score, reaction")
        .eq("user_id", voter.id);
      if (!cancelled && data) setMyVotes(data as VoteRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [voter.id]);

  const voting = useVotingSubscriber();
  const playback = usePlaybackSubscriber();
  const currentReel = findVoterReel(voting.reel_id);
  const nonVotableReel = findNonVotableReel(playback.reel_id);
  const alreadyVoted = useMemo(
    () => myVotes.some((v) => v.reel_id === voting.reel_id),
    [myVotes, voting.reel_id],
  );
  const myVoteForCurrent = useMemo(
    () => myVotes.find((v) => v.reel_id === voting.reel_id),
    [myVotes, voting.reel_id],
  );

  const onSubmitted = (row: VoteRow) => {
    setMyVotes((prev) => {
      if (prev.some((v) => v.reel_id === row.reel_id)) return prev;
      return [...prev, row];
    });
  };

  let body: React.ReactNode;
  if (voting.status === "open" && currentReel) {
    if (alreadyVoted && myVoteForCurrent) {
      body = <LockedView totalVoted={myVotes.length} />;
    } else {
      body = (
        <VotingView
          voter={voter}
          reelId={currentReel.reel_id}
          reelTitle={currentReel.title}
          creator={currentReel.creator}
          onSubmitted={onSubmitted}
        />
      );
    }
  } else if (nonVotableReel && playback.status !== "stopped") {
    body = <NonVotableView text={nonVotableReel.voter_text} />;
  } else {
    body = <WaitingView totalVoted={myVotes.length} />;
  }

  return <Shell onLogout={onLogout}>{body}</Shell>;
}

// --------------------------------------------------------------------------
// Shared shell: festival logo at the top, logout in the corner, content in
// the middle.
// --------------------------------------------------------------------------
export function Shell({
  onLogout,
  children,
}: {
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative bg-black text-white flex flex-col overflow-hidden font-[var(--font-display)]"
      style={{
        minHeight: "100dvh",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {onLogout && <CornerLogout onLogout={onLogout} />}
      <FestivalHeader />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function CornerLogout({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      className="absolute z-20 uppercase transition-opacity hover:opacity-90 active:scale-95"
      style={{
        top: "max(0.75rem, env(safe-area-inset-top))",
        right: "max(0.75rem, env(safe-area-inset-right))",
        fontFamily: "var(--font-display)",
        color: "#FFFFFF",
        backgroundColor: "#000",
        padding: "7px 16px",
        minHeight: 36,
        borderRadius: 9999,
        fontSize: "12px",
        fontWeight: 400,
        letterSpacing: "0.22em",
        border: 0,
        cursor: "pointer",
      }}
    >
      Logout
    </button>
  );
}

function FestivalHeader() {
  return (
    <header className="flex flex-col items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Indian Scroll Festival · Bangalore International Centre · 16 May 2026"
        className="w-full max-w-[160px] sm:max-w-[220px] h-auto"
      />
    </header>
  );
}

// --------------------------------------------------------------------------
// Active voting screen — matches the festival mock.
// --------------------------------------------------------------------------
function VotingView({
  voter,
  reelId,
  reelTitle,
  creator,
  onSubmitted,
}: {
  voter: Voter;
  reelId: string;
  reelTitle: string;
  creator: string;
  onSubmitted: (row: VoteRow) => void;
}) {
  const [score, setScore] = useState(50);
  const [moved, setMoved] = useState(false);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setScore(50);
    setMoved(false);
    setReaction(null);
    setError("");
  }, [reelId]);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const { error } = await supabase.from("votes").insert({
      user_id: voter.id,
      user_name: voter.name,
      reel_id: reelId,
      score,
      reaction,
    });
    if (error) {
      if (error.code === "23505") {
        onSubmitted({ reel_id: reelId, score, reaction });
      } else {
        setError(error.message);
        setSubmitting(false);
        return;
      }
    } else {
      onSubmitted({ reel_id: reelId, score, reaction });
    }
    setSubmitting(false);
  };

  const descriptor = scoreDescriptor(score);

  return (
    <div className="flex-1 flex flex-col">
      {/* Title block, vertically anchored just above center */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div
          className="text-[10px] sm:text-xs uppercase text-white/70"
          style={{
            letterSpacing: "0.4em",
            fontFamily: "var(--font-display)",
            fontWeight: 400,
          }}
        >
          Now Voting
        </div>
        <h1
          className="mt-2 text-2xl sm:text-4xl uppercase leading-none break-words max-w-full"
          style={{
            letterSpacing: "0.08em",
            fontFamily: "var(--font-extended)",
            fontWeight: 700,
          }}
        >
          {reelTitle}
        </h1>
        <div
          className="mt-2 text-xs sm:text-sm uppercase text-white/85"
          style={{
            letterSpacing: "0.28em",
            fontFamily: "var(--font-display)",
            fontWeight: 400,
          }}
        >
          {creator}
        </div>
      </div>

      {/* Score + slider */}
      <div className="w-full max-w-xl mx-auto">
        <div
          className="text-[2.5rem] sm:text-6xl leading-none"
          style={{
            color: YELLOW,
            fontFamily: "var(--font-extended)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            textShadow:
              "0 0 10px rgba(245, 240, 25, 0.5), 0 0 26px rgba(245, 240, 25, 0.22)",
          }}
        >
          {score}
          <span style={{ color: "rgba(255,255,255,0.45)" }}>/100</span>
        </div>

        <div className="mt-3 relative">
          {/* tick labels above */}
          <div
            className="flex justify-between text-[10px] sm:text-xs uppercase mb-1.5"
            style={{
              color: YELLOW,
              letterSpacing: "0.18em",
              fontFamily: "var(--font-display)",
              fontWeight: 400,
            }}
          >
            <span>01</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>

          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={score}
            onChange={(e) => {
              setScore(Number(e.target.value));
              setMoved(true);
            }}
            className="vote-slider"
            style={
              {
                ["--p" as string]: `${score}%`,
              } as React.CSSProperties
            }
          />

          {/* descriptor underneath the thumb — italic */}
          <div className="relative h-4 mt-1" style={{ color: YELLOW }}>
            <span
              className="absolute -translate-x-1/2 text-[10px] sm:text-xs uppercase italic"
              style={{
                left: `${score}%`,
                letterSpacing: "0.25em",
                fontFamily: "var(--font-display)",
                fontWeight: 400,
              }}
            >
              {descriptor}
            </span>
          </div>
        </div>

        <div
          className={`mt-3 text-[10px] sm:text-xs uppercase italic ${
            moved ? "text-white/40" : "text-white/85"
          }`}
          style={{
            letterSpacing: "0.3em",
            fontFamily: "var(--font-display)",
            fontWeight: 400,
          }}
        >
          Drag the slider to vote
        </div>

        {/* Vibe section */}
        <div className="mt-5">
          <div
            className="text-[10px] sm:text-xs uppercase italic"
            style={{
              color: YELLOW,
              letterSpacing: "0.2em",
              fontFamily: "var(--font-display)",
              fontWeight: 400,
            }}
          >
            Vibe (optional)
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2.5">
            {REACTIONS.map((r) => {
              const active = reaction === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReaction(active ? null : r.key)}
                  className="aspect-square min-h-[56px] rounded-xl flex items-center justify-center text-2xl sm:text-3xl transition-transform active:scale-95"
                  style={{
                    backgroundColor: YELLOW,
                    boxShadow: active
                      ? `0 0 0 2px #fff, ${HALO_BOX_SHADOW}`
                      : "0 0 0 1px rgba(255,170,90,0.45)",
                    opacity: reaction && !active ? 0.55 : 1,
                  }}
                  aria-pressed={active}
                  aria-label={r.key}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-xs mt-4 text-center">{error}</p>
        )}

        {/* Action button */}
        <div className="mt-5">
          <GlowField>
            <button
              type="button"
              onClick={submit}
              disabled={!moved || submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-full text-sm sm:text-base uppercase italic transition-transform active:scale-[0.99] disabled:opacity-60"
              style={{
                backgroundColor: YELLOW,
                color: "#D62A2A",
                letterSpacing: "0.18em",
                fontFamily: "var(--font-extended)",
                fontWeight: 700,
              }}
            >
              {submitting ? "Submitting…" : "Submit Score"}
            </button>
          </GlowField>
        </div>
      </div>
    </div>
  );
}

function scoreDescriptor(score: number): string {
  if (score < 21) return "BAD";
  if (score < 41) return "OKAY";
  if (score < 61) return "GOOD";
  if (score < 81) return "GREAT";
  return "AMAZING";
}

// --------------------------------------------------------------------------
// Locked view — shown right after a vote is submitted, until the admin opens
// voting on the next reel.
// --------------------------------------------------------------------------
function LockedView({ totalVoted }: { totalVoted: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-10 sm:gap-14 py-8">
      <div
        className="text-sm sm:text-base uppercase text-white"
        style={{
          letterSpacing: "0.22em",
          fontFamily: "var(--font-display)",
          fontWeight: 400,
        }}
      >
        Waiting for next reel
      </div>

      <YellowSpinner />

      <div>
        <p
          className="text-sm sm:text-base uppercase text-white"
          style={{
            letterSpacing: "0.16em",
            fontFamily: "var(--font-display)",
            fontWeight: 400,
          }}
        >
          Voting will open when the next reel plays
        </p>
        <p
          className="mt-2 text-[10px] sm:text-xs uppercase text-white/55"
          style={{
            letterSpacing: "0.22em",
            fontFamily: "var(--font-extended)",
            fontWeight: 700,
          }}
        >
          You&apos;ve voted on {totalVoted} reel
          {totalVoted === 1 ? "" : "s"} so far · Keep this tab open
        </p>
      </div>
    </div>
  );
}

// Yellow rotating arc — used as the "between-reels" loading indicator.
function YellowSpinner() {
  return (
    <div
      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full animate-spin"
      style={{
        border: "3px solid rgba(245, 240, 25, 0.18)",
        borderTopColor: YELLOW,
        boxShadow: "0 0 18px rgba(245, 240, 25, 0.35)",
      }}
      aria-label="Waiting for the next reel"
      role="progressbar"
    />
  );
}

// --------------------------------------------------------------------------
// Waiting view (no reel open)
// --------------------------------------------------------------------------
function WaitingView({ totalVoted }: { totalVoted: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div
        className="text-[10px] sm:text-xs uppercase font-bold"
        style={{ color: YELLOW, letterSpacing: "0.4em" }}
      >
        Stand By
      </div>
      <div
        className="mt-2 w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: YELLOW }}
      />
      <p
        className="mt-6 text-sm sm:text-base uppercase font-bold text-white leading-snug max-w-xs"
        style={{ letterSpacing: "0.16em" }}
      >
        Voting will open when the next reel starts.
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] font-bold text-white/40">
        You&apos;ve voted on {totalVoted} reel{totalVoted === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Non-votable view — shown while a non-votable video is on the hall screen.
// There is no slider; the audience just sees this video's own message.
// --------------------------------------------------------------------------
function NonVotableView({ text }: { text: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: YELLOW }}
      />
      <p
        className="mt-6 text-sm sm:text-base uppercase font-bold text-white leading-snug max-w-sm"
        style={{ letterSpacing: "0.16em" }}
      >
        {text}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Atoms
// --------------------------------------------------------------------------
export function GlowField({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full" style={{ boxShadow: HALO_BOX_SHADOW }}>
      {children}
    </div>
  );
}

export function FullBleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white/60 flex items-center justify-center text-sm font-[var(--font-display)]">
      {children}
    </div>
  );
}
