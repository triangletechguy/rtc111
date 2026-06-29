import {
  EventEmitter,
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";
import { NativeModules, Platform } from "react-native";

export type RtcTokenInfo = {
  appId?: string;
  appKey?: string;
  roomId?: string;
  userId?: string;
  externalUserId?: string;
  role?: string;
  rtcMode?: string;
  permissions: string[];
  expiresAtEpochSeconds?: number;
  isExpired: boolean;
};

export type RtcStartOptions = {
  accessToken: string;
  roomId?: string;
  appId?: string;
  appKey?: string;
  signalingUrl?: string;
  rtcMode?: string;
  speakerOn?: boolean;
};

export type RtcStartResult = {
  started: boolean;
  nativeAvailable: boolean;
  appId?: string;
  appKey?: string;
  roomId?: string;
  rtcMode?: string;
  signalingUrl?: string;
  message?: string;
};

type RtcNativeModule = {
  start?: (options: RtcStartOptions) => Promise<RtcStartResult>;
  leaveRoom?: () => Promise<void>;
  release?: () => Promise<void>;
  parseToken?: (options: { accessToken: string }) => Promise<RtcTokenInfo>;
  requiredAndroidPermissions?: (options: { accessToken: string; rtcMode?: string }) => Promise<string[]>;
  muteLocalAudio?: (options: { muted: boolean }) => Promise<void>;
  setLocalVideoEnabled?: (options: { enabled: boolean }) => Promise<void>;
  setSpeakerphoneOn?: (options: { enabled: boolean }) => Promise<void>;
  switchCamera?: () => Promise<boolean>;
};

const DEFAULT_SIGNALING_URL = "https://funint.online";

let cachedExpoModule: RtcNativeModule | null | undefined;

function getNativeModule(): RtcNativeModule | null {
  if (Platform.OS === "android") {
    if (cachedExpoModule === undefined) {
      try {
        cachedExpoModule = requireOptionalNativeModule<RtcNativeModule>("RtcDashboardSdk");
      } catch {
        cachedExpoModule = null;
      }
    }

    if (cachedExpoModule) {
      return cachedExpoModule;
    }
  }

  return (
    NativeModules.RtcDashboardSdk ||
    NativeModules.RtcServiceSdkModule ||
    NativeModules.RtcNativeSdk ||
    null
  );
}

export function isRtcNativeSdkAvailable(): boolean {
  return Platform.OS === "android" && typeof getNativeModule()?.start === "function";
}

export async function parseRtcToken(accessToken: string): Promise<RtcTokenInfo> {
  const token = accessToken.trim();
  const nativeModule = getNativeModule();

  if (Platform.OS === "android" && typeof nativeModule?.parseToken === "function") {
    return nativeModule.parseToken({ accessToken: token });
  }

  return parseJwtLocally(token);
}

export async function startRtcSession(options: RtcStartOptions): Promise<RtcStartResult> {
  const accessToken = options.accessToken.trim();

  if (!accessToken) {
    throw new Error("RTC access token is required.");
  }

  const nativeModule = getNativeModule();

  if (Platform.OS !== "android" || typeof nativeModule?.start !== "function") {
    const tokenInfo = await parseRtcToken(accessToken).catch(() => null);
    return {
      started: false,
      nativeAvailable: false,
      appId: clean(options.appId) || tokenInfo?.appId,
      appKey: clean(options.appKey) || tokenInfo?.appKey,
      roomId: clean(options.roomId) || tokenInfo?.roomId,
      rtcMode: clean(options.rtcMode) || tokenInfo?.rtcMode,
      signalingUrl: clean(options.signalingUrl) || DEFAULT_SIGNALING_URL,
      message: "Native RTC SDK bridge is not available in this build.",
    };
  }

  return nativeModule.start({
    accessToken,
    roomId: clean(options.roomId),
    appId: clean(options.appId),
    appKey: clean(options.appKey),
    signalingUrl: clean(options.signalingUrl) || DEFAULT_SIGNALING_URL,
    rtcMode: clean(options.rtcMode),
    speakerOn: options.speakerOn ?? true,
  });
}

export async function leaveRtcSession(): Promise<void> {
  const nativeModule = getNativeModule();
  await nativeModule?.leaveRoom?.();
}

export async function releaseRtcSession(): Promise<void> {
  const nativeModule = getNativeModule();
  await nativeModule?.release?.();
}

export async function muteLocalAudio(muted: boolean): Promise<void> {
  await getNativeModule()?.muteLocalAudio?.({ muted });
}

export async function setLocalVideoEnabled(enabled: boolean): Promise<void> {
  await getNativeModule()?.setLocalVideoEnabled?.({ enabled });
}

export async function setSpeakerphoneOn(enabled: boolean): Promise<void> {
  await getNativeModule()?.setSpeakerphoneOn?.({ enabled });
}

export async function switchCamera(): Promise<boolean> {
  return getNativeModule()?.switchCamera?.() ?? false;
}

export type RtcNativeEvent = {
  type: string;
  status?: string;
  roomId?: string;
  reason?: string;
  message?: string;
  count?: number;
  muted?: boolean;
  enabled?: boolean;
  isFrontCamera?: boolean;
};

type RtcNativeEventMap = {
  onRtcEvent: (event: RtcNativeEvent) => void;
};

export function addRtcEventListener(listener: (event: RtcNativeEvent) => void): EventSubscription {
  const nativeModule = getNativeModule();

  if (!nativeModule || Platform.OS !== "android") {
    return { remove: () => undefined };
  }

  return new EventEmitter<RtcNativeEventMap>(nativeModule as never).addListener("onRtcEvent", listener);
}

function parseJwtLocally(accessToken: string): RtcTokenInfo {
  const parts = accessToken.split(".");

  if (parts.length < 2 || !parts[1]) {
    throw new Error("RTC access token must be a JWT.");
  }

  const payload = JSON.parse(decodeBase64Url(parts[1]));
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.map((permission: unknown) => String(permission))
    : [];
  const expiresAtEpochSeconds = typeof payload.exp === "number" ? payload.exp : undefined;

  return {
    appId: payload.appId ?? payload.app_id,
    appKey: payload.appKey ?? payload.app_key,
    roomId: payload.roomId ?? payload.room_id,
    userId: payload.userId ?? payload.user_id ?? payload.sub,
    externalUserId: payload.externalUserId ?? payload.external_user_id,
    role: payload.role,
    rtcMode: payload.rtcMode ?? payload.rtc_mode,
    permissions,
    expiresAtEpochSeconds,
    isExpired: typeof expiresAtEpochSeconds === "number"
      ? Date.now() >= Math.max(0, expiresAtEpochSeconds - 30) * 1000
      : false,
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob !== "function") {
    throw new Error("JWT decoding is unavailable in this JavaScript runtime.");
  }

  const binary = atob(padded);
  const bytes = Array.from(binary, char => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return decodeURIComponent(bytes.join(""));
}

function clean(value?: string): string | undefined {
  return value?.trim() || undefined;
}
