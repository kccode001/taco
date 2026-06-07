import { BurningAnswer } from "./types";

interface Props {
  answer: BurningAnswer;
}

export function BurningQuestionAnswerCard({ answer }: Props) {
  return (
    <div
      data-testid="burning-answer-card"
      className="rounded-[10px] border p-3 mb-2.5"
      style={{
        background: "#FFF5F5",
        borderColor: "#FECACA",
        borderLeft: "3px solid #D32F2F",
      }}
    >
      <div className="text-[12px] font-bold mb-1.5" style={{ color: "#B91C1C" }}>
        {answer.question}
      </div>
      <div className="text-[14px] text-taco-text leading-relaxed">
        {answer.answer}
      </div>
    </div>
  );
}
