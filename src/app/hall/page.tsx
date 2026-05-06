"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaybackSubscriber } from "@/lib/channels";
import { REELS, findReel } from "@/lib/reels";

type Slot = "A" | "B";

export default function HallPage() {
  const state = usePlaybackSubscriber();
  const adminReel = findReel(state.reel_id);

  // Pre-show: admin hasn't broadcast yet. Autoplay the first reel muted so
  // the screen looks live (browsers only allow muted autoplay without a gesture).
  const isPreShow = state.reel_id === null && state.status === "stopped";
  const isAdminStop = state.reel_id !== null && state.status === "stopped";
  const reel = adminReel ?? REELS[0] ?? null;
  const isPlaying = isPreShow || state.status === "playing";

  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<Slot>("A");
  const slotReel = useRef<{ A: string | null; B: string | null }>({
    A: null,
    B: null,
  });

  const currentIdx = reel
    ? REELS.findIndex((r) => r.reel_id === reel.reel_id)
    : -1;
  const nextReel = currentIdx >= 0 ? REELS[currentIdx + 1] ?? null : null;

  // Drive the active slot to show the current reel. If the inactive slot has
  // already preloaded the new reel, the swap is instant — just a 500ms opacity
  // crossfade. Otherwise we load it, wait for canplay, then swap.
  useEffect(() => {
    if (isAdminStop || !reel) return;
    const aVideo = aRef.current;
    const bVideo = bRef.current;
    if (!aVideo || !bVideo) return;

    const target = reel.reel_id;
    const activeVideo = active === "A" ? aVideo : bVideo;

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

    const inactive: Slot = active === "A" ? "B" : "A";
    const inactiveVideo = inactive === "A" ? aVideo : bVideo;

    if (slotReel.current[inactive] !== target) {
      inactiveVideo.src = reel.file_path;
      inactiveVideo.load();
      slotReel.current[inactive] = target;
    }

    const swap = () => {
      if (isPlaying) inactiveVideo.play().catch(() => {});
      setActive(inactive);
      window.setTimeout(() => activeVideo.pause(), 500);
    };

    if (inactiveVideo.readyState >= 3) {
      swap();
      return;
    }
    inactiveVideo.addEventListener("canplay", swap, { once: true });
    return () => inactiveVideo.removeEventListener("canplay", swap);
  }, [reel, isPlaying, isAdminStop, active]);

  // Preload the next reel into whichever slot is currently inactive, so the
  // next swap is a fade not a fetch.
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

  if (isAdminStop) return <HoldingSlate />;

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={aRef}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${active === "A" ? "opacity-100 z-10" : "opacity-0 z-0"}`}
        playsInline
        muted={isPreShow}
        preload="auto"
      />
      <video
        ref={bRef}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${active === "B" ? "opacity-100 z-10" : "opacity-0 z-0"}`}
        playsInline
        muted={isPreShow}
        preload="auto"
      />
    </div>
  );
}

function HoldingSlate() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
      <div className="text-[10px] tracking-[0.4em] text-white/50">
        INDIAN SCROLL FESTIVAL · 2026
      </div>
      <div className="mt-6 text-5xl font-semibold tracking-tight">ISF</div>
      <div className="mt-2 text-white/40 text-sm">
        Bangalore International Centre · 16 May 2026
      </div>
    </div>
  );
}
