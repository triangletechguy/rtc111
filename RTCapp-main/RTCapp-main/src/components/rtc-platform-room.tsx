import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  addRtcPlatformListener,
  RtcPlatform,
  type RtcPlatformEvent,
  RtcPlatformVideoView,
} from "./rtc-platform-native";

const RTC_SIGNALING_URL = "https://funint.online";
const RTC_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJ0YyIsInVzZXJJZCI6ImhhcGkiLCJleHRlcm5hbFVzZXJJZCI6ImhhcGkiLCJyb2xlIjoicHVibGlzaGVyIiwicnRjTW9kZSI6InZpZGVvIiwicGVybWlzc2lvbnMiOlsiam9pbiIsInB1Ymxpc2hfYXVkaW8iLCJwdWJsaXNoX3ZpZGVvIiwiY2hhdCIsInNpZ25hbCJdLCJpYXQiOjE3ODIzNDM2NjksImV4cCI6MTc4MjM0NzI2OSwiaXNzIjoicnRjLXBsYXRmb3JtIiwic3ViIjoiaGFwaSIsImp0aSI6IjNiYmUyY2YxLTkzZTktNDBlZC05YzFjLTYwODBjN2QyYTNkNSJ9.Ps6JBargkxgUudkeMn2wKL1d3Umbc6hZaCEXLsQaGWA";

type RtcPlatformRoomProps = {
  title?: string;
  subtitle?: string;
  defaultRoomId?: string;
  accentColor?: string;
};

async function requestRtcPermissions() {
  if (Platform.OS !== "android") return true;

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);

  const cameraOk =
    granted[PermissionsAndroid.PERMISSIONS.CAMERA] ===
    PermissionsAndroid.RESULTS.GRANTED;
  const audioOk =
    granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
    PermissionsAndroid.RESULTS.GRANTED;

  if (!cameraOk || !audioOk) {
    Alert.alert(
      "Permissions required",
      "Camera and microphone access are needed to test the RTC SDK.",
    );
    return false;
  }

  return true;
}

function describeEvent(event: RtcPlatformEvent) {
  switch (event.event) {
    case "connecting":
      return "Connecting to signaling server...";
    case "connected":
      return `Connected${event.socketId ? ` as ${event.socketId}` : ""}`;
    case "roomJoined":
      return `Joined room ${event.roomId ?? ""}`;
    case "roomState":
      return `Room participants: ${event.participantCount ?? 0}`;
    case "waitingForPeer":
      return "Waiting for another peer in the same room";
    case "peerJoined":
      return `Peer joined: ${event.peerId ?? ""}`;
    case "peerLeft":
      return `Peer left: ${event.peerId ?? ""}`;
    case "localStream":
      return "Local camera/microphone stream is ready";
    case "remoteStream":
      return "Remote stream received";
    case "connectionStateChanged":
      return `Peer connection: ${event.state ?? "unknown"}`;
    case "localAudioMuted":
      return event.muted ? "Microphone muted" : "Microphone unmuted";
    case "localVideoEnabled":
      return event.enabled ? "Camera enabled" : "Camera disabled";
    case "speakerphoneChanged":
      return event.enabled ? "Speaker enabled" : "Speaker disabled";
    case "roomError":
    case "error":
      return event.message ?? "RTC error";
    case "disconnected":
      return `Disconnected${event.reason ? `: ${event.reason}` : ""}`;
    case "stopped":
      return "Call stopped";
    default:
      return event.event;
  }
}

