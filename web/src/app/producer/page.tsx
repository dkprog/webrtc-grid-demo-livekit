'use client';

import { WebcamProducer } from '@/features/producer-livekit/webcam-producer';
import { RoomProvider } from '@/lib/livekit/room-context';
import { TokenProvider } from '@/lib/livekit/token-context';

export default function Page() {
  return (
    <TokenProvider role="producer">
      <RoomProvider>
        <main className="min-h-screen p-6 bg-gray-50">
          <WebcamProducer />
        </main>
      </RoomProvider>
    </TokenProvider>
  );
}
