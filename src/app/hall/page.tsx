"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePlaybackSubscriber,
  type PlaybackState,
} from "@/lib/channels";
import { REELS } from "@/lib/reels";
import { findPlayable } from "@/lib/non-votable";
import { LOADING_ANIM } from "@/lib/loading-anim";

type Slot = "A" | "B";

// Start a reel as soon as it has a few frames ready (canplay), so it appears
// fast. Falls through to a listener if it isn't ready yet.
function whenPlayable(video: HTMLVideoElement, cb: () => void): () => void {
  if (video.readyState >= 3) {
    cb();
    return () => {};
  }
  const onReady = () => {
    video.removeEventListener("canplay", onReady);
    cb();
  };
  video.addEventListener("canplay", onReady, { once: true });
  return () => video.removeEventListener("canplay", onReady);
}

export default function HallPage() {
  const state = usePlaybackSubscriber();

  // Once admin has broadcast anything (timestamp > 0), we leave pre-show for
  // good. The flag is sticky so an admin reload doesn't bounce hall back to
  // the muted pre-show clip mid-event.
  const [sessionStarted, setSessionStarted] = useState(false);
  useEffect(() => {
    if (state.timestamp > 0) setSessionStarted(true);
  }, [state.timestamp]);

  // Browser autoplay policy: a video element can't start (with audio) until
  // the page has had a user gesture. We gate the whole hall behind a click
  // so playback can start cleanly when admin cues a reel.
  const [unlocked, setUnlocked] = useState(false);
  if (!unlocked) return <StartGate onStart={() => setUnlocked(true)} />;

  if (!sessionStarted) return <PreShow />;
  // Once admin has cued a reel we keep the video on screen for every state —
  // playing, paused, or stopped. The holding slate only ever shows in the
  // very-initial pre-show / no-reel-yet case (handled by LiveStage when
  // state.reel_id is null).
  return <LiveStage state={state} />;
}

// One-time gate so the operator has clicked the hall page before any video
// tries to play with sound. The click in onClick handler primes the browser
// autoplay allowance for the rest of the session by play()ing a tiny clip
// synchronously inside the gesture.
function StartGate({ onStart }: { onStart: () => void }) {
  const primeRef = useRef<HTMLVideoElement>(null);
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white cursor-pointer"
      onClick={async () => {
        const v = primeRef.current;
        if (v) {
          try {
            await v.play();
          } catch {}
        }
        onStart();
      }}
    >
      <video
        ref={primeRef}
        src={LOADING_ANIM.file_path}
        muted
        playsInline
        preload="auto"
        style={{ display: "none" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="ISF" className="h-32 w-auto" />
      <div className="mt-8 text-white/70 text-sm tracking-[0.3em]">
        CLICK ANYWHERE TO START
      </div>
    </div>
  );
}

// Muted, looping clip of the first reel so the hall isn't sitting on a dark
// slate while the venue is still filling in.
function PreShow() {
  const first = REELS[0];
  if (!first) return <HoldingSlate />;
  return (
    <div className="fixed inset-0 bg-black">
      {/* Warm the cache for the reels that come right after the opener. */}
      <PrefetchReels urls={REELS.slice(1, 4).map((r) => r.file_path)} />
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

// Low-priority <link rel="prefetch"> hints so upcoming reels are already in
// the browser cache before the operator gets to them.
function PrefetchReels({ urls }: { urls: string[] }) {
  return (
    <>
      {urls.map((url) => (
        <link key={url} rel="prefetch" href={url} />
      ))}
    </>
  );
}

function LiveStage({ state }: { state: PlaybackState }) {
  const reel = findPlayable(state.reel_id);
  const isPlaying = state.status === "playing";
  // Where admin says we should be in the reel right now. We compute this on
  // every render because admin sends `position` at the broadcast moment;
  // while playing, the actual current time has moved on.
  const desiredPosition =
    state.status === "playing"
      ? state.position + (Date.now() - state.timestamp) / 1000
      : state.position;

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

  // Remember the index of the last *regular* reel we were on, so during the
  // interstitial loading clip we can still preload the next real reel.
  const lastRegularIdxRef = useRef(-1);
  if (currentIdx >= 0) lastRegularIdxRef.current = currentIdx;
  const upcomingIdx =
    currentIdx >= 0 ? currentIdx + 1 : lastRegularIdxRef.current + 1;
  const nextReel = REELS[upcomingIdx] ?? null;

  // nextReel is already buffered into the inactive video slot below; prefetch
  // a few reels beyond it so Next-button jumps stay instant.
  const prefetchUrls = useMemo(
    () => REELS.slice(upcomingIdx + 1, upcomingIdx + 4).map((r) => r.file_path),
    [upcomingIdx],
  );

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
      // Same reel — re-seek if admin's broadcast position drifted >1s from
      // what we're showing (i.e. an explicit scrub, or a state replay).
      if (Math.abs(activeVideo.currentTime - desiredPosition) > 1) {
        activeVideo.currentTime = Math.max(0, desiredPosition);
      }
      if (isPlaying) activeVideo.play().catch(() => {});
      else activeVideo.pause();
      return;
    }

    if (slotReel.current[active] === null) {
      activeVideo.src = reel.file_path;
      activeVideo.load();
      slotReel.current[active] = target;
      const start = () => {
        if (desiredPosition > 0) {
          activeVideo.currentTime = desiredPosition;
        }
        if (isPlaying) activeVideo.play().catch(() => {});
      };
      return whenPlayable(activeVideo, start);
    }

    if (slotReel.current[inactive] !== target) {
      inactiveVideo.src = reel.file_path;
      inactiveVideo.load();
      slotReel.current[inactive] = target;
    }

    const swap = () => {
      if (desiredPosition > 0) {
        inactiveVideo.currentTime = desiredPosition;
      }
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

    return whenPlayable(inactiveVideo, swap);
    // desiredPosition is intentionally derived from state, so we depend on
    // state.position + state.timestamp instead of recomputing every render.
  }, [reel, isPlaying, active, state.position, state.timestamp]);

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
      <PrefetchReels urls={prefetchUrls} />
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
