import { ProducerCount } from '@/features/consumer/producer-count';
import { ProducerGrid } from '@/features/consumer/producer-grid';
import { SocketProvider } from '@/lib/signaling/socket-context';

export default function Page() {
  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <SocketProvider role="consumer">
        <ProducerGrid />
      </SocketProvider>
    </main>
  );
}
