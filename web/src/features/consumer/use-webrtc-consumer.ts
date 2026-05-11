'use client';

import { useSocket } from '@/lib/signaling/socket-context';
import { type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { RTC_CONFIG } from '@/lib/rtc-config';
import { IncomingMessage } from '@/lib/signaling/types';

export interface ProducerEntry {
  producerId: string;
  stream?: MediaStream;
  status: 'loading' | 'connected' | 'error';
}

function createPeerConnection(socket: Socket, producerId: string) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      socket.emit('message', { to: producerId, kind: 'ice-candidate', payload: event.candidate });
    }
  };

  return pc;
}

export function useWebRTCConsumer(): ProducerEntry[] {
  const socket = useSocket();
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteDescReadyRef = useRef<Map<string, Promise<void>>>(new Map());
  const [producers, setProducers] = useState<Record<string, ProducerEntry>>({});

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleProducerLeft = (producerId: string) => {
      const pc = peersRef.current.get(producerId);
      if (pc) {
        pc.close();
        peersRef.current.delete(producerId);
        remoteDescReadyRef.current.delete(producerId);
        setProducers((prev) => {
          const next = { ...prev };
          delete next[producerId];
          return next;
        });
      }
    };

    const handleNewProducer = (producerId: string, offer: RTCSessionDescriptionInit) => {
      if (peersRef.current.has(producerId)) {
        return;
      }
      const pc = createPeerConnection(socket, producerId);

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          console.warn(`Producer ${producerId} entered terminal state: ${pc.connectionState}`);
          handleProducerLeft(producerId);
        }
      };

      pc.ontrack = (event) => {
        if (event.track.kind === 'video') {
          setProducers((prev) => ({
            ...prev,
            [producerId]: { producerId, status: 'connected', stream: event.streams[0] },
          }));
        }
      };

      peersRef.current.set(producerId, pc);
      setProducers((prev) => ({
        ...prev,
        [producerId]: { producerId, status: 'loading' },
      }));

      const remoteReady = pc
        .setRemoteDescription(offer)
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          socket.emit('message', { to: producerId, kind: 'answer', payload: pc.localDescription });
        });

      remoteReady.catch((err) => {
        console.error(`Failed to answer producer ${producerId}:`, err);
        setProducers((prev) => ({
          ...prev,
          [producerId]: { producerId, status: 'error' },
        }));
      });
    };

    const handleIceCandidate = (producerId: string, iceCandidate: RTCIceCandidateInit) => {
      const pc = peersRef.current.get(producerId);
      const ready = remoteDescReadyRef.current.get(producerId);
      if (pc && ready) {
        remoteDescReadyRef.current.set(
          producerId,
          ready.then(() =>
            pc.addIceCandidate(iceCandidate).catch((err) => {
              console.error(`Failed to add ICE candidate from producer ${producerId}:`, err);
            }),
          ),
        );
      }
    };

    const handleMessage = ({ from, kind, payload }: IncomingMessage) => {
      if (kind === 'offer') {
        handleNewProducer(from, payload as RTCSessionDescriptionInit);
      } else if (kind === 'ice-candidate') {
        handleIceCandidate(from, payload as RTCIceCandidateInit);
      }
    };

    socket.on('message', handleMessage);
    socket.on('producer-disconnected', handleProducerLeft);

    return () => {
      socket.off('message', handleMessage);
      socket.off('producer-disconnected', handleProducerLeft);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      remoteDescReadyRef.current.clear();
      setProducers({});
    };
  }, [socket]);

  return Object.values(producers);
}
