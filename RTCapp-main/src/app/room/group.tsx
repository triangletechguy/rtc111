import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, PermissionsAndroid } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

// Web is handled by group.web.tsx — this file is native only
// But Expo Router require.context still parses this file on web,
// so we must NOT have top-level native imports. Use require() inside functions.

const APP_ID = "a2547ce438e34f269a2a2f956cebb68a";

async function requestPermissions() {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  const ok = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === "granted"
    && granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === "granted";
  if (!ok) Alert.alert("Permissions required", "Camera and microphone access needed.");
  return ok;
}

export default function GroupVideoRoom() {
  const router = useRouter();
  const [channel, setChannel] = useState("main");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (!channel.trim()) { Alert.alert("Enter a channel name"); return; }
    setJoining(true);
    const ok = await requestPermissions();
    if (!ok) { setJoining(false); return; }
    setTimeout(() => { setInCall(true); setJoining(false); }, 300);
  };

  if (inCall) {
    // Lazy require — only executes on native, never parsed as import on web
    const AgoraUIKit = require("agora-rn-uikit").default;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.callHeader}>
          <View style={s.livePill}><View style={s.liveDot}/><Text style={s.liveText}>LIVE</Text></View>
          <Text style={s.channelName}>#{channel}</Text>
          <TouchableOpacity style={s.endBtn} onPress={() => setInCall(false)}>
            <Text style={s.endBtnText}>End</Text>
          </TouchableOpacity>
        </View>
        <AgoraUIKit
          connectionData={{ appId: APP_ID, channel: channel.trim(), token: null }}
          rtcCallbacks={{ EndCall: () => setInCall(false) }}
          styleProps={{ localBtnContainer: { backgroundColor: "#1a1a1a" } }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Group Video</Text>
      </View>
      <View style={s.lobby}>
        <View style={s.iconCircle}><Text style={{fontSize:36}}>👥</Text></View>
        <Text style={s.title}>Join a Group Room</Text>
        <Text style={s.subtitle}>Multiple people can join the same channel</Text>
        <View style={s.inputWrap}>
          <Text style={s.inputLabel}>Channel name</Text>
          <TextInput style={s.input} value={channel} onChangeText={setChannel} placeholder="e.g. main" placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false}/>
        </View>
        <TouchableOpacity style={[s.joinBtn, joining && s.joinBtnDisabled]} onPress={join} disabled={joining}>
          {joining ? <ActivityIndicator color="#fff"/> : <Text style={s.joinBtnText}>Join Room</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:"#0a0a0a" },
  header: { flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:"#222" },
  backBtn: { padding:4 },
  backIcon: { color:"#c850c0", fontSize:22 },
  headerTitle: { color:"#fff", fontSize:17, fontWeight:"600" },
  callHeader: { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:10, backgroundColor:"#111", gap:12 },
  livePill: { flexDirection:"row", alignItems:"center", gap:5, backgroundColor:"#c850c0", paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  liveDot: { width:6, height:6, borderRadius:3, backgroundColor:"#fff" },
  liveText: { color:"#fff", fontSize:11, fontWeight:"700" },
  channelName: { color:"#fff", fontSize:14, fontWeight:"500", flex:1 },
  endBtn: { backgroundColor:"#e53935", paddingHorizontal:16, paddingVertical:6, borderRadius:20 },
  endBtnText: { color:"#fff", fontSize:13, fontWeight:"600" },
  lobby: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32, gap:16 },
  iconCircle: { width:80, height:80, borderRadius:40, backgroundColor:"#f5e6ff", alignItems:"center", justifyContent:"center", marginBottom:8 },
  title: { fontSize:24, fontWeight:"700", color:"#fff" },
  subtitle: { fontSize:14, color:"#888", textAlign:"center" },
  inputWrap: { width:"100%", gap:6 },
  inputLabel: { color:"#aaa", fontSize:13 },
  input: { backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#333", borderRadius:10, paddingHorizontal:16, paddingVertical:12, color:"#fff", fontSize:16 },
  joinBtn: { backgroundColor:"#c850c0", paddingHorizontal:48, paddingVertical:16, borderRadius:12, alignItems:"center", width:"100%" },
  joinBtnDisabled: { opacity:0.6 },
  joinBtnText: { color:"#fff", fontSize:16, fontWeight:"600" },
});
