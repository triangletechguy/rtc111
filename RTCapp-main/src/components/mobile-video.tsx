import React, { useState } from "react";
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
import AgoraUIKit from "agora-rn-uikit";

const AGORA_APP_ID = "a2547ce438e34f269a2a2f956cebb68a";
const AGORA_TOKEN: string | null = null;

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const cameraOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
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
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    const trimmed = channel.trim();
    if (!trimmed) {
      Alert.alert("Channel required", "Please enter a channel name before joining.");
      return;
    }
    setJoining(true);
    const ok = await requestPermissions();
    if (!ok) {
      setJoining(false);
      return;
    }
    setTimeout(() => {
      setInCall(true);
      setJoining(false);
    }, 300);
  };

  if (inCall) {
    return (
      <SafeAreaView style={styles.container}>
        <AgoraUIKit
          connectionData={{ appId: AGORA_APP_ID, channel: channel.trim(), token: AGORA_TOKEN }}
          rtcCallbacks={{ EndCall: () => setInCall(false) }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.lobby}>
        <Text style={styles.title}>📱 Mobile Video Chat</Text>
        <Text style={styles.subtitle}>Enter a channel name to join</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. main"
          placeholderTextColor="#555"
          value={channel}
          onChangeText={setChannel}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={64}
          editable={!joining}
        />

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
  button: { backgroundColor: "#208AEF", paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, minWidth: 160, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
