"use client";

import { useEffect, useRef } from "react";
import { usePlaybackSubscriber } from "@/lib/channels";
import { findReel } from "@/lib/reels";

export default function HallPage() {
  const state = usePlaybackSubscriber();
  const reel = findReel(state.reel_id);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load new src when the reel changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !reel) return;
    if (video.src.endsWith(reel.file_path)) return;
    video.src = reel.file_path;
    video.load();
  }, [reel]);

  // Sync play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (state.status === "playing") {
      video.play().catch(() => {
        // Autoplay may require a click; admin should click once on the hall laptop.
      });
    } else {
      video.pause();
    }
  }, [state.status]);

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
      <div className="mt-6 text-5xl font-semibold tracking-tight">
        ISF
      </div>
      <div className="mt-2 text-white/40 text-sm">
        Bangalore International Centre · 16 May 2026
      </div>
    </div>
  );
}
