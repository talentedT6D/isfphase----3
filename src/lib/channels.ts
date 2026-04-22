"use client";

// Realtime broadcast channels. State is transient — if admin reloads,
// they rebroadcast the current state. No rows involved. Spec §6.3.

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PlaybackStatus = "playing" | "paused" | "stopped";

export interface PlaybackState {
  reel_id: string | null;
  status: PlaybackStatus;
  timestamp: number; // ms since epoch at broadcast
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
const REQUEST_EVENT = "request_state"; // admin rebroadcasts on request

export const INITIAL_PLAYBACK: PlaybackState = {
  reel_id: null,
  status: "stopped",
  timestamp: 0,
};

export const INITIAL_VOTING: VotingState = {
  reel_id: null,
  status: "idle",
  opened_at: null,
  closed_at: null,
};

// Hook: subscribe to a broadcast channel as a read-only listener.
// Returns the latest state and a helper to request the admin rebroadcast.
export function usePlaybackSubscriber() {
  const [state, setState] = useState<PlaybackState>(INITIAL_PLAYBACK);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const ch = supabase.channel(PLAYBACK_CHANNEL, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
      setState(payload as PlaybackState);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.send({ type: "broadcast", event: REQUEST_EVENT, payload: {} });
      }
    });
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, []);

  return state;
}

export function useVotingSubscriber() {
  const [state, setState] = useState<VotingState>(INITIAL_VOTING);

  useEffect(() => {
    const ch = supabase.channel(VOTING_CHANNEL, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: STATE_EVENT }, ({ payload }) => {
      setState(payload as VotingState);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        ch.send({ type: "broadcast", event: REQUEST_EVENT, payload: {} });
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return state;
}

// Hook for the admin: owns the current state and broadcasts it.
// Responds to late-join REQUEST_EVENT by rebroadcasting.
export function usePlaybackBroadcaster(initial: PlaybackState = INITIAL_PLAYBACK) {
  const [state, setStateInternal] = useState<PlaybackState>(initial);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const ch = supabase.channel(PLAYBACK_CHANNEL, {
      config: { broadcast: { self: true, ack: false } },
    });
    ch.on("broadcast", { event: REQUEST_EVENT }, () => {
      ch.send({ type: "broadcast", event: STATE_EVENT, payload: stateRef.current });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, []);

  const broadcast = (next: PlaybackState) => {
    setStateInternal(next);
    stateRef.current = next;
    channelRef.current?.send({
      type: "broadcast",
      event: STATE_EVENT,
      payload: next,
    });
  };

  return { state, broadcast };
}

export function useVotingBroadcaster(initial: VotingState = INITIAL_VOTING) {
  const [state, setStateInternal] = useState<VotingState>(initial);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const ch = supabase.channel(VOTING_CHANNEL, {
      config: { broadcast: { self: true, ack: false } },
    });
    ch.on("broadcast", { event: REQUEST_EVENT }, () => {
      ch.send({ type: "broadcast", event: STATE_EVENT, payload: stateRef.current });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, []);

  const broadcast = (next: VotingState) => {
    setStateInternal(next);
    stateRef.current = next;
    channelRef.current?.send({
      type: "broadcast",
      event: STATE_EVENT,
      payload: next,
    });
  };

  return { state, broadcast };
}
