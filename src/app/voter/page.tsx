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
        <LockedView totalVoted={myVotes.length} />
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
  onLogout,
  children,
}: {
  voterName?: string;
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
      <FooterBar />
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
        fontWeight: 500,
        letterSpacing: "0.22em",
        border: 0,
        cursor: "pointer",
        textShadow:
          "0 0 6px rgba(255,255,255,0.7), 0 0 14px rgba(255,255,255,0.4), 0 0 24px rgba(255,255,255,0.2)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.12), 0 0 22px rgba(255, 220, 210, 0.45), 0 0 50px rgba(255, 200, 180, 0.25)",
      }}
    >
      Logout
    </button>
  );
}

function FestivalHeader() {
  return (
    <header className="flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Indian Scroll Festival · Bangalore International Centre · 16 May 2026"
        className="w-full max-w-[220px] sm:max-w-[280px] h-auto"
      />
    </header>
  );
}

function FooterBar() {
  return (
    <div
      className="mt-6 flex items-center justify-end gap-3"
      style={{ color: YELLOW }}
    >
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
            className="text-sm sm:text-base leading-[1.35] uppercase font-bold text-white"
            style={{ letterSpacing: "0.12em" }}
          >
            Vote on the reels playing on the big screen. Keep this tab open
            for the whole event.
          </p>

          <div className="mt-6">
            <GlowField>
              <button
                type="button"
                onClick={onJoin}
                disabled={signingIn}
                className="w-full min-h-[48px] bg-black text-white px-5 py-3 rounded-full text-sm sm:text-base uppercase font-bold disabled:opacity-50 transition-transform active:scale-[0.99]"
                style={{ letterSpacing: "0.35em" }}
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
          className="text-[10px] sm:text-xs uppercase font-bold text-white/70"
          style={{ letterSpacing: "0.4em" }}
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
          className="mt-2 text-xs sm:text-sm uppercase font-bold text-white/85"
          style={{ letterSpacing: "0.28em" }}
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
            className="flex justify-between text-[10px] sm:text-xs uppercase font-bold mb-1.5"
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
          <div className="relative h-4 mt-1" style={{ color: YELLOW }}>
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
          className={`mt-3 text-[10px] sm:text-xs uppercase font-bold ${
            moved ? "text-white/40" : "text-white/85"
          }`}
          style={{ letterSpacing: "0.3em" }}
        >
          Drag the slider to vote
        </div>

        {/* Vibe section */}
        <div className="mt-5">
          <div
            className="text-[10px] sm:text-xs uppercase italic font-bold"
            style={{ color: YELLOW, letterSpacing: "0.2em" }}
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

        {/* Action buttons */}
        <div className="mt-5 space-y-2.5">
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

          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-[48px] px-5 py-3 rounded-full text-sm sm:text-base uppercase italic bg-black transition-transform active:scale-[0.99]"
            style={{
              color: YELLOW,
              border: `1px solid ${YELLOW}`,
              letterSpacing: "0.18em",
              fontFamily: "var(--font-extended)",
              fontWeight: 700,
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
// Locked view — shown right after a vote is submitted, until the admin
// opens voting on the next reel.
// --------------------------------------------------------------------------
function LockedView({ totalVoted }: { totalVoted: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-10 sm:gap-14 py-8">
      <div
        className="text-sm sm:text-base uppercase font-bold text-white"
        style={{ letterSpacing: "0.22em" }}
      >
        Waiting for next reel
      </div>

      <YellowSpinner />

      <div>
        <p
          className="text-sm sm:text-base uppercase font-bold text-white"
          style={{ letterSpacing: "0.16em" }}
        >
          Voting will open when the next reel plays
        </p>
        <p
          className="mt-2 text-[10px] sm:text-xs uppercase font-bold text-white/55"
          style={{ letterSpacing: "0.22em" }}
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
        className="text-[10px] sm:text-xs uppercase font-bold"
        style={{ color: YELLOW, letterSpacing: "0.4em" }}
      >
        {skipped ? "Entry Skipped" : "Stand By"}
      </div>
      <div
        className="mt-2 w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: YELLOW }}
      />
      <p
        className="mt-6 text-sm sm:text-base uppercase font-bold text-white leading-snug max-w-xs"
        style={{ letterSpacing: "0.16em" }}
      >
        {skipped
          ? "We'll bring you back when the next reel opens."
          : "Voting will open when the next reel starts."}
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] font-bold text-white/40">
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
