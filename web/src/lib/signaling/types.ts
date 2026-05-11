export type Role = 'producer' | 'consumer';

export type Kind = 'offer' | 'answer' | 'ice-candidate';

export interface SignalingMessage {
  to: string;
  kind: Kind;
  payload: unknown;
}

export interface IncomingMessage {
  from: string;
  kind: Kind;
  payload: unknown;
}
