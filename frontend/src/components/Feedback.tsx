import type { ReactNode } from 'react';

export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'warning' | 'error' | 'success';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner ${tone}`} role="alert">
      <span>{children}</span>
      {onDismiss && (
        <button className="banner-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="center-inline">
      <div className="spinner" />
    </div>
  );
}
