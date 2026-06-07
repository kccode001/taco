"use client";

import { MicButton } from "../MicButton";

export interface BurningAnswer {
  questionId: string;
  text: string;
}

interface BurningQuestionCardProps {
  questionId: string;
  text: string;
  answer: string;
  onAnswerChange: (s: string) => void;
  onRecord?: () => void;
  recording?: boolean;
}

export function BurningQuestionCard({
  text,
  answer,
  onAnswerChange,
  onRecord,
  recording,
}: BurningQuestionCardProps) {
  return (
    <div className="bg-white border border-taco-border rounded-[10px] p-3.5 mb-2 last:mb-0">
      <div className="text-[15px] font-semibold text-taco-text leading-snug mb-2.5">
        {text}
      </div>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Ketik jawaban…"
        className="w-full min-h-[60px] border-[1.5px] border-taco-border rounded-[10px] px-3.5 py-3 text-[15px] text-taco-text bg-white outline-none resize-y focus:border-taco-sub"
      />
      <div className="mt-2">
        <MicButton
          size="sm"
          label={recording ? "Berhenti merekam" : "Rekam Jawaban"}
          active={recording}
          onClick={onRecord}
        />
      </div>
    </div>
  );
}