export default function RtcPlatformRoom({
  title = "RTC Platform Test",
  subtitle = "Uses rtc-platform-live-sdk-release.aar",
  defaultRoomId = "hapi",
  accentColor = "#208AEF",
}: RtcPlatformRoomProps) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [status, setStatus] = useState("Ready");
  const [events, setEvents] = useState<string[]>([]);
  const [joining, setJoining] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  const styles = useMemo(() => createStyles(accentColor), [accentColor]);

  useEffect(() => {
    const subscription = addRtcPlatformListener((event) => {
      const message = describeEvent(event);
      setStatus(message);
      setEvents((previous) => [
        `${new Date().toLocaleTimeString()} ${message}`,
        ...previous.slice(0, 19),
      ]);

      if (
        event.event === "roomError" ||
        event.event === "error" ||
        event.event === "disconnected"
      ) {
        setJoining(false);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return () => {
      RtcPlatform?.stop().catch(() => {});
    };
  }, []);

  const startCall = async () => {
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) {
      Alert.alert("Room required", "Please enter a room id.");
      return;
    }

    if (!RtcPlatform || !RtcPlatformVideoView) {
      Alert.alert("Android only", "The RTC native SDK bridge is only available on Android.");
      return;
    }

    setJoining(true);
    setStatus("Requesting camera and microphone...");

    const permissionOk = await requestRtcPermissions();
    if (!permissionOk) {
      setJoining(false);
      return;
    }

    try {
      setInCall(true);
      setMuted(false);
      setCameraOn(true);
      setSpeakerOn(true);
      await RtcPlatform.start({
        signalingUrl: RTC_SIGNALING_URL,
        token: RTC_ACCESS_TOKEN,
        roomId: trimmedRoomId,
        enableAudio: true,
        enableVideo: true,
      });
      setStatus("Starting RTC SDK...");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start RTC SDK";
      setStatus(message);
      setInCall(false);
    } finally {
      setJoining(false);
    }
  };

  const stopCall = async () => {
    await RtcPlatform?.stop();
    setInCall(false);
    setStatus("Call stopped");
  };

  const toggleMute = async () => {
    const next = !muted;
    await RtcPlatform?.muteLocalAudio(next);
    setMuted(next);
  };

  const toggleCamera = async () => {
    const next = !cameraOn;
    await RtcPlatform?.setLocalVideoEnabled(next);
    setCameraOn(next);
  };

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    await RtcPlatform?.setSpeakerphoneOn(next);
    setSpeakerOn(next);
  };

  if (inCall && RtcPlatformVideoView) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.callHeader}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>RTC SDK</Text>
          </View>
          <Text style={styles.roomLabel}>#{roomId.trim()}</Text>
          <TouchableOpacity style={styles.endSmall} onPress={stopCall}>
            <Text style={styles.endSmallText}>End</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.videoShell}>
          <RtcPlatformVideoView style={styles.videoView} />
          <View style={styles.statusOverlay}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
            <Text style={styles.controlText}>{muted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endButton} onPress={stopCall}>
            <Text style={styles.endText}>Leave</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
            <Text style={styles.controlText}>{cameraOn ? "Camera Off" : "Camera On"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={toggleSpeaker}>
            <Text style={styles.controlText}>{speakerOn ? "Speaker Off" : "Speaker On"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      <View style={styles.lobby}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>Room id</Text>
          <TextInput
            style={styles.input}
            value={roomId}
            onChangeText={setRoomId}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!joining}
            placeholder="hapi"
            placeholderTextColor="#666"
          />
        </View>

        <TouchableOpacity
          style={[styles.joinButton, joining && styles.buttonDisabled]}
          onPress={startCall}
          disabled={joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinText}>Start RTC Test</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Server: {RTC_SIGNALING_URL}</Text>
          <Text style={styles.infoText}>Token: embedded in APK</Text>
          <Text style={styles.infoText}>Status: {status}</Text>
        </View>

        <ScrollView style={styles.logBox}>
          {events.length === 0 ? (
            <Text style={styles.logText}>RTC events will appear here.</Text>
          ) : (
            events.map((event, index) => (
              <Text key={`${event}-${index}`} style={styles.logText}>
                {event}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function createStyles(accentColor: string) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#090909" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "#242424",
    },
    backButton: { paddingVertical: 6, paddingRight: 8 },
    backText: { color: accentColor, fontSize: 15, fontWeight: "600" },
    headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
    lobby: {
      flex: 1,
      padding: 20,
      justifyContent: "center",
      gap: 16,
    },
    title: { color: "#fff", fontSize: 28, fontWeight: "800", textAlign: "center" },
    subtitle: { color: "#aaa", fontSize: 14, textAlign: "center" },
    inputWrap: { gap: 8 },
    inputLabel: { color: "#cfcfcf", fontSize: 13, fontWeight: "600" },
    input: {
      backgroundColor: "#171717",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#3a3a3a",
      borderRadius: 10,
      color: "#fff",
      fontSize: 16,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    joinButton: {
      backgroundColor: accentColor,
      borderRadius: 12,
      minHeight: 54,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: { opacity: 0.6 },
    joinText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    infoBox: {
      backgroundColor: "#121212",
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#2d2d2d",
      padding: 12,
      gap: 4,
    },
    infoText: { color: "#cfcfcf", fontSize: 12 },
    logBox: {
      maxHeight: 180,
      backgroundColor: "#111",
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#2d2d2d",
      padding: 12,
    },
    logText: { color: "#9d9d9d", fontSize: 12, marginBottom: 6 },
    callHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "#111",
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: accentColor,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
    liveText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    roomLabel: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700" },
    endSmall: {
      backgroundColor: "#e53935",
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    endSmallText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    videoShell: { flex: 1, backgroundColor: "#000" },
    videoView: { flex: 1 },
    statusOverlay: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 16,
      backgroundColor: "rgba(0,0,0,0.6)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    statusText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    controls: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      padding: 12,
      backgroundColor: "#111",
    },
    controlButton: {
      flexGrow: 1,
      minWidth: "45%",
      backgroundColor: "#242424",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    controlText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    endButton: {
      flexGrow: 1,
      minWidth: "45%",
      backgroundColor: "#e53935",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    endText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  });
}
