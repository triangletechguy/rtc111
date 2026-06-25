import { useState, useEffect, useCallback, useRef } from 'react';
import { RtcClient, RtcClientConfig, RtcSessionInfo } from './RtcClient';
import { requestAudioPermissions } from './permissions';

export interface UseRtcClientResult {
  isJoined:    boolean;
  isJoining:   boolean;
  isMuted:     boolean;
  isCameraOn:  boolean;
  remoteUids:  string[];
  error:       Error | null;
  session:     RtcSessionInfo | null;
  client:      RtcClient | null;

  join:         (channelId: string, identity?: string) => Promise<void>;
  leave:        () => Promise<void>;
  toggleAudio:  () => Promise<void>;
  setMuted:     (muted: boolean) => Promise<void>;
  toggleCamera: () => Promise<void>;
  setCamera:    (enabled: boolean) => Promise<void>;
}

export function useRtcClient(config: RtcClientConfig): UseRtcClientResult {
  const clientRef  = useRef<RtcClient | null>(null);

  const [isJoined,   setIsJoined]   = useState(false);
  const [isJoining,  setIsJoining]  = useState(false);
  const [isMuted,    setIsMuted]    = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [remoteUids, setRemoteUids] = useState<string[]>([]);
  const [error,      setError]      = useState<Error | null>(null);
  const [session,    setSession]    = useState<RtcSessionInfo | null>(null);

  // Create client once
  useEffect(() => {
    try {
      clientRef.current = RtcClient.create(config);
      const client = clientRef.current;

      client.on('join', (s) => {
        setSession(s);
        setIsJoined(true);
        setIsJoining(false);
        setIsMuted(false);
        setIsCameraOn(config.mode === 'video');
      });

      client.on('leave', () => {
        setIsJoined(false);
        setSession(null);
        setRemoteUids([]);
        setIsMuted(false);
        setIsCameraOn(false);
      });

      client.on('remoteUserJoined', (uid) => {
        setRemoteUids(prev => [...prev.filter(u => u !== uid), uid]);
      });

      client.on('remoteUserLeft', (uid) => {
        setRemoteUids(prev => prev.filter(u => u !== uid));
      });

      client.on('error', (err) => {
        setError(err);
        setIsJoining(false);
      });

    } catch (err) {
      setError(err as Error);
    }

    return () => {
      clientRef.current?.destroy();
      clientRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const join = useCallback(async (channelId: string, identity?: string) => {
    if (!clientRef.current) return;
    setIsJoining(true);
    setError(null);
    try {
      const ok = await requestAudioPermissions();
      if (!ok) throw new Error('Audio permission denied');
      await clientRef.current.join(channelId, identity);
    } catch (err) {
      setError(err as Error);
      setIsJoining(false);
    }
  }, []);

  const leave = useCallback(async () => {
    await clientRef.current?.leave();
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!clientRef.current) return;
    const nowMuted = await clientRef.current.toggleAudioMute();
    setIsMuted(nowMuted);
  }, []);

  const setMuted = useCallback(async (muted: boolean) => {
    if (!clientRef.current) return;
    await clientRef.current.setAudioMuted(muted);
    setIsMuted(muted);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!clientRef.current) return;
    const nowOn = await clientRef.current.toggleCamera();
    setIsCameraOn(nowOn);
  }, []);

  const setCamera = useCallback(async (enabled: boolean) => {
    if (!clientRef.current) return;
    await clientRef.current.setCameraEnabled(enabled);
    setIsCameraOn(enabled);
  }, []);

  return {
    isJoined, isJoining, isMuted, isCameraOn,
    remoteUids, error, session,
    client: clientRef.current,
    join, leave, toggleAudio, setMuted, toggleCamera, setCamera,
  };
}
