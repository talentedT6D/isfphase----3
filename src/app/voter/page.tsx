"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVotingSubscriber } from "@/lib/channels";
import { findVoterReel } from "@/lib/reels";

type Reaction = "LOL" | "FIRE" | "DEAD" | "KISS";
const REACTIONS: Reaction[] = ["LOL", "FIRE", "DEAD", "KISS"];

const NAME_KEY = "isf-voter-name";
const ID_KEY = "isf-voter-id";

interface VoteRow {
  reel_id: string;
  score: number;
  reaction: Reaction | null;
}

interface Voter {
  id: string;
  name: string;
}

export default function VoterPage() {
  const [voter, setVoter] = useState<Voter | null>(null);
  const [ready, setReady] = useState(false);
  const [myVotes, setMyVotes] = useState<VoteRow[]>([]);

  useEffect(() => {
    const id = localStorage.getItem(ID_KEY);
    const name = localStorage.getItem(NAME_KEY);
    if (id && name) setVoter({ id, name });
    setReady(true);
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
      <NameEntryView
        onEnter={(name) => {
          const id = cryptoRandomUUID();
          localStorage.setItem(NAME_KEY, name);
          localStorage.setItem(ID_KEY, id);
          setVoter({ id, name });
        }}
      />
    );
  }

  const handleLeave = () => {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ID_KEY);
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
        <span className="font-mono text-white/60">{voter.name}</span>
        <button
          onClick={handleLeave}
          className="text-white/60 hover:text-white"
        >
          Leave
        </button>
      </header>
      <main className="flex-1 flex flex-col">{body}</main>
    </div>
  );
}

function NameEntryView({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1) return;
    onEnter(trimmed);
  };
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="text-[10px] tracking-[0.3em] text-white/50 mb-3">
        ISF 2026 · BENGALURU
      </div>
      <h1 className="text-3xl font-semibold mb-2">Enter your name</h1>
      <p className="text-white/60 text-sm max-w-xs mb-8">
        Vote on the reels playing on the big screen. Keep this tab open for
        the whole event.
      </p>
      <form onSubmit={submit} className="w-full max-w-xs space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoFocus
          maxLength={40}
          className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full py-3 rounded-lg bg-white text-black font-medium disabled:bg-white/10 disabled:text-white/40"
        >
          Join
        </button>
      </form>
      <p className="text-white/30 text-[10px] mt-10">
        Event day · 16 May 2026 · BIC Bengaluru
      </p>
    </div>
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

function cryptoRandomUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (very old Safari etc.)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
