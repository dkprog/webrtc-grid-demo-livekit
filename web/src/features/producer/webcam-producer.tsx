'use client';

import { VideoTile } from '@/ui/video-tile';
import { useEffect, useState } from 'react';
import { useWebRTCProducer } from './use-webrtc-producer';
import { usePeerId } from '@/lib/signaling/socket-context';

type Status = 'idle' | 'loading' | 'connected' | 'error';

export function WebcamProducer() {
  const peerId = usePeerId();
  const [status, setStatus] = useState<Status>('loading');
  const [localStream, setLocalStream] = useState<MediaStream>();

  useWebRTCProducer({ stream: localStream });

  useEffect(() => {
    if (peerId && status === 'loading') {
      setStatus('idle');
    }
  }, [peerId, status]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream]);

  const handleStart = async () => {
    setStatus('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });
      setLocalStream(stream);
      setStatus('connected');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <VideoTile
      id={peerId}
      stream={localStream}
      status={status}
      onStart={handleStart}
      onRetry={handleStart}
    />
  );
}
