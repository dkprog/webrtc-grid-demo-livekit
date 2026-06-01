'use client';

import { TokenSource } from 'livekit-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface TokenContextValue {
  token?: string;
}

const TokenContext = createContext<TokenContextValue>({});

interface ContextProviderProps {
  children: ReactNode;
}

const LIVEKIT_TOKEN_SERVER_ID = process.env.NEXT_PUBLIC_LIVEKIT_TOKEN_SERVER_ID!;

const tokenSource = TokenSource.sandboxTokenServer(LIVEKIT_TOKEN_SERVER_ID);

export function TokenProvider({ children }: ContextProviderProps) {
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    tokenSource.fetch({ roomName: 'webrtc-grid-demo' }).then((response) => {
      setToken(response.participantToken);
    });
  }, []);

  return <TokenContext.Provider value={{ token }}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  return useContext(TokenContext);
}
