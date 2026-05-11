import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  onRetry?: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-800 text-white">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm">Connection failed</p>
      <button
        onClick={onRetry}
        className="px-3 py-1 text-xs font-medium rounded bg-white/10 hover:bg-white/20 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
