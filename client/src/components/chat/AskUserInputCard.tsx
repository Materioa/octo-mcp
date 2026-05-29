import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat";
import type { ToolCall } from "@/types";

interface AskUserInputCardProps {
  toolCall: ToolCall;
}

export function AskUserInputCard({ toolCall }: AskUserInputCardProps) {
  const submitUserInput = useChatStore((s) => s.submitUserInput);
  
  const args = toolCall.args || {};
  const questions = (args.questions as any[]) || [];
  
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [customInput, setCustomInput] = useState("");

  const isCompleted = toolCall.status === "completed" || toolCall.status === "error";

  if (questions.length === 0) return null;

  if (isCompleted) {
    // Re-render as plain text Q&A matching the 2nd screenshot
    return (
      <div className="flex flex-col gap-4 text-[15px] my-4 text-foreground">
        {questions.map((q, i) => {
          let answerText = "";
          if (Array.isArray(answers[i])) {
            answerText = answers[i].join(", ");
          } else {
            answerText = answers[i] || "Skipped";
          }
          return (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="font-semibold text-foreground/90">Q: {q.question}</div>
              <div className="text-muted-foreground">A: {answerText}</div>
            </div>
          );
        })}
      </div>
    );
  }

  const q = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const submitAll = (finalAnswers: Record<number, any>) => {
    const result = questions.map((question, i) => ({
      question: question.question,
      answer: finalAnswers[i] || (question.is_multi_select ? [] : "")
    }));
    submitUserInput(toolCall.id, result);
  };

  const handleNext = (finalAnswerForCurrent?: any) => {
    const newAnswers = { ...answers };
    if (finalAnswerForCurrent !== undefined) {
      newAnswers[currentIndex] = finalAnswerForCurrent;
      setAnswers(newAnswers);
    }
    
    if (isLast) {
      submitAll(newAnswers);
    } else {
      setCurrentIndex(i => i + 1);
      setCustomInput("");
    }
  };

  const hasSelectedMulti = q.is_multi_select && Array.isArray(answers[currentIndex]) && answers[currentIndex].length > 0;

  return (
    <div className="my-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden p-4">
      <div className="flex items-center justify-between pb-4">
        <h3 className="text-sm font-medium text-foreground">{q.question}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 ml-4">
          {questions.length > 1 && (
            <>
              <button 
                disabled={currentIndex === 0} 
                onClick={() => setCurrentIndex(i => i - 1)}
                className="hover:text-foreground disabled:opacity-30 transition-colors"
              >
                &lt;
              </button>
              <span>{currentIndex + 1} of {questions.length}</span>
              <button 
                disabled={currentIndex === questions.length - 1} 
                onClick={() => setCurrentIndex(i => i + 1)}
                className="hover:text-foreground disabled:opacity-30 transition-colors"
              >
                &gt;
              </button>
            </>
          )}
          <button 
            onClick={() => submitAll(answers)} 
            className="ml-2 hover:text-foreground transition-colors"
            title="Close and submit current answers"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {q.options?.map((opt: string, optIdx: number) => {
          if (q.is_multi_select) {
            const isSelected = (answers[currentIndex] || []).includes(opt);
            return (
              <button 
                key={optIdx} 
                onClick={() => {
                  const current = answers[currentIndex] || [];
                  const next = isSelected ? current.filter((x: string) => x !== opt) : [...current, opt];
                  setAnswers(prev => ({ ...prev, [currentIndex]: next }));
                }}
                className={`flex items-center gap-3 p-3 text-left rounded-lg border transition-colors ${isSelected ? 'bg-secondary border-border' : 'bg-transparent border-transparent hover:border-border hover:bg-secondary/50'}`}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-background border border-border text-xs">
                  {isSelected ? "✓" : optIdx + 1}
                </div>
                <span className="text-sm">{opt}</span>
              </button>
            );
          } else {
            const isSelected = answers[currentIndex] === opt;
            return (
              <button 
                key={optIdx} 
                onClick={() => handleNext(opt)}
                className={`flex items-center gap-3 p-3 text-left rounded-lg border transition-colors ${isSelected ? 'bg-secondary border-border' : 'bg-transparent border-transparent hover:border-border hover:bg-secondary/50'}`}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-secondary text-secondary-foreground text-xs font-medium">
                  {optIdx + 1}
                </div>
                <span className="text-sm">{opt}</span>
              </button>
            );
          }
        })}

        <div className="flex items-center gap-3 mt-2 bg-secondary/30 p-2 pl-3 rounded-lg border border-border/50 focus-within:border-border focus-within:bg-secondary/50 transition-colors">
          <svg className="text-muted-foreground shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          <input 
            type="text" 
            placeholder="Something else" 
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customInput.trim()) {
                handleNext(customInput.trim());
              }
            }}
            className="bg-transparent border-none outline-none flex-1 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-3 bg-background hover:bg-secondary text-foreground rounded-md border-border"
            onClick={() => {
              if (customInput.trim()) {
                handleNext(customInput.trim());
              } else if (hasSelectedMulti) {
                handleNext();
              } else {
                handleNext("");
              }
            }}
          >
            {customInput.trim() ? (isLast ? "Submit" : "Next") : (hasSelectedMulti ? (isLast ? "Submit" : "Next") : "Skip")}
          </Button>
        </div>
      </div>
    </div>
  );
}
