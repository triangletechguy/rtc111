import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  requireNativeComponent,
  type HostComponent,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";

type RtcStartOptions = {
  signalingUrl: string;
  token: string;
  externalUserId?: string;
  roomId: string;
  enableAudio?: boolean;
  enableVideo?: boolean;
};

export type RtcPlatformEvent = {
  event: string;
  socketId?: string;
  roomId?: string;
  reason?: string;
  message?: string;
  peerId?: string;
  userId?: string;
  state?: string;
  participantCount?: number;
  muted?: boolean;
  enabled?: boolean;
  micEnabled?: boolean;
  cameraEnabled?: boolean;
};

type RtcPlatformModule = {
  start(options: RtcStartOptions): Promise<void>;
  stop(): Promise<void>;
  muteLocalAudio(muted: boolean): Promise<void>;
  setLocalVideoEnabled(enabled: boolean): Promise<void>;
  setSpeakerphoneOn(enabled: boolean): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

type RtcPlatformVideoViewProps = ViewProps & {
  onRtcEvent?: (event: NativeSyntheticEvent<RtcPlatformEvent>) => void;
};

const nativeModule = NativeModules.RtcPlatform as RtcPlatformModule | undefined;

export const RtcPlatform =
  Platform.OS === "android" && nativeModule ? nativeModule : null;

const eventEmitter = RtcPlatform ? new NativeEventEmitter(RtcPlatform) : null;

export function addRtcPlatformListener(
  listener: (event: RtcPlatformEvent) => void,
) {
  return eventEmitter?.addListener("RtcPlatformEvent", listener) ?? {
    remove() {},
  };
}

export const RtcPlatformVideoView =
  Platform.OS === "android"
    ? (requireNativeComponent<RtcPlatformVideoViewProps>(
        "RtcPlatformVideoView",
      ) as HostComponent<RtcPlatformVideoViewProps>)
    : null;
