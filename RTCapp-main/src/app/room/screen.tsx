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

export default function ScreenShareRoom() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [role, setRole] = useState<"sharer"|"viewer">("sharer");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);

  const join = async () => {
    if (!channel.trim()) { Alert.alert("Enter a channel name"); return; }
    setJoining(true);
    if (role === "sharer") {
      const ok = await requestPermissions();
      if (!ok) { setJoining(false); return; }
    }
    setJoining(false);
    setInCall(true);
  };

  const startScreenShare = () => {
    setSharing(true);
  };

  const stopScreenShare = () => {
    setSharing(false);
  };

  const leave = () => {
    if (sharing) stopScreenShare();
    setInCall(false);
    setSharing(false);
  };

  if (inCall) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.callBar}>
          <View style={[s.livePill, sharing && s.sharingPill]}>
            <View style={s.ldot}/>
            <Text style={s.liveLabel}>{sharing?"SHARING":"LIVE"}</Text>
          </View>
          <Text style={s.channelLabel}>#{channel}</Text>
          <TouchableOpacity style={s.endBtn} onPress={leave}>
            <Text style={s.endBtnText}>Leave</Text>
          </TouchableOpacity>
        </View>
        <View style={{flex:1, backgroundColor:"#000"}}>
          {sharing
            ? (
              <View style={s.sharePreview}>
                <Text style={s.sharePreviewTitle}>Sharing screen</Text>
                <Text style={s.sharePreviewSub}>#{channel}</Text>
              </View>
            )
            : <View style={s.waitBox}><Text style={s.waitText}>Waiting for sharer...</Text><Text style={s.waitSub}>Channel: <Text style={{color:"#534ab7"}}>#{channel}</Text></Text></View>
          }
          {role === "sharer" && (
            <View style={s.shareControls}>
              <TouchableOpacity style={[s.shareBtn, sharing ? s.shareBtnStop : s.shareBtnStart]} onPress={sharing ? stopScreenShare : startScreenShare}>
                <Text style={s.shareBtnText}>{sharing ? "Stop Sharing" : "Share Screen"}</Text>
              </TouchableOpacity>
            </View>
          )}
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
        <Text style={s.headerTitle}>Screen Share</Text>
      </View>
      <View style={s.lobby}>
        <View style={s.iconCircle}><Text style={{fontSize:36}}>🖥️</Text></View>
        <Text style={s.title}>Screen Share</Text>
        <Text style={s.subtitle}>Share your screen or watch someone else's</Text>
        <View style={s.roleRow}>
          <TouchableOpacity style={[s.roleBtn, role==="sharer" && s.roleBtnActive]} onPress={()=>setRole("sharer")}>
            <Text style={[s.roleBtnText, role==="sharer" && s.roleBtnTextActive]}>🖥️ Share my screen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.roleBtn, role==="viewer" && s.roleBtnActive]} onPress={()=>setRole("viewer")}>
            <Text style={[s.roleBtnText, role==="viewer" && s.roleBtnTextActive]}>👁 Watch a screen</Text>
          </TouchableOpacity>
        </View>
        <View style={s.inputWrap}>
          <Text style={s.inputLabel}>Channel name</Text>
          <TextInput style={s.input} value={channel} onChangeText={setChannel} placeholder="e.g. my-screen" placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false}/>
        </View>
        <TouchableOpacity style={[s.joinBtn, joining && s.disabled]} onPress={join} disabled={joining}>
          {joining ? <ActivityIndicator color="#fff"/> : <Text style={s.joinBtnText}>{role==="sharer"?"🖥️ Start Session":"👁 Watch Session"}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:"#0a0a0a" },
  header: { flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:"#222" },
  backBtn: { padding:4 },
  backIcon: { color:"#534ab7", fontSize:22 },
  headerTitle: { color:"#fff", fontSize:17, fontWeight:"600" },
  callBar: { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:10, backgroundColor:"#111", gap:12 },
  livePill: { flexDirection:"row", alignItems:"center", gap:5, backgroundColor:"#534ab7", paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  sharingPill: { backgroundColor:"#4caf50" },
  ldot: { width:6, height:6, borderRadius:3, backgroundColor:"#fff" },
  liveLabel: { color:"#fff", fontSize:11, fontWeight:"700" },
  channelLabel: { color:"#fff", fontSize:14, fontWeight:"500", flex:1 },
  endBtn: { backgroundColor:"#e53935", paddingHorizontal:16, paddingVertical:6, borderRadius:20 },
  endBtnText: { color:"#fff", fontSize:13, fontWeight:"600" },
  waitBox: { flex:1, alignItems:"center", justifyContent:"center", gap:8 },
  waitText: { color:"#888", fontSize:16 },
  waitSub: { color:"#666", fontSize:14 },
  sharePreview: { flex:1, alignItems:"center", justifyContent:"center", gap:8, backgroundColor:"#101820" },
  sharePreviewTitle: { color:"#fff", fontSize:24, fontWeight:"700" },
  sharePreviewSub: { color:"#a89cf7", fontSize:14 },
  shareControls: { position:"absolute", bottom:32, left:0, right:0, alignItems:"center" },
  shareBtn: { paddingHorizontal:28, paddingVertical:14, borderRadius:28 },
  shareBtnStart: { backgroundColor:"#534ab7" },
  shareBtnStop: { backgroundColor:"#e53935" },
  shareBtnText: { color:"#fff", fontSize:15, fontWeight:"600" },
  lobby: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32, gap:16 },
  iconCircle: { width:80, height:80, borderRadius:40, backgroundColor:"#eeedfe", alignItems:"center", justifyContent:"center", marginBottom:8 },
  title: { fontSize:24, fontWeight:"700", color:"#fff" },
  subtitle: { fontSize:14, color:"#888", textAlign:"center" },
  roleRow: { flexDirection:"row", gap:8, width:"100%" },
  roleBtn: { flex:1, paddingVertical:12, borderRadius:10, borderWidth:0.5, borderColor:"#333", alignItems:"center", backgroundColor:"#111" },
  roleBtnActive: { borderColor:"#534ab7", backgroundColor:"#1a1530" },
  roleBtnText: { color:"#666", fontSize:13, fontWeight:"500" },
  roleBtnTextActive: { color:"#a89cf7" },
  inputWrap: { width:"100%", gap:6 },
  inputLabel: { color:"#aaa", fontSize:13 },
  input: { backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#333", borderRadius:10, paddingHorizontal:16, paddingVertical:12, color:"#fff", fontSize:16 },
  joinBtn: { backgroundColor:"#534ab7", paddingHorizontal:48, paddingVertical:16, borderRadius:12, alignItems:"center", width:"100%" },
  disabled: { opacity:0.6 },
  joinBtnText: { color:"#fff", fontSize:16, fontWeight:"600" },
});
