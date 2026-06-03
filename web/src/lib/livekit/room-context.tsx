'use client';

import { Room } from 'livekit-client';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useToken } from './token-context';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL!;

interface RoomContextValue {
  room?: Room;
}

const RoomContext = createContext<RoomContextValue>({});

interface RoomContextProviderProps {
  children: ReactNode;
}

export function RoomProvider({ children }: RoomContextProviderProps) {
  const [room] = useState<Room>(() => new Room({}));
  const { token } = useToken();

  useEffect(() => {
    if (!token) {
      return;
    }

    room.connect(LIVEKIT_URL, token);
    return () => {
      room.disconnect();
    };
  }, [token]);

  return <RoomContext.Provider value={{ room }}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  return useContext(RoomContext);
}

export function usePeerId(): string | undefined {
  return useRoom().room?.localParticipant.sid;
}
