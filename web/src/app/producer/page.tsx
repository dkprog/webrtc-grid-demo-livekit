'use client';

import { WebcamProducer } from '@/features/producer/webcam-producer';
import { RoomProvider } from '@/lib/livekit/room-context';
import { TokenProvider } from '@/lib/livekit/token-context';
import { SocketProvider } from '@/lib/signaling/socket-context';

export default function Page() {
  return (
    <TokenProvider>
      <RoomProvider>
        <main className="min-h-screen p-6 bg-gray-50">
          {/* <SocketProvider role="producer">
        <WebcamProducer />
      </SocketProvider> */}
        </main>
      </RoomProvider>
    </TokenProvider>
  );
}
