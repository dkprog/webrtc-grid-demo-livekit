'use client';

import { WebcamProducer } from '@/features/producer/webcam-producer';
import { RoomProvider } from '@/lib/conference/room-context';
import { TokenProvider } from '@/lib/conference/token-context';

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
