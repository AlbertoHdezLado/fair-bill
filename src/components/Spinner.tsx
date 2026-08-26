import { Loader2 } from "lucide-react";

interface SpinnerProps {
  readonly size?: number;
  readonly className?: string;
}

export function Spinner({ size = 20, className = "" }: SpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      size={size}
      className={`animate-spin ${className}`}
    />
  );
}

interface LoadingStateProps {
  readonly label: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center"
    >
      <Spinner size={32} className="text-primary" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
