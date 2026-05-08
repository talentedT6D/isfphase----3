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
  const name =
    typeof meta.name === "string" ? meta.name : null;
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
        onSignIn={async () => {
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
  onSignIn,
  signingIn,
  error,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  error: string;
}) {
  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col px-6 py-10 overflow-hidden">
      {/* soft radial vignette so the buttons read like they're lit */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.04)_0%,_transparent_60%)]" />

      <div className="relative flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Indian Scroll Festival" className="w-full max-w-[280px] h-auto" />

        <p className="mt-10 text-[13px] tracking-[0.18em] uppercase leading-relaxed text-white/90">
          Vote on the reels playing on the big screen.
          <br />
          Keep this tab open for the whole event.
        </p>

        <div className="w-full mt-10 space-y-4">
          <GlowButton onClick={onSignIn} disabled={signingIn} variant="light">
            <span className="flex-1 text-center">
              {signingIn ? "Redirecting…" : "Sign in with Google"}
            </span>
            <GoogleMark />
          </GlowButton>

          <GlowButton onClick={onSignIn} disabled={signingIn} variant="dark">
            <span className="flex-1 text-center">Join</span>
          </GlowButton>
        </div>

        {error && (
          <p className="text-red-400 text-xs mt-4 max-w-xs">{error}</p>
        )}
      </div>

      <div className="relative flex items-end justify-between gap-4">
        <div className="flex-1 text-center text-[10px] tracking-[0.3em] uppercase text-yellow-300">
          Bangalore International Centre · 16 May 2026
        </div>
        <div className="flex items-center gap-3 text-sky-400">
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
    </div>
  );
}

function GlowButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: "light" | "dark";
  children: React.ReactNode;
}) {
  const palette =
    variant === "light"
      ? "bg-stone-100 text-black"
      : "bg-black text-white border border-white/15";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-full rounded-full ${palette} disabled:opacity-50 transition-transform active:scale-[0.99]`}
      style={{
        boxShadow:
          "0 0 0 1px rgba(255,214,120,0.55), 0 0 28px rgba(255,180,80,0.35), 0 0 60px rgba(255,180,80,0.18)",
      }}
    >
      <span className="flex items-center justify-center gap-3 px-6 py-4 text-[13px] tracking-[0.25em] uppercase font-medium">
        {children}
      </span>
    </button>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="20"
      height="20"
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
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

