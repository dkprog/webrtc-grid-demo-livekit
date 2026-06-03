'use client';

import { TokenSource } from 'livekit-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Role = 'producer' | 'consumer';

interface TokenContextValue {
  role?: Role;
  token?: string;
}

const TokenContext = createContext<TokenContextValue>({});

interface ContextProviderProps {
  role: Role;
  children: ReactNode;
}

const LIVEKIT_TOKEN_SERVER_ID = process.env.NEXT_PUBLIC_LIVEKIT_TOKEN_SERVER_ID!;

const tokenSource = TokenSource.sandboxTokenServer(LIVEKIT_TOKEN_SERVER_ID);

export function TokenProvider({ role, children }: ContextProviderProps) {
  const [token, setToken] = useState<string | undefined>();

  useEffect(() => {
    tokenSource
      .fetch({ roomName: 'webrtc-grid-demo', participantMetadata: role })
      .then((response) => {
        setToken(response.participantToken);
      });
  }, [role]);

  return <TokenContext.Provider value={{ role, token }}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  return useContext(TokenContext);
}
