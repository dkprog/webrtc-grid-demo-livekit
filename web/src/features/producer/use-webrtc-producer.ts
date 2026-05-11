import { useSocket } from '@/lib/signaling/socket-context';
import { type Socket } from 'socket.io-client';
import { useEffect, useRef } from 'react';
import { RTC_CONFIG } from '@/lib/rtc-config';
import { IncomingMessage } from '@/lib/signaling/types';

function createPeerConnection(socket: Socket, consumerId: string, stream: MediaStream) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      socket.emit('message', { to: consumerId, kind: 'ice-candidate', payload: event.candidate });
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      const sdp = await pc.createOffer();
      await pc.setLocalDescription(sdp);
      socket.emit('message', { to: consumerId, kind: 'offer', payload: pc.localDescription });
    } catch (err) {
      console.error(`Failed to create offer for ${consumerId}:`, err);
    }
  };

  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  return pc;
}

interface UseWebRTCProducerOptions {
  stream?: MediaStream;
}

export function useWebRTCProducer({ stream }: UseWebRTCProducerOptions): void {
  const socket = useSocket();
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteDescReadyRef = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    if (!socket || !stream) {
      return;
    }

    const handleConsumerLeft = (consumerId: string) => {
      const pc = peersRef.current.get(consumerId);
      if (pc) {
        pc.close();
        peersRef.current.delete(consumerId);
        remoteDescReadyRef.current.delete(consumerId);
      }
    };

    const handleNewConsumer = (consumerId: string) => {
      if (peersRef.current.has(consumerId)) {
        return;
      }
      const pc = createPeerConnection(socket, consumerId, stream);
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          console.warn(`Consumer ${consumerId} entered terminal state: ${pc.connectionState}`);
          handleConsumerLeft(consumerId);
        }
      };
      peersRef.current.set(consumerId, pc);
    };

    const handleAnswer = (consumerId: string, answer: RTCSessionDescriptionInit) => {
      const pc = peersRef.current.get(consumerId);
      if (!pc) {
        return;
      }

      const remoteReady = pc.setRemoteDescription(answer);

      remoteDescReadyRef.current.set(consumerId, remoteReady);

      remoteReady.catch((err) => {
        console.error(`Failed to set remote description for consumer ${consumerId}:`, err);
      });
    };

    const handleIceCandidate = (consumerId: string, iceCandidate: RTCIceCandidateInit) => {
      const pc = peersRef.current.get(consumerId);
      const ready = remoteDescReadyRef.current.get(consumerId);
      if (pc && ready) {
        remoteDescReadyRef.current.set(
          consumerId,
          ready.then(() =>
            pc.addIceCandidate(iceCandidate).catch((err) => {
              console.error(`Failed to add ICE candidate from consumer ${consumerId}:`, err);
            }),
          ),
        );
      }
    };

    const handleMessage = ({ from, kind, payload }: IncomingMessage) => {
      if (kind === 'answer') {
        handleAnswer(from, payload as RTCSessionDescriptionInit);
      } else if (kind === 'ice-candidate') {
        handleIceCandidate(from, payload as RTCIceCandidateInit);
      }
    };

    socket.on('message', handleMessage);
    socket.on('consumer-connected', handleNewConsumer);
    socket.on('consumer-disconnected', handleConsumerLeft);

    socket.emit('list-consumers', (consumers: string[]) => {
      consumers.forEach(handleNewConsumer);
    });

    return () => {
      socket.off('message', handleMessage);
      socket.off('consumer-connected', handleNewConsumer);
      socket.off('consumer-disconnected', handleConsumerLeft);

      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      remoteDescReadyRef.current.clear();
    };
  }, [socket, stream]);
}
