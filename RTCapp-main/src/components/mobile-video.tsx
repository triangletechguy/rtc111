import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Alert,
  PermissionsAndroid,
  Platform,
} from "react-native";
import {
  addRtcEventListener,
  isRtcNativeSdkAvailable,
  leaveRtcSession,
  muteLocalAudio,
  parseRtcToken,
  releaseRtcSession,
  setLocalVideoEnabled,
  startRtcSession,
  switchCamera,
  type RtcStartResult,
  type RtcTokenInfo,
} from "@/services/rtc-native-sdk";

async function requestPermissions(needsCamera = true): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ...(needsCamera ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
    ];
    const granted = await PermissionsAndroid.requestMultiple(permissions);
    const cameraOk = !needsCamera || granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
    const audioOk  = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    if (!cameraOk || !audioOk) {
      Alert.alert(
        "Permissions required",
        "Camera and microphone access are needed for video calls. Please allow them in Settings.",
      );
      return false;
    }
    return true;
  } catch {
    Alert.alert("Permission error", "Could not request permissions.");
    return false;
  }
}

export default function MobileVideo() {
  const [channel, setChannel] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appKey, setAppKey] = useState("");
  const [signalingUrl, setSignalingUrl] = useState("https://funint.online");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [status, setStatus] = useState("");
  const [tokenInfo, setTokenInfo] = useState<RtcTokenInfo | null>(null);
  const [startResult, setStartResult] = useState<RtcStartResult | null>(null);

  useEffect(() => {
    const subscription = addRtcEventListener(event => {
      if (event.type === "status" && event.status) {
        setStatus(`RTC status: ${event.status}`);
      } else if (event.type === "connected") {
        setStatus(`Connected to ${event.roomId || "room"}.`);
      } else if (event.type === "disconnected") {
        setStatus(`Disconnected${event.reason ? `: ${event.reason}` : "."}`);
        setInCall(false);
      } else if (event.type === "error" && event.message) {
        setStatus(event.message);
      } else if (event.type === "participantCountChanged" && typeof event.count === "number") {
        setStatus(`${event.count} participant${event.count === 1 ? "" : "s"} in room.`);
      } else if (event.type === "localAudioMuted" && typeof event.muted === "boolean") {
        setMuted(event.muted);
      } else if (event.type === "localVideoEnabled" && typeof event.enabled === "boolean") {
        setCameraOff(!event.enabled);
      }
    });

    return () => subscription.remove();
  }, []);

  const handleJoin = async () => {
    const trimmed = channel.trim();
    const token = accessToken.trim();

    if (!trimmed && !token) {
      Alert.alert("Room or token required", "Enter a room name or paste a token that includes one.");
      return;
    }

    if (!token) {
      Alert.alert("Token required", "Paste the dashboard/backend RTC access token before starting.");
      return;
    }

    setJoining(true);

    try {
      const parsed = await parseRtcToken(token);
      setTokenInfo(parsed);

      const needsCamera = parsed.permissions.length === 0 ||
        (parsed.rtcMode || "").toLowerCase().includes("video") ||
        parsed.permissions.includes("publish_video");
      const needsAudio = parsed.permissions.length === 0 || parsed.permissions.includes("publish_audio");
      const ok = needsAudio || needsCamera ? await requestPermissions(needsCamera) : true;

      if (!ok) {
        setJoining(false);
        return;
      }

      const result = await startRtcSession({
        accessToken: token,
        roomId: trimmed || parsed.roomId,
        appId,
        appKey,
        signalingUrl,
        rtcMode: parsed.rtcMode,
      });

      setStartResult(result);
      if (!trimmed && result.roomId) {
        setChannel(result.roomId);
      }
      setStatus(result.nativeAvailable ? "RTC session started." : result.message || "Ready for native SDK build.");
      setInCall(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start RTC session.";
      setStatus(message);
      Alert.alert("RTC start failed", message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    await leaveRtcSession().catch(() => undefined);
    await releaseRtcSession().catch(() => undefined);
    setInCall(false);
    setMuted(false);
    setCameraOff(false);
    setStatus("RTC session ended.");
  };

  const handleMute = async () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    await muteLocalAudio(nextMuted).catch(() => undefined);
  };

  const handleCamera = async () => {
    const nextCameraOff = !cameraOff;
    setCameraOff(nextCameraOff);
    await setLocalVideoEnabled(!nextCameraOff).catch(() => undefined);
  };

  const handleSwitchCamera = async () => {
    const switched = await switchCamera().catch(() => false);
    setStatus(switched ? "Camera switched." : "Camera switch is unavailable.");
  };

  const displayRoom = channel.trim() || startResult?.roomId || tokenInfo?.roomId || "room";

  if (inCall) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.callHeader}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.channelName}>#{displayRoom}</Text>
          <TouchableOpacity style={styles.endButton} onPress={handleLeave}>
            <Text style={styles.endButtonText}>End</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.stage}>
          <View style={[styles.previewTile, cameraOff && styles.previewTileMuted]}>
            <Text style={styles.previewTitle}>{cameraOff ? "Camera off" : "Local video ready"}</Text>
            <Text style={styles.previewSubtitle}>#{displayRoom}</Text>
          </View>
          <Text style={styles.waitingText}>Waiting for participants in #{displayRoom}</Text>
          {!!status && <Text style={styles.statusText}>{status}</Text>}
          {startResult?.nativeAvailable === false && (
            <Text style={styles.statusSubText}>Build with the Android SDK bridge before the live device test.</Text>
          )}
          <View style={styles.controls}>
            <TouchableOpacity style={[styles.controlButton, muted && styles.controlButtonActive]} onPress={handleMute}>
              <Text style={styles.controlButtonText}>{muted ? "Unmute" : "Mute"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlButton, cameraOff && styles.controlButtonActive]} onPress={handleCamera}>
              <Text style={styles.controlButtonText}>{cameraOff ? "Show Camera" : "Hide Camera"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={handleSwitchCamera}>
              <Text style={styles.controlButtonText}>Flip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.lobby}>
        <Text style={styles.title}>📱 Mobile Video Chat</Text>
        <Text style={styles.subtitle}>{isRtcNativeSdkAvailable() ? "Native SDK available" : "Dashboard token test"}</Text>

        <TextInput
          style={styles.input}
          placeholder="Room id, if token does not include one"
          placeholderTextColor="#555"
          value={channel}
          onChangeText={setChannel}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={64}
          editable={!joining}
        />
        <TextInput
          style={[styles.input, styles.tokenInput]}
          placeholder="RTC access token"
          placeholderTextColor="#555"
          value={accessToken}
          onChangeText={setAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          editable={!joining}
        />
        <View style={styles.fieldRow}>
          <TextInput
            style={[styles.input, styles.fieldInput]}
            placeholder="App ID optional"
            placeholderTextColor="#555"
            value={appId}
            onChangeText={setAppId}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!joining}
          />
          <TextInput
            style={[styles.input, styles.fieldInput]}
            placeholder="App Key optional"
            placeholderTextColor="#555"
            value={appKey}
            onChangeText={setAppKey}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!joining}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Signaling URL"
          placeholderTextColor="#555"
          value={signalingUrl}
          onChangeText={setSignalingUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!joining}
        />
        {tokenInfo && (
          <Text style={styles.tokenMeta}>
            {tokenInfo.appId || "token"} / {tokenInfo.roomId || channel || "room"} / {tokenInfo.rtcMode || "rtc"}
          </Text>
        )}
        {!!status && <Text style={styles.statusText}>{status}</Text>}

        <TouchableOpacity
          style={[styles.button, joining && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={joining}
        >
          {joining
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Join Call</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  callHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#111" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#208AEF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  channelName: { color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 },
  endButton: { backgroundColor: "#e53935", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  endButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 },
  previewTile: { width: "100%", maxWidth: 420, aspectRatio: 4 / 3, backgroundColor: "#151d29", borderRadius: 12, borderWidth: 1, borderColor: "#28405f", alignItems: "center", justifyContent: "center", padding: 24 },
  previewTileMuted: { backgroundColor: "#171717", borderColor: "#333" },
  previewTitle: { color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center" },
  previewSubtitle: { color: "#9aa7b3", fontSize: 13, textAlign: "center", marginTop: 8 },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
  statusText: { color: "#d7e7ff", fontSize: 13, textAlign: "center" },
  statusSubText: { color: "#8d9aaa", fontSize: 12, textAlign: "center" },
  controls: { flexDirection: "row", gap: 12 },
  controlButton: { backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  controlButtonActive: { backgroundColor: "rgba(32,138,239,0.35)" },
  controlButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  lobby: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: "700", color: "#ffffff" },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 4 },
  input: {
    width: "100%",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  tokenInput: { minHeight: 92, textAlignVertical: "top" },
  fieldRow: { flexDirection: "row", gap: 10, width: "100%" },
  fieldInput: { flex: 1 },
  tokenMeta: { color: "#8fbfff", fontSize: 12, textAlign: "center" },
  button: { backgroundColor: "#208AEF", paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, minWidth: 160, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
