import { useState, useCallback } from 'react';
import {
  MessageCircleQuestion,
  Send,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { PermissionRequest, UserQuestion } from '@/types';

interface AskUserQuestionModalProps {
  request: PermissionRequest | null;
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

interface QuestionCardProps {
  question: UserQuestion;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer: string | string[] | undefined;
  customInput: string;
  onOptionSelect: (optionLabel: string) => void;
  onCustomInputChange: (value: string) => void;
  isLoading: boolean;
}

function QuestionCard({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  customInput,
  onOptionSelect,
  onCustomInputChange,
  isLoading,
}: QuestionCardProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const isExpanded = showCustomInput || customInput.trim().length > 0;

  const isSelected = (optionLabel: string) => {
    if (Array.isArray(selectedAnswer)) return selectedAnswer.includes(optionLabel);
    return selectedAnswer === optionLabel;
  };

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/50 p-3 dark:border-border-dark dark:bg-surface-dark-secondary/50">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {question.header || `Question ${questionIndex + 1}`}
          </span>
          {question.multiSelect && (
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-2xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              Multi-select
            </span>
          )}
        </div>
        {totalQuestions > 1 && (
          <span className="text-2xs text-text-tertiary dark:text-text-dark-tertiary">
            {questionIndex + 1}/{totalQuestions}
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-text-primary dark:text-text-dark-primary">
        {question.question}
      </p>

      {question.options && question.options.length > 0 && (
        <div className="space-y-1.5">
          {question.options.map((option, oIndex) => {
            const selected = isSelected(option.label);
            return (
              <button
                key={oIndex}
                type="button"
                onClick={() => onOptionSelect(option.label)}
                className={`group w-full rounded-md border px-2.5 py-2 text-left transition-all ${
                  selected
                    ? 'border-brand-500 bg-brand-500/10 dark:border-brand-400 dark:bg-brand-400/10'
                    : 'border-border bg-surface-tertiary/50 hover:border-brand-300 hover:bg-surface-hover dark:border-border-dark dark:bg-surface-dark-tertiary/50 dark:hover:border-brand-700 dark:hover:bg-surface-dark-hover'
                }`}
                disabled={isLoading}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      selected
                        ? 'border-brand-500 bg-brand-500 dark:border-brand-400 dark:bg-brand-400'
                        : 'border-border group-hover:border-border-secondary dark:border-border-dark dark:group-hover:border-border-dark-secondary'
                    }`}
                  >
                    {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-medium transition-colors ${
                        selected
                          ? 'text-brand-700 dark:text-brand-300'
                          : 'text-text-primary dark:text-text-dark-primary'
                      }`}
                    >
                      {option.label}
                    </p>
                    {option.description && (
                      <p className="mt-0.5 line-clamp-2 text-2xs text-text-secondary dark:text-text-dark-secondary">
                        {option.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 border-t border-border/30 pt-2 dark:border-border-dark/30">
        <button
          type="button"
          onClick={() => setShowCustomInput(!showCustomInput)}
          className="flex items-center gap-1.5 text-2xs text-text-tertiary transition-colors hover:text-text-secondary dark:text-text-dark-tertiary dark:hover:text-text-dark-secondary"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>Custom response</span>
        </button>

        {isExpanded && (
          <textarea
            placeholder="Type your own answer..."
            value={customInput}
            onChange={(e) => onCustomInputChange(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-primary placeholder-text-quaternary transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-border-dark dark:bg-surface-dark dark:text-text-dark-primary dark:placeholder-text-dark-tertiary"
            disabled={isLoading}
          />
        )}
      </div>
    </div>
  );
}

export function AskUserQuestionModal({
  request,
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
}: AskUserQuestionModalProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const hasSelectedAnswer = Object.values(answers).some(
    (a) => a && (Array.isArray(a) ? a.length > 0 : true),
  );
  const hasCustomInput = Object.values(customInputs).some((input) => input?.trim());
  const hasAnyAnswer = hasSelectedAnswer || hasCustomInput;

  const handleOptionSelect = useCallback(
    (questionIndex: number, optionLabel: string, multiSelect: boolean) => {
      const key = `question_${questionIndex}`;
      if (multiSelect) {
        const current = (answers[key] as string[]) ?? [];
        if (current.includes(optionLabel)) {
          setAnswers({ ...answers, [key]: current.filter((o) => o !== optionLabel) });
        } else {
          setAnswers({ ...answers, [key]: [...current, optionLabel] });
        }
      } else {
        setAnswers({ ...answers, [key]: optionLabel });
        setCustomInputs({ ...customInputs, [key]: '' });
      }
    },
    [answers, customInputs],
  );

  const handleCustomInputChange = useCallback(
    (questionIndex: number, value: string) => {
      setCustomInputs({ ...customInputs, [`question_${questionIndex}`]: value });
    },
    [customInputs],
  );

  const handleSubmit = useCallback(() => {
    const finalAnswers = { ...answers };
    const questions = (request?.tool_input?.questions ?? []) as UserQuestion[];
    Object.keys(customInputs).forEach((key) => {
      if (customInputs[key]?.trim()) {
        const existing = answers[key];
        const qIndex = parseInt(key.replace('question_', ''), 10);
        const isMultiSelect = questions[qIndex]?.multiSelect ?? false;
        if (Array.isArray(existing)) {
          finalAnswers[key] = [...existing, customInputs[key].trim()];
        } else if (existing) {
          finalAnswers[key] = customInputs[key].trim();
        } else {
          finalAnswers[key] = isMultiSelect ? [customInputs[key].trim()] : customInputs[key].trim();
        }
      }
    });
    onSubmit(finalAnswers);
  }, [answers, customInputs, onSubmit, request]);

  if (!request || request.tool_name !== 'AskUserQuestion') return null;

  const questions = (request.tool_input?.questions ?? []) as UserQuestion[];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl dark:border-border-dark dark:bg-surface-dark">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 dark:border-border-dark">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <MessageCircleQuestion className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary dark:text-text-dark-primary">
              Claude needs your input
            </h2>
            <p className="text-2xs text-text-secondary dark:text-text-dark-secondary">
              Answer to continue
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {questions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-text-tertiary dark:text-text-dark-tertiary">
              No questions available
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, qIndex) => (
                <QuestionCard
                  key={qIndex}
                  question={q}
                  questionIndex={qIndex}
                  totalQuestions={questions.length}
                  selectedAnswer={answers[`question_${qIndex}`]}
                  customInput={customInputs[`question_${qIndex}`] ?? ''}
                  onOptionSelect={(label) =>
                    handleOptionSelect(qIndex, label, q.multiSelect ?? false)
                  }
                  onCustomInputChange={(value) => handleCustomInputChange(qIndex, value)}
                  isLoading={isLoading}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 dark:border-border-dark">
          {error && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-error-50 px-2.5 py-1.5 text-xs text-error-600 dark:bg-error-900/20 dark:text-error-400">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={onCancel} variant="secondary" disabled={isLoading} className="flex-1">
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="primary"
              disabled={isLoading || !hasAnyAnswer}
              className="flex-1"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
