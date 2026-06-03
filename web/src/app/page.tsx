import { ProducerGrid } from '@/features/consumer/producer-grid';
import { RoomProvider } from '@/lib/livekit/room-context';
import { TokenProvider } from '@/lib/livekit/token-context';

export default function Page() {
  return (
    <TokenProvider role="consumer">
      <RoomProvider>
        <main className="min-h-screen p-6 bg-gray-50">
          <ProducerGrid />
        </main>
      </RoomProvider>
    </TokenProvider>
  );
}
