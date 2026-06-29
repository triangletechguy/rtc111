import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, PermissionsAndroid } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

async function requestPermissions() {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return granted[PermissionsAndroid.PERMISSIONS.CAMERA] === "granted"
    && granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === "granted";
}

export default function OneToOneCall() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const join = async () => {
    if (!channel.trim()) { Alert.alert("Enter a channel name"); return; }
    setJoining(true);
    const ok = await requestPermissions();
    if (!ok) { setJoining(false); return; }

    setJoining(false);
    setInCall(true);
  };

  const leave = () => {
    setInCall(false);
    setMuted(false);
    setVideoOff(false);
  };

  const toggleMute = () => setMuted(value => !value);
  const toggleVideo = () => setVideoOff(value => !value);

  if (inCall) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.callStage}>
          <View style={s.remotePane}>
            <Text style={s.waitingText}>Waiting for other person...</Text>
            <Text style={s.waitingSub}>Share channel: <Text style={{color:"#c850c0"}}>#{channel}</Text></Text>
          </View>
          {!videoOff && (
            <View style={s.pip}>
              <Text style={s.pipText}>You</Text>
            </View>
          )}
          <View style={s.controls}>
            <TouchableOpacity style={[s.ctrlBtn, muted && s.ctrlActive]} onPress={toggleMute}>
              <Text style={s.ctrlText}>{muted ? "Unmute" : "Mute"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.endCallBtn} onPress={leave}>
              <Text style={s.endCallText}>End</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctrlBtn, videoOff && s.ctrlActive]} onPress={toggleVideo}>
              <Text style={s.ctrlText}>{videoOff ? "Camera On" : "Camera Off"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>1-to-1 Call</Text>
      </View>
      <View style={s.lobby}>
        <View style={s.iconCircle}><Text style={{fontSize:36}}>📞</Text></View>
        <Text style={s.title}>Private Video Call</Text>
        <Text style={s.subtitle}>Share the same channel name with the person you want to call</Text>
        <View style={s.inputWrap}>
          <Text style={s.inputLabel}>Channel name</Text>
          <TextInput style={s.input} value={channel} onChangeText={setChannel} placeholder="e.g. call-john" placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false}/>
        </View>
        <TouchableOpacity style={[s.joinBtn, joining && s.disabled]} onPress={join} disabled={joining}>
          {joining ? <ActivityIndicator color="#fff"/> : <Text style={s.joinBtnText}>📞 Start Call</Text>}
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
  lobby: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32, gap:16 },
  iconCircle: { width:80, height:80, borderRadius:40, backgroundColor:"#e6f1fb", alignItems:"center", justifyContent:"center", marginBottom:8 },
  title: { fontSize:24, fontWeight:"700", color:"#fff" },
  subtitle: { fontSize:14, color:"#888", textAlign:"center" },
  inputWrap: { width:"100%", gap:6 },
  inputLabel: { color:"#aaa", fontSize:13 },
  input: { backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#333", borderRadius:10, paddingHorizontal:16, paddingVertical:12, color:"#fff", fontSize:16 },
  joinBtn: { backgroundColor:"#4158d0", paddingHorizontal:48, paddingVertical:16, borderRadius:12, alignItems:"center", width:"100%" },
  disabled: { opacity:0.6 },
  joinBtnText: { color:"#fff", fontSize:16, fontWeight:"600" },
  waitingBox: { flex:1, alignItems:"center", justifyContent:"center", gap:8 },
  callStage: { flex:1, backgroundColor:"#000" },
  remotePane: { flex:1, alignItems:"center", justifyContent:"center", gap:8, padding:24 },
  waitingText: { color:"#888", fontSize:16 },
  waitingSub: { color:"#666", fontSize:14 },
  pip: { position:"absolute", top:16, right:16, width:100, height:140, borderRadius:12, overflow:"hidden", borderWidth:2, borderColor:"#333", alignItems:"center", justifyContent:"center", backgroundColor:"#151d29" },
  pipText: { color:"#fff", fontSize:14, fontWeight:"700" },
  controls: { position:"absolute", bottom:32, left:0, right:0, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:20 },
  ctrlBtn: { minWidth:76, height:56, borderRadius:28, paddingHorizontal:12, backgroundColor:"rgba(255,255,255,0.15)", alignItems:"center", justifyContent:"center" },
  ctrlActive: { backgroundColor:"rgba(200,80,192,0.4)" },
  ctrlText: { color:"#fff", fontSize:12, fontWeight:"700" },
  endCallBtn: { width:68, height:68, borderRadius:34, backgroundColor:"#e53935", alignItems:"center", justifyContent:"center" },
  endCallText: { color:"#fff", fontSize:14, fontWeight:"700" },
});
