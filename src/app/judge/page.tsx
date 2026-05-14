"use client";

import { useEffect, useState } from "react";
import { JUDGES, JUDGE_PASSWORD, type Judge } from "@/lib/judges";
import {
  FullBleed,
  GlowField,
  Shell,
  VotingExperience,
} from "@/components/voting";

const JUDGE_AUTH_KEY = "isf-judge-ok";
const JUDGE_ID_KEY = "isf-judge-id";

export default function JudgePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [judge, setJudge] = useState<Judge | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = window.localStorage.getItem(JUDGE_AUTH_KEY) === "1";
    const savedId = window.localStorage.getItem(JUDGE_ID_KEY);
    setAuthed(ok);
    setJudge(JUDGES.find((j) => j.id === savedId) ?? null);
  }, []);

  if (authed === null) return <FullBleed>Loading…</FullBleed>;

  if (!authed) {
    return (
      <GateView
        onUnlock={() => {
          window.localStorage.setItem(JUDGE_AUTH_KEY, "1");
          setAuthed(true);
        }}
      />
    );
  }

  if (!judge) {
    return (
      <PickJudgeView
        onPick={(j) => {
          window.localStorage.setItem(JUDGE_ID_KEY, j.id);
          setJudge(j);
        }}
      />
    );
  }

  const handleLogout = () => {
    window.localStorage.removeItem(JUDGE_AUTH_KEY);
    window.localStorage.removeItem(JUDGE_ID_KEY);
    setJudge(null);
    setAuthed(false);
  };

  return <VotingExperience voter={judge} onLogout={handleLogout} />;
}

// --------------------------------------------------------------------------
// Password gate
// --------------------------------------------------------------------------
function GateView({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === JUDGE_PASSWORD) {
      onUnlock();
    } else {
      setErr("Wrong password");
    }
  };

  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center">
        <form
          onSubmit={submit}
          className="w-full max-w-sm text-center"
        >
          <div
            className="text-[10px] sm:text-xs uppercase font-bold"
            style={{ color: "#F5F019", letterSpacing: "0.4em" }}
          >
            Judges Only
          </div>
          <p
            className="mt-3 text-sm sm:text-base uppercase font-bold text-white"
            style={{ letterSpacing: "0.12em" }}
          >
            Enter the judge password to start scoring.
          </p>

          <input
            type="password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr("");
            }}
            autoFocus
            placeholder="Password"
            className="mt-6 w-full min-h-[48px] bg-black text-white text-center px-5 py-3 rounded-full text-sm uppercase border border-white/25 focus:outline-none focus:border-white/70"
            style={{ letterSpacing: "0.2em" }}
          />

          {err && <p className="text-red-400 text-xs mt-3">{err}</p>}

          <div className="mt-4">
            <GlowField>
              <button
                type="submit"
                className="w-full min-h-[48px] bg-black text-white px-5 py-3 rounded-full text-sm sm:text-base uppercase font-bold transition-transform active:scale-[0.99]"
                style={{ letterSpacing: "0.35em" }}
              >
                Enter
              </button>
            </GlowField>
          </div>
        </form>
      </div>
    </Shell>
  );
}

// --------------------------------------------------------------------------
// Judge picker
// --------------------------------------------------------------------------
function PickJudgeView({ onPick }: { onPick: (judge: Judge) => void }) {
  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div
            className="text-[10px] sm:text-xs uppercase font-bold"
            style={{ color: "#F5F019", letterSpacing: "0.4em" }}
          >
            Who&apos;s judging?
          </div>
          <p
            className="mt-3 text-sm sm:text-base uppercase font-bold text-white"
            style={{ letterSpacing: "0.12em" }}
          >
            Tap your name to start.
          </p>

          <div className="mt-6 space-y-2.5">
            {JUDGES.map((j) => (
              <GlowField key={j.id}>
                <button
                  type="button"
                  onClick={() => onPick(j)}
                  className="w-full min-h-[48px] bg-black text-white px-5 py-3 rounded-full text-sm sm:text-base uppercase font-bold transition-transform active:scale-[0.99]"
                  style={{ letterSpacing: "0.2em" }}
                >
                  {j.name}
                </button>
              </GlowField>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
