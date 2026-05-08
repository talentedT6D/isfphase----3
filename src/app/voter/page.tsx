"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useVotingSubscriber } from "@/lib/channels";
import { findVoterReel } from "@/lib/reels";

type Reaction = "LOL" | "FIRE" | "DEAD" | "KISS";
const REACTIONS: { key: Reaction; emoji: string }[] = [
  { key: "LOL", emoji: "😂" },
  { key: "FIRE", emoji: "🔥" },
  { key: "DEAD", emoji: "💀" },
  { key: "KISS", emoji: "💋" },
];

const YELLOW = "#F5F019";
const HALO_BOX_SHADOW =
  "0 0 0 1px rgba(255,170,90,0.65), 0 0 18px rgba(255,140,60,0.45), 0 0 48px rgba(255,120,40,0.22)";

interface VoteRow {
  reel_id: string;
  score: number;
  reaction: Reaction | null;
}

interface Voter {
  id: string;
  name: string;
}

function voterFromSession(session: Session | null): Voter | null {
  if (!session?.user) return null;
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name : null;
  const name = typeof meta.name === "string" ? meta.name : null;
  const fallback =
    typeof u.email === "string" && u.email.length > 0
      ? u.email.split("@")[0]
      : "Voter";
  return { id: u.id, name: fullName || name || fallback };
}

