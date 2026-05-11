'use client';

import { ProducerCount } from './producer-count';
import { ProducerTile } from './producer-tile';
import { useWebRTCConsumer } from './use-webrtc-consumer';

export function ProducerGrid() {
  const producers = useWebRTCConsumer();
  return (
    <>
      <ProducerCount count={producers.length} />
      <div className="flex flex-wrap gap-4">
        {producers.map((producer) => (
          <ProducerTile producer={producer} key={producer.producerId} />
        ))}
      </div>
    </>
  );
}
