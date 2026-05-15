"use client";

// Realtime broadcast channels for live updates, with the latest state also
// mirrored into a tiny `public.app_state` table so a refresh always lands
// on the current reel even if no admin tab is online to answer a
// request-state ping.

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PlaybackStatus = "playing" | "paused" | "stopped";

export interface PlaybackState {
  reel_id: string | null;
  status: PlaybackStatus;
  timestamp: number; // ms since epoch at broadcast
  position: number; // seconds into the reel at the time of broadcast
}

export type VotingStatus = "open" | "closed" | "idle";

export interface VotingState {
  reel_id: string | null;
  status: VotingStatus;
  opened_at: number | null;
  closed_at: number | null;
}

const PLAYBACK_CHANNEL = "playback";
const VOTING_CHANNEL = "voting";
const STATE_EVENT = "state";
const REQUEST_EVENT = "request_state";

const PLAYBACK_KEY = "playback";
const VOTING_KEY = "voting";

// Separate channels + DB keys for the winner-screen system (/win-hall +
// /win-admin). Keeping them isolated means the winner playback doesn't
// touch the festival playback the audience is watching on /hall.
const WIN_PLAYBACK_CHANNEL = "win-playback";
const WIN_VOTING_CHANNEL = "win-voting";
const WIN_PLAYBACK_KEY = "win-playback";
const WIN_VOTING_KEY = "win-voting";

export const INITIAL_PLAYBACK: PlaybackState = {
  reel_id: null,
  status: "stopped",
  timestamp: 0,
  position: 0,
};

export const INITIAL_VOTING: VotingState = {
  reel_id: null,
  status: "idle",
  opened_at: null,
  closed_at: null,
};

async function loadState<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

async function persistState(key: string, value: unknown) {
  const { error } = await supabase
    .from("app_state")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error(`[app_state] upsert ${key} failed`, error);
}

// Subscribe-to-changes hook for a single app_state row plus the broadcast
// channel. The DB row is the source of truth on mount; broadcasts give
// low-latency live updates between refreshes.
function useSyncedState<T>(
  channelName: string,
  key: string,
  initial: T,
): T {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    let cancelled = false;

    // 1. Load whatever the DB says is current.
    loadState<T>(key).then((value) => {
      if (cancelled || !value) return;
      setState(value);
    });

    // 2. Live updates over the broadcast channel (fast path).
    const ch = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
      setState(payload as T);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.send({ type: "broadcast", event: REQUEST_EVENT, payload: {} });
      }
    });

    // 3. Postgres changes as a backup live channel — also fires if a sibling
    //    admin tab persists state without us hearing the broadcast.
    const dbCh = supabase
      .channel(`${channelName}-db`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
          filter: `key=eq.${key}`,
        },
        (payload) => {
          const row = payload.new as { value: T } | null;
          if (row?.value) setState(row.value);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      supabase.removeChannel(dbCh);
    };
  }, [channelName, key]);

  return state;
}

export function usePlaybackSubscriber() {
  return useSyncedState<PlaybackState>(
    PLAYBACK_CHANNEL,
    PLAYBACK_KEY,
    INITIAL_PLAYBACK,
  );
}

export function useVotingSubscriber() {
  return useSyncedState<VotingState>(
    VOTING_CHANNEL,
    VOTING_KEY,
    INITIAL_VOTING,
  );
}

// Publisher hook: send state on this channel without claiming authority over
// it (no REQUEST_EVENT response). Anyone using a broadcaster or subscriber
// on the same channel will pick it up via STATE_EVENT and/or postgres_changes.
function useSyncedPublisher<T>(
  channelName: string,
  key: string,
): (state: T) => void {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const ch = supabase.channel(channelName, {
      config: { broadcast: { self: true, ack: false } },
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelName]);

  return (state: T) => {
    channelRef.current?.send({
      type: "broadcast",
      event: STATE_EVENT,
      payload: state,
    });
    void persistState(key, state);
  };
}

export function usePlaybackPublisher() {
  return useSyncedPublisher<PlaybackState>(PLAYBACK_CHANNEL, PLAYBACK_KEY);
}

export function useVotingPublisher() {
  return useSyncedPublisher<VotingState>(VOTING_CHANNEL, VOTING_KEY);
}

// Broadcaster hook. Owns the canonical state: writes it to the DB and emits
// it over the broadcast channel. Also rehydrates from the DB on mount, so
// an admin reload doesn't reset the show to "stopped".
function useSyncedBroadcaster<T>(
  channelName: string,
  key: string,
  initial: T,
) {
  const [state, setStateInternal] = useState<T>(initial);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    loadState<T>(key).then((value) => {
      if (cancelled || !value) return;
      stateRef.current = value;
      setStateInternal(value);
    });

    const ch = supabase.channel(channelName, {
      config: { broadcast: { self: true, ack: false } },
    });
    ch.on("broadcast", { event: REQUEST_EVENT }, () => {
      ch.send({
        type: "broadcast",
        event: STATE_EVENT,
        payload: stateRef.current,
      });
    });
    // Also accept state updates from other broadcasters (e.g. the hall page
    // auto-advancing on `ended`), so this tab stays in sync.
    ch.on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
      stateRef.current = payload as T;
      setStateInternal(payload as T);
    });
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelName, key]);

  const broadcast = (next: T) => {
    setStateInternal(next);
    stateRef.current = next;
    channelRef.current?.send({
      type: "broadcast",
      event: STATE_EVENT,
      payload: next,
    });
    void persistState(key, next);
  };

  return { state, broadcast };
}

export function usePlaybackBroadcaster(
  initial: PlaybackState = INITIAL_PLAYBACK,
) {
  return useSyncedBroadcaster<PlaybackState>(
    PLAYBACK_CHANNEL,
    PLAYBACK_KEY,
    initial,
  );
}

export function useVotingBroadcaster(initial: VotingState = INITIAL_VOTING) {
  return useSyncedBroadcaster<VotingState>(
    VOTING_CHANNEL,
    VOTING_KEY,
    initial,
  );
}

// --- Winner-screen channels ---------------------------------------------
// Same hooks as above but pointed at the WIN_* channels and DB keys so the
// /win-admin + /win-hall pair operates entirely independently of the main
// /admin + /hall + voter system.

export function useWinPlaybackSubscriber() {
  return useSyncedState<PlaybackState>(
    WIN_PLAYBACK_CHANNEL,
    WIN_PLAYBACK_KEY,
    INITIAL_PLAYBACK,
  );
}

export function useWinVotingSubscriber() {
  return useSyncedState<VotingState>(
    WIN_VOTING_CHANNEL,
    WIN_VOTING_KEY,
    INITIAL_VOTING,
  );
}

export function useWinPlaybackPublisher() {
  return useSyncedPublisher<PlaybackState>(
    WIN_PLAYBACK_CHANNEL,
    WIN_PLAYBACK_KEY,
  );
}

export function useWinVotingPublisher() {
  return useSyncedPublisher<VotingState>(WIN_VOTING_CHANNEL, WIN_VOTING_KEY);
}

export function useWinPlaybackBroadcaster(
  initial: PlaybackState = INITIAL_PLAYBACK,
) {
  return useSyncedBroadcaster<PlaybackState>(
    WIN_PLAYBACK_CHANNEL,
    WIN_PLAYBACK_KEY,
    initial,
  );
}

export function useWinVotingBroadcaster(
  initial: VotingState = INITIAL_VOTING,
) {
  return useSyncedBroadcaster<VotingState>(
    WIN_VOTING_CHANNEL,
    WIN_VOTING_KEY,
    initial,
  );
}
