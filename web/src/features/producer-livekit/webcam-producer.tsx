import { useTracks } from '@livekit/components-react';
import { usePeerId, useRoom } from '@/lib/livekit/room-context';
import { VideoTile } from '@/ui/video-tile';
import { useCallback, useEffect, useState } from 'react';
import { Track } from 'livekit-client';

type Status = 'idle' | 'loading' | 'connected' | 'error';

export function WebcamProducer() {
  const { room } = useRoom();
  const peerId = usePeerId();
  const trackReferences = useTracks([Track.Source.Camera], { room });
  const [status, setStatus] = useState<Status>('loading');
  const [localStream, setLocalStream] = useState<MediaStream>();

  useEffect(() => {
    if (peerId && status === 'loading') {
      setStatus('idle');
    }
  }, [peerId, status]);

  useEffect(() => {
    const localRef = trackReferences.find((ref) => ref.participant.isLocal);
    const track = localRef?.publication?.track;
    if (track?.mediaStream) {
      setLocalStream(track.mediaStream);
    } else {
      setLocalStream(undefined);
    }
  }, [trackReferences]);

  const handleStart = useCallback(async () => {
    setStatus('loading');
    if (!room) {
      return;
    }
    try {
      await room.localParticipant.setCameraEnabled(true);
      setStatus('connected');
    } catch (err) {
      setStatus('error');
    }
  }, [room]);

  return (
    <VideoTile
      id={room?.localParticipant.sid}
      stream={localStream}
      status={status}
      onStart={handleStart}
      onRetry={handleStart}
    />
  );
}
