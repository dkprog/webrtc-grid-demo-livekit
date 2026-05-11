'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Socket } from 'socket.io-client';
import { createSignalingSocket } from './client';
import type { Role } from './types';
import { generatePeerId } from '../peer-id';

interface SocketContextValue {
  socket?: Socket;
  peerId?: string;
}

const SocketContext = createContext<SocketContextValue>({});

interface SocketProviderProps {
  role: Role;
  children: ReactNode;
}

export function SocketProvider({ role, children }: SocketProviderProps) {
  const [peerId, setPeerId] = useState<string>();
  const [socket, setSocket] = useState<Socket>();

  useEffect(() => {
    const id = generatePeerId();
    setPeerId(id);

    const s = createSignalingSocket(id, role);
    s.connect();
    setSocket(s);

    const onPageHide = () => s.disconnect();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      s.disconnect();
      setSocket(undefined);
      setPeerId(undefined);
    };
  }, [role]);

  return <SocketContext.Provider value={{ socket, peerId }}>{children}</SocketContext.Provider>;
}

export function useSocket(): Socket | undefined {
  return useContext(SocketContext).socket;
}

export function usePeerId(): string | undefined {
  return useContext(SocketContext).peerId;
}
