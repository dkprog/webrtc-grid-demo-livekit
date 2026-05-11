import { io, type Socket } from 'socket.io-client';
import type { Role } from './types';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:3001';

export function createSignalingSocket(peerId: string, role: Role): Socket {
  return io(SIGNALING_URL, {
    auth: { peerId, role },
    autoConnect: false,
  });
}
