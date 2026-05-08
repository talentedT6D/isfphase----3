"use client";

import { useEffect, useRef, useState } from "react";
import {
  usePlaybackSubscriber,
  type PlaybackState,
} from "@/lib/channels";
import { REELS, findReel } from "@/lib/reels";

type Slot = "A" | "B";

export default function HallPage() {
  const state = usePlaybackSubscriber();

  // Once admin has broadcast anything (timestamp > 0), we leave pre-show for
  // good. The flag is sticky so an admin reload doesn't bounce hall back to
  // the muted pre-show clip mid-event.
  const [sessionStarted, setSessionStarted] = useState(false);
  useEffect(() => {
    if (state.timestamp > 0) setSessionStarted(true);
  }, [state.timestamp]);

  if (!sessionStarted) return <PreShow />;
  if (state.status === "stopped") return <HoldingSlate />;
  return <LiveStage state={state} />;
}

// Muted, looping clip of the first reel so the hall isn't sitting on a dark
// slate while the venue is still filling in.
function PreShow() {
  const first = REELS[0];
  if (!first) return <HoldingSlate />;
  return (
    <div className="fixed inset-0 bg-black">
      <video
        className="absolute inset-0 w-full h-full object-contain"
        src={first.file_path}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
    </div>
  );
}

function LiveStage({ state }: { state: PlaybackState }) {
  const reel = findReel(state.reel_id);
  const isPlaying = state.status === "playing";

  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<Slot>("A");
  // What reel each video element currently has loaded.
  const slotReel = useRef<{ A: string | null; B: string | null }>({
    A: null,
    B: null,
  });

  // Park the inactive slot off-screen below the viewport so the first swap
  // can slide it up into place. We set transforms imperatively (not via the
  // JSX style prop) so React re-renders never overwrite a transition mid-flight.
  useEffect(() => {
    if (aRef.current) aRef.current.style.transform = "translate3d(0,0,0)";
    if (bRef.current) bRef.current.style.transform = "translate3d(0,100%,0)";
  }, []);

  const currentIdx = reel
    ? REELS.findIndex((r) => r.reel_id === reel.reel_id)
    : -1;
  const nextReel = currentIdx >= 0 ? REELS[currentIdx + 1] ?? null : null;

  // Drive the active slot to show the current reel. Transitions slide the new
  // reel up from below (Instagram-reel style) while the outgoing reel slides
  // off the top edge.
  useEffect(() => {
    if (!reel) return;
    const aVideo = aRef.current;
    const bVideo = bRef.current;
    if (!aVideo || !bVideo) return;

    const target = reel.reel_id;
    const activeVideo = active === "A" ? aVideo : bVideo;
    const inactive: Slot = active === "A" ? "B" : "A";
    const inactiveVideo = inactive === "A" ? aVideo : bVideo;

    if (slotReel.current[active] === target) {
      if (isPlaying) activeVideo.play().catch(() => {});
      else activeVideo.pause();
      return;
    }

    if (slotReel.current[active] === null) {
      activeVideo.src = reel.file_path;
      activeVideo.load();
      slotReel.current[active] = target;
      const start = () => {
        if (isPlaying) activeVideo.play().catch(() => {});
      };
      if (activeVideo.readyState >= 3) {
        start();
        return;
      }
      activeVideo.addEventListener("canplay", start, { once: true });
      return () => activeVideo.removeEventListener("canplay", start);
    }

    if (slotReel.current[inactive] !== target) {
      inactiveVideo.src = reel.file_path;
      inactiveVideo.load();
      slotReel.current[inactive] = target;
    }

    const swap = () => {
      if (isPlaying) inactiveVideo.play().catch(() => {});

      // Snap the incoming slot to the off-screen-below position with no
      // transition (it may have been parked at -100% from the previous swap),
      // force a reflow, then animate it up to 0 alongside the outgoing slot.
      const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
      inactiveVideo.style.transition = "none";
      inactiveVideo.style.transform = "translate3d(0,100%,0)";
      // Force reflow so the next transition takes effect.
      void inactiveVideo.offsetHeight;
      inactiveVideo.style.transition = `transform 450ms ${easing}`;
      inactiveVideo.style.transform = "translate3d(0,0,0)";

      activeVideo.style.transition = `transform 450ms ${easing}`;
      activeVideo.style.transform = "translate3d(0,-100%,0)";
      activeVideo.pause();

      setActive(inactive);
    };

    if (inactiveVideo.readyState >= 3) {
      swap();
      return;
    }
    inactiveVideo.addEventListener("canplay", swap, { once: true });
    return () => inactiveVideo.removeEventListener("canplay", swap);
  }, [reel, isPlaying, active]);

  // Preload the next reel into whichever slot is currently inactive so the
  // upcoming swap is instant.
  useEffect(() => {
    if (!nextReel || !reel) return;
    const inactive: Slot = active === "A" ? "B" : "A";
    if (slotReel.current[inactive] === nextReel.reel_id) return;
    if (slotReel.current[inactive] === reel.reel_id) return;
    const inactiveVideo = (inactive === "A" ? aRef : bRef).current;
    if (!inactiveVideo) return;
    inactiveVideo.src = nextReel.file_path;
    inactiveVideo.load();
    slotReel.current[inactive] = nextReel.reel_id;
  }, [nextReel, active, reel]);

  if (!reel) return <HoldingSlate />;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={aRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ willChange: "transform" }}
        playsInline
        preload="auto"
      />
      <video
        ref={bRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ willChange: "transform" }}
        playsInline
        preload="auto"
      />
    </div>
  );
}

function HoldingSlate() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="ISF"
        className="h-32 w-auto"
      />
      <div className="mt-6 text-white/50 text-sm tracking-[0.3em]">
        BANGALORE INTERNATIONAL CENTRE · 16 MAY 2026
      </div>
    </div>
  );
}
