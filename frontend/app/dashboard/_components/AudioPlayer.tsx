"use client";

import { useEffect, useRef, useState } from "react";
import { AudioRecording } from "./types";

interface AudioPlayerProps {
  recording: AudioRecording;
  className?: string;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ recording, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setPosition(el.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setPosition(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) {
      setPlaying((p) => !p);
      return;
    }
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const display = playing && position > 0
    ? `${formatDuration(position)} / ${formatDuration(recording.duration_sec)}`
    : `Putar rekaman (${formatDuration(recording.duration_sec)})`;

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="audio-player"
      className={`inline-flex items-center gap-1.5 text-[12px] text-taco-sub hover:text-taco-text transition-colors ${className ?? ""}`}
    >
      {playing ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
      <span>{display}</span>
      {recording.url && (
        <audio ref={audioRef} src={recording.url} preload="none" />
      )}
    </button>
  );
}
