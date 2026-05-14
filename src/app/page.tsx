"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  FullBleed,
  GlowField,
  Shell,
  VotingExperience,
  type Voter,
} from "@/components/voting";

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

export default function HomePage() {
  const [voter, setVoter] = useState<Voter | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setVoter(voterFromSession(data.session));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setVoter(voterFromSession(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

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
                  ? window.location.origin
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
  };

  return <VotingExperience voter={voter} onLogout={handleLogout} />;
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
            Vote on the reels playing on the big screen. Keep this tab open for
            the whole event.
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
