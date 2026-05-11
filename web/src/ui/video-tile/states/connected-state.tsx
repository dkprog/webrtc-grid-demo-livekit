import { VideoStream } from '@/ui/video-stream';

interface ConnectedStateProps {
  stream?: MediaStream;
}

export function ConnectedState({ stream }: ConnectedStateProps) {
  return <VideoStream stream={stream} className="w-full h-full object-cover" muted />;
}
