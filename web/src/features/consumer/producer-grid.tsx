'use client';

import { useRoom } from '@/lib/livekit/room-context';
import { ProducerCount } from './producer-count';
import { useRemoteParticipants } from '@livekit/components-react';
import { useMemo } from 'react';
import { ProducerTile } from './producer-tile';

/*import { ProducerCount } from './producer-count';
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
}*/

export function ProducerGrid() {
  const { room } = useRoom();
  const participants = useRemoteParticipants({ room });
  const producers = useMemo(
    () =>
      participants
        .filter((p) => p.metadata === 'producer')
        .filter((p) => p.trackPublications.size > 0),
    [participants],
  );
  const totalProducers = useMemo(() => producers.length, [producers]);
  return (
    <>
      <ProducerCount count={totalProducers} />
      <div className="flex flex-wrap gap-4">
        {/* {producers.map((producer) => (
          <br />
        ))} */}
      </div>
    </>
  );
}
