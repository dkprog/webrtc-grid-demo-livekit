import { useRoom } from '@/lib/livekit/room-context';
import { VideoTile } from '@/ui/video-tile';
import { TrackReference, useTracks } from '@livekit/components-react';
import { RemoteParticipant, Track } from 'livekit-client';
import { useMemo } from 'react';

interface ProducerTileProps {
  producer: RemoteParticipant;
}

function deriveStatus(ref?: TrackReference) {
  const pub = ref?.publication;

  if (!pub) {
    return 'idle';
  }
  if (!pub.isSubscribed || !pub.track) {
    return 'loading';
  }
  return 'connected';
}

export function ProducerTile({ producer }: ProducerTileProps) {
  const { room } = useRoom();
  const tracks = useTracks([Track.Source.Camera], { room });
  const producerTrack = useMemo(
    () => tracks.find((ref) => ref.participant.sid === producer.sid),
    [tracks, producer.sid],
  );
  const status = useMemo(() => deriveStatus(producerTrack), [producerTrack]);

  return (
    <VideoTile
      id={producer.sid}
      status={status}
      stream={producerTrack?.publication.track?.mediaStream}
    />
  );
}
