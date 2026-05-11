'use client';

import { useEffect, useRef } from 'react';

interface VideoStreamProps {
  stream?: MediaStream;
  muted?: boolean;
  className?: string;
}

export function VideoStream({ stream, muted = false, className }: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream ?? null;

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
}
