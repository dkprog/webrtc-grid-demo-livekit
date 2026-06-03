'use client';

import { useRoom } from '@/lib/livekit/room-context';
import { ProducerCount } from './producer-count';
import { useRemoteParticipants } from '@livekit/components-react';
import { useMemo } from 'react';
import { ProducerTile } from './producer-tile';

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
        {producers.map((producer) => (
          <ProducerTile producer={producer} key={producer.sid} />
        ))}
      </div>
    </>
  );
}
