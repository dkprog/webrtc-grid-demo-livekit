import { WebcamProducer } from '@/features/producer/webcam-producer';
import { SocketProvider } from '@/lib/signaling/socket-context';

export default function Page() {
  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <SocketProvider role="producer">
        <WebcamProducer />
      </SocketProvider>
    </main>
  );
}
