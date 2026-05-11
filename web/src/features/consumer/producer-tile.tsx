import { VideoTile } from '@/ui/video-tile';
import { ProducerEntry } from './use-webrtc-consumer';

interface ProducerTileProps {
  producer: ProducerEntry;
}

export function ProducerTile({ producer }: ProducerTileProps) {
  return <VideoTile id={producer.producerId} status={producer.status} stream={producer.stream} />;
}
