import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createNaturalBeautyEffects,
  RtcClient,
  RtcClientConfig,
  RtcRoomMode,
  RtcSessionInfo,
  RtcVideoEffects,
} from './RtcClient';
import { requestAudioPermissions, requestVideoPermissions } from './permissions';

export interface UseRtcClientResult {
  isJoined:    boolean;
  isJoining:   boolean;
  isMuted:     boolean;
  isCameraOn:  boolean;
  isScreenSharing: boolean;
  videoEffects: RtcVideoEffects;
  remoteUids:  string[];
  error:       Error | null;
  session:     RtcSessionInfo | null;
  client:      RtcClient | null;

  join:         (channelId: string, identity?: string) => Promise<void>;
  joinVideoCall: (channelId: string, identity?: string, effects?: RtcVideoEffects) => Promise<void>;
  joinSoloVideoLive: (channelId: string, identity?: string, effects?: RtcVideoEffects) => Promise<void>;
  leave:        () => Promise<void>;
  toggleAudio:  () => Promise<void>;
  setMuted:     (muted: boolean) => Promise<void>;
  toggleCamera: () => Promise<void>;
  setCamera:    (enabled: boolean) => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare:  () => Promise<void>;
  setVideoEffects:  (effects: RtcVideoEffects) => Promise<void>;
}

export function useRtcClient(config: RtcClientConfig): UseRtcClientResult {
  const clientRef  = useRef<RtcClient | null>(null);

  const [isJoined,   setIsJoined]   = useState(false);
  const [isJoining,  setIsJoining]  = useState(false);
  const [isMuted,    setIsMuted]    = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoEffects, setVideoEffectsState] = useState<RtcVideoEffects>(createNaturalBeautyEffects());
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
        setIsCameraOn(isVideoMode(s.mode));
      });

      client.on('leave', () => {
        setIsJoined(false);
        setSession(null);
        setRemoteUids([]);
        setIsMuted(false);
        setIsCameraOn(false);
        setIsScreenSharing(false);
      });

      client.on('remoteUserJoined', (uid) => {
        setRemoteUids(prev => [...prev.filter(u => u !== uid), uid]);
      });

      client.on('remoteUserLeft', (uid) => {
        setRemoteUids(prev => prev.filter(u => u !== uid));
      });

      client.on('screenShareChanged', (enabled) => {
        setIsScreenSharing(enabled);
      });

      client.on('videoEffectsChanged', (_uid, effects) => {
        setVideoEffectsState(effects);
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

  const joinVideoCall = useCallback(async (
    channelId: string,
    identity?: string,
    effects: RtcVideoEffects = createNaturalBeautyEffects(),
  ) => {
    if (!clientRef.current) return;
    setIsJoining(true);
    setError(null);
    try {
      const ok = await requestVideoPermissions();
      if (!ok) throw new Error('Camera or audio permission denied');
      await clientRef.current.joinVideoCall(channelId, identity, effects);
    } catch (err) {
      setError(err as Error);
      setIsJoining(false);
    }
  }, []);

  const joinSoloVideoLive = useCallback(async (
    channelId: string,
    identity?: string,
    effects: RtcVideoEffects = createNaturalBeautyEffects(),
  ) => {
    if (!clientRef.current) return;
    setIsJoining(true);
    setError(null);
    try {
      const ok = await requestVideoPermissions();
      if (!ok) throw new Error('Camera or audio permission denied');
      await clientRef.current.joinSoloVideoLive(channelId, identity, effects);
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

  const startScreenShare = useCallback(async () => {
    if (!clientRef.current) return;
    await clientRef.current.startScreenShare();
    setIsScreenSharing(true);
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (!clientRef.current) return;
    await clientRef.current.stopScreenShare();
    setIsScreenSharing(false);
  }, []);

  const setVideoEffects = useCallback(async (effects: RtcVideoEffects) => {
    if (!clientRef.current) return;
    const nextEffects = await clientRef.current.setVideoEffects(effects);
    setVideoEffectsState(nextEffects);
  }, []);

  return {
    isJoined, isJoining, isMuted, isCameraOn, isScreenSharing, videoEffects,
    remoteUids, error, session,
    client: clientRef.current,
    join, joinVideoCall, joinSoloVideoLive, leave,
    toggleAudio, setMuted, toggleCamera, setCamera,
    startScreenShare, stopScreenShare, setVideoEffects,
  };
}

function isVideoMode(mode: RtcRoomMode): boolean {
  return mode === 'video'
    || mode === 'video_call'
    || mode === 'group_video'
    || mode === 'solo_live'
    || mode === 'live_pk';
}
