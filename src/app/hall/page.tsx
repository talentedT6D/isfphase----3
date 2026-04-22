"use client";

import { useEffect, useRef } from "react";
import { usePlaybackSubscriber } from "@/lib/channels";
import { REELS, findReel } from "@/lib/reels";

export default function HallPage() {
  const state = usePlaybackSubscriber();
  const reel = findReel(state.reel_id);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentIdx = reel ? REELS.findIndex((r) => r.reel_id === reel.reel_id) : -1;
  const nextReel = currentIdx >= 0 ? REELS[currentIdx + 1] : null;

  // Single effect: swap src only when the reel actually changes, then start
  // playback as soon as the element has enough data. Prevents the race where
  // play() fires before load() finishes and stalls for a beat.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (reel) {
      const srcMatches = video.src.endsWith(reel.file_path);
      if (!srcMatches) {
        video.src = reel.file_path;
        video.load();
      }
    }

    if (state.status !== "playing" || !reel) {
      video.pause();
      return;
    }

    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay may need a one-time tap on the hall laptop.
      });
    };

    if (video.readyState >= 2) {
      tryPlay();
      return;
    }

    video.addEventListener("canplay", tryPlay, { once: true });
    return () => {
      video.removeEventListener("canplay", tryPlay);
    };
  }, [reel, state.status]);

  if (state.status === "stopped" || !reel) {
    return <HoldingSlate />;
  }

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        preload="auto"
      />
      {/* Warm the browser cache for the next reel so Next is instant. */}
      {nextReel && (
        <video
          key={nextReel.reel_id}
          src={nextReel.file_path}
          preload="auto"
          muted
          playsInline
          className="hidden"
        />
      )}
    </div>
  );
}

function HoldingSlate() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
      <div className="text-[10px] tracking-[0.4em] text-white/50">
        INDIAN SCROLL FESTIVAL · 2026
      </div>
      <div className="mt-6 text-5xl font-semibold tracking-tight">
        ISF
      </div>
      <div className="mt-2 text-white/40 text-sm">
        Bangalore International Centre · 16 May 2026
      </div>
    </div>
  );
}
