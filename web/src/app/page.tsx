import { ProducerGrid } from '@/features/consumer/producer-grid';
import { RoomProvider } from '@/lib/conference/room-context';
import { TokenProvider } from '@/lib/conference/token-context';

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
