import { ConnectedState } from './states/connected-state';
import { ErrorState } from './states/error-state';
import { IdleState } from './states/idle-state';
import { LoadingState } from './states/loading-state';

type VideoTileStatus = 'idle' | 'loading' | 'connected' | 'error';

interface VideoTileProps {
  id?: string;
  stream?: MediaStream;
  status?: VideoTileStatus;
  onStart?: () => void;
  onRetry?: () => void;
}

export function VideoTile({ id, stream, status = 'loading', onStart, onRetry }: VideoTileProps) {
  return (
    <div className="relative w-(--tile-width) h-(--tile-height) bg-gray-100 rounded-lg overflow-hidden">
      {status === 'idle' && <IdleState onStart={onStart} />}
      {status === 'loading' && <LoadingState />}
      {status === 'connected' && stream && <ConnectedState stream={stream} />}
      {status === 'error' && <ErrorState onRetry={onRetry} />}
      {id && (
        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-mono">
          {id}
        </span>
      )}
    </div>
  );
}
