"use client";

import { useEffect, useState } from "react";
import { JUDGES, checkJudgePassword, type Judge } from "@/lib/judges";
import {
  FullBleed,
  GlowField,
  Shell,
  VotingExperience,
} from "@/components/voting";

const JUDGE_ID_KEY = "isf-judge-id";

export default function JudgePage() {
  const [judge, setJudge] = useState<Judge | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedId = window.localStorage.getItem(JUDGE_ID_KEY);
    setJudge(JUDGES.find((j) => j.id === savedId) ?? null);
    setReady(true);
  }, []);

  if (!ready) return <FullBleed>Loading…</FullBleed>;

  if (!judge) {
    return (
      <LoginView
        onLogin={(j) => {
          window.localStorage.setItem(JUDGE_ID_KEY, j.id);
          setJudge(j);
        }}
      />
    );
  }

  const handleLogout = () => {
    window.localStorage.removeItem(JUDGE_ID_KEY);
    setJudge(null);
  };

  return <VotingExperience voter={judge} onLogout={handleLogout} />;
}

// --------------------------------------------------------------------------
// Login: pick your name, enter your password.
// --------------------------------------------------------------------------
function LoginView({ onLogin }: { onLogin: (judge: Judge) => void }) {
  const [judgeId, setJudgeId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const judge = JUDGES.find((j) => j.id === judgeId);
    if (!judge) {
      setErr("Pick your name");
      return;
    }
    if (!checkJudgePassword(judge, pw)) {
      setErr("Wrong password");
      return;
    }
    onLogin(judge);
  };

  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center">
        <form onSubmit={submit} className="w-full max-w-sm text-center">
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
            Pick your name and enter your password to start scoring.
          </p>

          <select
            value={judgeId}
            onChange={(e) => {
              setJudgeId(e.target.value);
              setErr("");
            }}
            className="mt-6 w-full min-h-[48px] bg-black text-white text-center px-5 py-3 rounded-full text-sm uppercase border border-white/25 focus:outline-none focus:border-white/70"
            style={{ letterSpacing: "0.2em" }}
          >
            <option value="">Select your name…</option>
            {JUDGES.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>

          <input
            type="password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr("");
            }}
            placeholder="Password"
            className="mt-2.5 w-full min-h-[48px] bg-black text-white text-center px-5 py-3 rounded-full text-sm uppercase border border-white/25 focus:outline-none focus:border-white/70"
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
