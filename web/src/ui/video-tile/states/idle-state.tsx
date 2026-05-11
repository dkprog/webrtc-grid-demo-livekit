import { Video } from 'lucide-react';

interface IdleStateProps {
  onStart?: () => void;
}

export function IdleState({ onStart }: IdleStateProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gray-800 text-white">
      <Video className="w-8 h-8 text-gray-400" />
      <p className="text-sm">Ready to start</p>
      <button
        onClick={onStart}
        className="px-3 py-1 text-xs font-medium rounded bg-white/10 hover:bg-white/20 transition-colors"
      >
        Start
      </button>
    </div>
  );
}
