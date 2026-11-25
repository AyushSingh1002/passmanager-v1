import React from 'react';
import { evaluatePasswordStrength } from '../../core/password';

interface StrengthMeterProps {
  password: string;
  showFeedback?: boolean;
}

export const StrengthMeter: React.FC<StrengthMeterProps> = ({ password, showFeedback = true }) => {
  const result = evaluatePasswordStrength(password);

  const widthPct = password ? ((result.score + 1) / 5) * 100 : 0;

  let colorVar = 'var(--vl-weak)';
  if (result.score === 2) colorVar = 'var(--vl-fair)';
  if (result.score >= 3) colorVar = 'var(--vl-strong)';

  return (
    <div className="space-y-1.5">
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-[var(--vl-surface-muted)]">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{
            width: `${widthPct}%`,
            backgroundColor: password ? colorVar : 'transparent',
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: password ? colorVar : 'var(--vl-text-secondary)' }}>
          {password ? result.label : 'No password entered'}
        </span>
        {password && (
          <span className="tabular-nums text-[var(--vl-text-secondary)]">
            {result.totalEntropyBits} bits · {result.crackTimeDisplay}
          </span>
        )}
      </div>
      {showFeedback && password && result.feedback.length > 0 && (
        <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
          {result.feedback[0]}
        </p>
      )}
    </div>
  );
};