export default function VoterPage() {
  const [voter, setVoter] = useState<Voter | null>(null);
  const [ready, setReady] = useState(false);
  const [myVotes, setMyVotes] = useState<VoteRow[]>([]);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [skippedReels, setSkippedReels] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setVoter(voterFromSession(data.session));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setVoter(voterFromSession(session));
      },
    );
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!voter) {
      setMyVotes([]);
      return;
    }
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
  }, [voter]);

  const voting = useVotingSubscriber();
  const currentReel = findVoterReel(voting.reel_id);
  const alreadyVoted = useMemo(
    () => myVotes.some((v) => v.reel_id === voting.reel_id),
    [myVotes, voting.reel_id],
  );
  const myVoteForCurrent = useMemo(
    () => myVotes.find((v) => v.reel_id === voting.reel_id),
    [myVotes, voting.reel_id],
  );
  const skipped = !!voting.reel_id && skippedReels.has(voting.reel_id);

  if (!ready) return <FullBleed>Loading…</FullBleed>;

  if (!voter) {
    return (
      <SignInView
        signingIn={signingIn}
        error={signInError}
        onJoin={async () => {
          setSigningIn(true);
          setSignInError("");
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}/voter`
                  : undefined,
            },
          });
          if (error) {
            setSignInError(error.message);
            setSigningIn(false);
          }
        }}
      />
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setVoter(null);
    setMyVotes([]);
    setSkippedReels(new Set());
  };

  const onSubmitted = (row: VoteRow) => {
    setMyVotes((prev) => {
      if (prev.some((v) => v.reel_id === row.reel_id)) return prev;
      return [...prev, row];
    });
  };

  const onSkip = (reelId: string) => {
    setSkippedReels((prev) => {
      const next = new Set(prev);
      next.add(reelId);
      return next;
    });
  };

  let body: React.ReactNode;
  if (voting.status === "open" && currentReel) {
    if (alreadyVoted && myVoteForCurrent) {
      body = (
        <LockedView
          reelTitle={currentReel.title}
          creator={currentReel.creator}
          score={myVoteForCurrent.score}
          reaction={myVoteForCurrent.reaction}
          totalVoted={myVotes.length}
        />
      );
    } else if (skipped) {
      body = <WaitingView totalVoted={myVotes.length} skipped />;
    } else {
      body = (
        <VotingView
          voter={voter}
          reelId={currentReel.reel_id}
          reelTitle={currentReel.title}
          creator={currentReel.creator}
          onSubmitted={onSubmitted}
          onSkip={() => onSkip(currentReel.reel_id)}
        />
      );
    }
  } else {
    body = <WaitingView totalVoted={myVotes.length} />;
  }

  return (
    <Shell voterName={voter.name} onLogout={handleLogout}>
      {body}
    </Shell>
  );
}

// --------------------------------------------------------------------------
// Shared shell: festival logo + ribbon at the top, social ribbon + logout at
// the bottom, content in the middle.
// --------------------------------------------------------------------------
function Shell({
  voterName,
  onLogout,
  children,
}: {
  voterName?: string;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col px-6 pt-6 pb-5 overflow-hidden font-[var(--font-display)]">
      <FestivalHeader />
      <div className="flex-1 flex flex-col">{children}</div>
      <FooterBar voterName={voterName} onLogout={onLogout} />
    </div>
  );
}

function FestivalHeader() {
  return (
    <header className="flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Indian Scroll Festival"
        className="w-full max-w-[260px] sm:max-w-[320px] h-auto"
      />
      <div
        className="mt-1 text-[10px] sm:text-[11px] uppercase font-bold"
        style={{
          color: YELLOW,
          letterSpacing: "0.28em",
          fontFamily: "var(--font-condensed)",
        }}
      >
        Bangalore International Centre · 16 May 2026
      </div>
    </header>
  );
}

function FooterBar({
  voterName,
  onLogout,
}: {
  voterName?: string;
  onLogout?: () => void;
}) {
  return (
    <div
      className="mt-6 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.25em]"
      style={{ color: YELLOW, fontFamily: "var(--font-condensed)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {voterName && (
          <span className="truncate max-w-[40vw]" title={voterName}>
            {voterName}
          </span>
        )}
        {onLogout && (
          <>
            <span className="opacity-50">·</span>
            <button
              onClick={onLogout}
              className="hover:opacity-80 underline-offset-2 hover:underline"
            >
              Logout
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-3" style={{ color: YELLOW }}>
        <a
          href="https://instagram.com/indianscrollfestival"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className="hover:opacity-80"
        >
          <InstagramIcon />
        </a>
        <a
          href="https://x.com/indianscroll"
          target="_blank"
          rel="noreferrer"
          aria-label="X"
          className="hover:opacity-80"
        >
          <XIcon />
        </a>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sign-in screen
// --------------------------------------------------------------------------
function SignInView({
  onJoin,
  signingIn,
  error,
}: {
  onJoin: () => void;
  signingIn: boolean;
  error: string;
}) {
  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-md sm:max-w-lg text-center">
          <p
            className="text-base sm:text-lg leading-[1.35] uppercase font-bold text-white"
            style={{ letterSpacing: "0.13em" }}
          >
            Vote on the reels playing on the big screen. Keep this tab open
            for the whole event.
          </p>

          <div className="mt-7">
            <GlowField>
              <button
                type="button"
                onClick={onJoin}
                disabled={signingIn}
                className="w-full bg-black text-white px-6 py-4 rounded-full text-base sm:text-lg uppercase font-bold disabled:opacity-50 transition-transform active:scale-[0.99]"
                style={{ letterSpacing: "0.4em" }}
              >
                {signingIn ? "Redirecting…" : "Join"}
              </button>
            </GlowField>
          </div>

          {error && <p className="text-red-400 text-xs mt-4">{error}</p>}
        </div>
      </div>
    </Shell>
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
  onSkip,
}: {
  voter: Voter;
  reelId: string;
  reelTitle: string;
  creator: string;
  onSubmitted: (row: VoteRow) => void;
  onSkip: () => void;
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
          className="text-[11px] sm:text-xs uppercase font-bold text-white/70"
          style={{ letterSpacing: "0.4em" }}
        >
          Now Voting
        </div>
        <h1
          className="mt-3 text-4xl sm:text-5xl uppercase font-extrabold leading-none break-words max-w-full"
          style={{ letterSpacing: "0.1em" }}
        >
          {reelTitle}
        </h1>
        <div
          className="mt-3 text-base sm:text-lg uppercase font-bold text-white/85"
          style={{ letterSpacing: "0.32em" }}
        >
          {creator}
        </div>
      </div>

      {/* Score + slider */}
      <div className="w-full max-w-xl mx-auto">
        <div
          className="text-5xl sm:text-6xl leading-none"
          style={{
            color: YELLOW,
            fontFamily: "var(--font-extended)",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {score}
          <span className="text-white/40">/100</span>
        </div>

        <div className="mt-4 relative">
          {/* tick labels above */}
          <div
            className="flex justify-between text-[10px] sm:text-xs uppercase font-bold mb-2"
            style={{ color: YELLOW, letterSpacing: "0.18em" }}
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

          {/* descriptor underneath the thumb */}
          <div
            className="relative h-5 mt-1"
            style={{ color: YELLOW }}
          >
            <span
              className="absolute -translate-x-1/2 text-[10px] sm:text-xs uppercase font-bold"
              style={{
                left: `${score}%`,
                letterSpacing: "0.25em",
              }}
            >
              {descriptor}
            </span>
          </div>
        </div>

        <div
          className={`mt-4 text-[10px] sm:text-xs uppercase font-bold ${
            moved ? "text-white/40" : "text-white/85"
          }`}
          style={{ letterSpacing: "0.3em" }}
        >
          Drag the slider to vote
        </div>

        {/* Vibe section */}
        <div className="mt-6">
          <div
            className="text-[10px] sm:text-xs uppercase italic"
            style={{ color: YELLOW, letterSpacing: "0.2em" }}
          >
            Vibe (optional)
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {REACTIONS.map((r) => {
              const active = reaction === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReaction(active ? null : r.key)}
                  className="aspect-square rounded-2xl flex items-center justify-center text-3xl sm:text-4xl transition-transform active:scale-95"
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

        {/* Action buttons */}
        <div className="mt-6 space-y-3">
          <GlowField>
            <button
              type="button"
              onClick={submit}
              disabled={!moved || submitting}
              className="w-full px-6 py-4 rounded-full text-base sm:text-lg uppercase font-extrabold transition-transform active:scale-[0.99] disabled:opacity-60"
              style={{
                backgroundColor: YELLOW,
                color: "#D62A2A",
                letterSpacing: "0.3em",
              }}
            >
              {submitting ? "Submitting…" : "Submit Score"}
            </button>
          </GlowField>

          <button
            type="button"
            onClick={onSkip}
            className="w-full px-6 py-4 rounded-full text-base sm:text-lg uppercase font-bold bg-black transition-transform active:scale-[0.99]"
            style={{
              color: YELLOW,
              border: `1px solid ${YELLOW}`,
              letterSpacing: "0.3em",
            }}
          >
            Skip Entry
          </button>
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
// Locked view (already voted)
// --------------------------------------------------------------------------
function LockedView({
  reelTitle,
  creator,
  score,
  reaction,
  totalVoted,
}: {
  reelTitle: string;
  creator: string;
  score: number;
  reaction: Reaction | null;
  totalVoted: number;
}) {
  const reactionEmoji = REACTIONS.find((r) => r.key === reaction)?.emoji;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div
        className="text-[11px] sm:text-xs uppercase font-bold text-white/70"
        style={{ letterSpacing: "0.4em" }}
      >
        Vote Locked In
      </div>
      <h2
        className="mt-3 text-3xl sm:text-4xl uppercase font-extrabold leading-none"
        style={{ letterSpacing: "0.08em" }}
      >
        {reelTitle}
      </h2>
      <div
        className="mt-2 text-sm uppercase font-bold text-white/80"
        style={{ letterSpacing: "0.3em" }}
      >
        {creator}
      </div>
      <div
        className="mt-8 text-6xl sm:text-7xl leading-none"
        style={{
          color: YELLOW,
          fontFamily: "var(--font-extended)",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        {score}
        <span className="text-white/40">/100</span>
      </div>
      {reactionEmoji && (
        <div className="mt-4 text-4xl" aria-label={reaction ?? undefined}>
          {reactionEmoji}
        </div>
      )}
      <p
        className="mt-10 text-[11px] uppercase font-bold text-white/85"
        style={{ letterSpacing: "0.3em" }}
      >
        Waiting for the next reel
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
        You&apos;ve voted on {totalVoted} reel{totalVoted === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Waiting view (no reel open or this reel skipped)
// --------------------------------------------------------------------------
function WaitingView({
  totalVoted,
  skipped,
}: {
  totalVoted: number;
  skipped?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div
        className="text-[11px] sm:text-xs uppercase font-bold"
        style={{ color: YELLOW, letterSpacing: "0.4em" }}
      >
        {skipped ? "Entry Skipped" : "Stand By"}
      </div>
      <div
        className="mt-2 w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: YELLOW }}
      />
      <p
        className="mt-8 text-base sm:text-lg uppercase font-bold text-white"
        style={{ letterSpacing: "0.2em" }}
      >
        {skipped
          ? "We'll bring you back when the next reel opens."
          : "Voting will open when the next reel starts."}
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-white/40">
        You&apos;ve voted on {totalVoted} reel{totalVoted === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Atoms
// --------------------------------------------------------------------------
function GlowField({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-full"
      style={{ boxShadow: HALO_BOX_SHADOW }}
    >
      {children}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FullBleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white/60 flex items-center justify-center text-sm font-[var(--font-display)]">
      {children}
    </div>
  );
}
