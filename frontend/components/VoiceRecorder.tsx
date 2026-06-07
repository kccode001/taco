"use client";

import { useState, useRef, useCallback } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  className?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function VoiceRecorder({ onTranscript, className }: VoiceRecorderProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const win = window as unknown as Record<string, unknown>;
    const SpeechRecognitionAPI = (win["SpeechRecognition"] || win["webkitSpeechRecognition"]) as (new () => SpeechRecognitionInstance) | undefined;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <button
      type="button"
      onClick={isListening ? stopListening : startListening}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-lg border border-taco-border bg-white flex-shrink-0 transition-colors",
        isListening && "border-taco-error bg-red-50",
        className
      )}
    >
      <Mic
        size={20}
        className={cn(
          "text-taco-sub",
          isListening && "text-taco-error animate-pulse"
        )}
      />
      <span className="text-[10px] text-taco-sub leading-none">
        {isListening ? "Stop" : "Bicara"}
      </span>
    </button>
  );
}
