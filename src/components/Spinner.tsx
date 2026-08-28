import { Loader2 } from "lucide-react";

interface SpinnerProps {
  readonly size?: number;
  readonly className?: string;
}

export function Spinner({ size = 28, className = "" }: SpinnerProps) {
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
      className="flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center"
    >
      <Spinner size={56} className="text-primary" />
      <p className="text-base font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
