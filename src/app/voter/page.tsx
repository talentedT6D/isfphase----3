"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useVotingSubscriber } from "@/lib/channels";
import { findVoterReel } from "@/lib/reels";

type Reaction = "LOL" | "FIRE" | "DEAD" | "KISS";
const REACTIONS: Reaction[] = ["LOL", "FIRE", "DEAD", "KISS"];

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

  const handleLeave = async () => {
    await supabase.auth.signOut();
    setVoter(null);
    setMyVotes([]);
  };

  const onSubmitted = (row: VoteRow) => {
    setMyVotes((prev) => {
      if (prev.some((v) => v.reel_id === row.reel_id)) return prev;
      return [...prev, row];
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
    } else {
      body = (
        <VotingView
          voter={voter}
          reelId={currentReel.reel_id}
          reelTitle={currentReel.title}
          creator={currentReel.creator}
          category={currentReel.category}
          onSubmitted={onSubmitted}
        />
      );
    }
  } else {
    body = <WaitingView totalVoted={myVotes.length} />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-xs">
        <span className="font-mono text-white/60 truncate max-w-[60%]">
          {voter.name}
        </span>
        <button
          onClick={handleLeave}
          className="text-white/60 hover:text-white"
        >
          Sign out
        </button>
      </header>
      <main className="flex-1 flex flex-col">{body}</main>
    </div>
  );
}

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
    <div className="relative min-h-screen bg-black text-white flex flex-col px-6 pt-10 pb-6 overflow-hidden">
      {/* Top: festival logo + venue ribbon */}
      <header className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Indian Scroll Festival"
          className="w-full max-w-[420px] sm:max-w-[480px] h-auto"
        />
        <div className="mt-3 text-[11px] sm:text-xs tracking-[0.32em] uppercase text-yellow-300 font-[var(--font-condensed)]">
          Bangalore International Centre · 16 May 2026
        </div>
      </header>

      {/* Bottom half: pitch + Join (Google sign-in) */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="w-full max-w-md sm:max-w-lg mx-auto text-center">
          <p className="text-base sm:text-lg leading-snug tracking-[0.12em] uppercase font-semibold text-white/95">
            Vote on the reels playing on the big screen. Keep this tab open
            for the whole event.
          </p>

          <div className="mt-8">
            <GlowField>
              <button
                type="button"
                onClick={onJoin}
                disabled={signingIn}
                className="w-full bg-black text-white border border-white/15 px-6 py-4 rounded-full text-sm sm:text-base tracking-[0.3em] uppercase font-semibold disabled:opacity-40 transition-transform active:scale-[0.99]"
              >
                {signingIn ? "Redirecting…" : "Join"}
              </button>
            </GlowField>
          </div>

          {error && (
            <p className="text-red-400 text-xs mt-4">{error}</p>
          )}
        </div>

        {/* Bottom: socials */}
        <div className="mt-10 flex items-center justify-center gap-5 text-white/85">
          <a
            href="https://instagram.com/indianscrollfestival"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            className="hover:opacity-70"
          >
            <InstagramIcon />
          </a>
          <a
            href="https://x.com/indianscroll"
            target="_blank"
            rel="noreferrer"
            aria-label="X"
            className="hover:opacity-70"
          >
            <XIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

// Pill-shaped wrapper that paints the warm yellow halo seen in the mock.
function GlowField({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-full"
      style={{
        boxShadow:
          "0 0 0 1px rgba(255,214,120,0.55), 0 0 22px rgba(255,180,80,0.32), 0 0 55px rgba(255,180,80,0.16)",
      }}
    >
      {children}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="22"
      height="22"
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
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}


function VotingView({
  voter,
  reelId,
  reelTitle,
  creator,
  category,
  onSubmitted,
}: {
  voter: Voter;
  reelId: string;
  reelTitle: string;
  creator: string;
  category: string;
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

  return (
    <div className="flex-1 flex flex-col px-6 py-8">
      <div className="text-[10px] tracking-[0.3em] text-white/50">
        NOW VOTING · {category.toUpperCase()}
      </div>
      <h2 className="text-2xl font-semibold mt-2 leading-tight">{reelTitle}</h2>
      <p className="text-white/60 text-sm mt-1">by {creator}</p>

      <div className="mt-12">
        <div className="flex items-baseline justify-between">
          <label className="text-xs uppercase tracking-wider text-white/50">
            Your score
          </label>
          <span className="text-4xl font-semibold tabular-nums">
            {score}
            <span className="text-white/30 text-lg"> / 100</span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={score}
          onChange={(e) => {
            setScore(Number(e.target.value));
            setMoved(true);
          }}
          className="w-full mt-4 h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #fff 0%, #fff ${score}%, #333 ${score}%, #333 100%)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-white/40 mt-1">
          <span>0</span>
          <span>100</span>
        </div>
      </div>

      <div className="mt-10">
        <div className="text-xs uppercase tracking-wider text-white/50 mb-3">
          Vibe <span className="text-white/30 normal-case">(optional)</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setReaction(reaction === r ? null : r)}
              className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                reaction === r
                  ? "border-white bg-white text-black"
                  : "border-white/20 text-white/80 hover:border-white/50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {error && (
        <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
      )}
      <button
        onClick={submit}
        disabled={!moved || submitting}
        className="w-full py-4 rounded-lg bg-white text-black font-semibold disabled:bg-white/10 disabled:text-white/40"
      >
        {submitting
          ? "Submitting…"
          : moved
            ? "Submit vote"
            : "Move the slider to vote"}
      </button>
    </div>
  );
}

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
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-[10px] tracking-[0.3em] text-white/50">
        VOTE LOCKED IN
      </div>
      <h2 className="text-2xl font-semibold mt-2">{reelTitle}</h2>
      <p className="text-white/60 text-sm">by {creator}</p>
      <div className="text-5xl font-semibold mt-8 tabular-nums">
        {score}
        <span className="text-white/30 text-xl"> / 100</span>
      </div>
      {reaction && (
        <div className="mt-3 text-white/70 text-sm tracking-wider">
          · {reaction} ·
        </div>
      )}
      <p className="text-white/50 text-sm mt-10">Waiting for the next reel.</p>
      <p className="text-white/30 text-xs mt-2">
        You&apos;ve voted on {totalVoted} reel{totalVoted === 1 ? "" : "s"}.
        Keep this tab open.
      </p>
    </div>
  );
}

function WaitingView({ totalVoted }: { totalVoted: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-[10px] tracking-[0.3em] text-white/50">
        WAITING FOR NEXT REEL
      </div>
      <div className="mt-6 w-2 h-2 rounded-full bg-white/60 animate-pulse" />
      <p className="text-white/60 text-sm mt-10">
        Voting will open when the next reel starts.
      </p>
      <p className="text-white/30 text-xs mt-2">
        You&apos;ve voted on {totalVoted} reel
        {totalVoted === 1 ? "" : "s"} so far. Keep this tab open.
      </p>
    </div>
  );
}

function FullBleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white/60 flex items-center justify-center text-sm">
      {children}
    </div>
  );
}

