import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, PermissionsAndroid, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const LIVE_ROOMS = [
  { id:"ch_music", host:"MelodyV", title:"Live covers — request songs!", viewers:3205, color:"#9c27b0" },
  { id:"ch_chat",  host:"MissJay", title:"Chill chat room, come hang!", viewers:1240, color:"#c850c0" },
  { id:"ch_study", host:"StudyBro", title:"Study with me — lo-fi session", viewers:412, color:"#4158d0" },
];

async function requestPermissions() {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return granted[PermissionsAndroid.PERMISSIONS.CAMERA] === "granted"
    && granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === "granted";
}

export default function SoloLiveRoom() {
  const router = useRouter();
  const [mode, setMode] = useState<"lobby"|"host"|"viewer">("lobby");
  const [channel, setChannel] = useState("");
  const [joining, setJoining] = useState(false);

  const startEngine = async (ch: string, role: "host"|"viewer") => {
    if (role === "host") {
      const ok = await requestPermissions();
      if (!ok) return false;
    }
    setChannel(ch);
    return true;
  };

  const leaveCall = () => {
    setMode("lobby");
  };

  const goLive = async () => {
    if (!channel.trim()) { Alert.alert("Enter a channel name"); return; }
    setJoining(true);
    const ok = await startEngine(channel.trim(), "host");
    setJoining(false);
    if (ok) setMode("host");
  };

  const watchRoom = async (ch: string) => {
    setJoining(true);
    const ok = await startEngine(ch, "viewer");
    setJoining(false);
    if (ok) setMode("viewer");
  };

  if (mode === "host" || mode === "viewer") {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.callBar}>
          <View style={s.livePill}><View style={s.ldot}/><Text style={s.liveLabel}>LIVE</Text></View>
          <Text style={s.channelLabel}>#{channel}</Text>
          <TouchableOpacity style={s.endBtn} onPress={leaveCall}>
            <Text style={s.endBtnText}>{mode==="host"?"End Live":"Leave"}</Text>
          </TouchableOpacity>
        </View>
        <View style={{flex:1, backgroundColor:"#000"}}>
          {mode === "host"
            ? (
              <View style={s.broadcastTile}>
                <Text style={s.broadcastTitle}>You are live</Text>
                <Text style={s.broadcastSub}>#{channel}</Text>
              </View>
            )
            : <View style={s.waitBox}><Text style={s.waitText}>Waiting for host...</Text></View>
          }
          {mode === "host" && (
            <View style={s.hostOverlay}>
              <Text style={s.hostOverlayText}>You are broadcasting</Text>
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
        <Text style={s.headerTitle}>Solo Live</Text>
      </View>
      <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}>
        <View style={s.goLiveBox}>
          <Text style={s.glTitle}>Start your live stream</Text>
          <Text style={s.glSub}>You broadcast — others watch</Text>
          <TextInput style={s.input} value={channel} onChangeText={setChannel} placeholder="Channel name" placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false}/>
          <TouchableOpacity style={[s.goLiveBtn, joining && s.disabled]} onPress={goLive} disabled={joining}>
            {joining ? <ActivityIndicator color="#fff"/> : <Text style={s.goLiveBtnText}>📡 Go Live</Text>}
          </TouchableOpacity>
        </View>
        <View style={s.sectionLabel}><View style={s.dot}/><Text style={s.sectionLabelText}>Live now</Text></View>
        {LIVE_ROOMS.map(room => (
          <TouchableOpacity key={room.id} style={s.roomRow} onPress={() => watchRoom(room.id)}>
            <View style={[s.roomAvatar, {backgroundColor: room.color}]}>
              <Text style={s.roomAvatarText}>{room.host[0]}</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={s.roomTitle}>{room.title}</Text>
              <Text style={s.roomMeta}>{room.host} · 👥 {room.viewers.toLocaleString()}</Text>
            </View>
            <View style={s.watchBtn}><Text style={s.watchBtnText}>Watch</Text></View>
          </TouchableOpacity>
        ))}
        <View style={{height:32}}/>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:"#0a0a0a" },
  header: { flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:"#222" },
  backBtn: { padding:4 },
  backIcon: { color:"#c850c0", fontSize:22 },
  headerTitle: { color:"#fff", fontSize:17, fontWeight:"600" },
  callBar: { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:10, backgroundColor:"#111", gap:12 },
  livePill: { flexDirection:"row", alignItems:"center", gap:5, backgroundColor:"#c850c0", paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  ldot: { width:6, height:6, borderRadius:3, backgroundColor:"#fff" },
  liveLabel: { color:"#fff", fontSize:11, fontWeight:"700" },
  channelLabel: { color:"#fff", fontSize:14, fontWeight:"500", flex:1 },
  endBtn: { backgroundColor:"#e53935", paddingHorizontal:16, paddingVertical:6, borderRadius:20 },
  endBtnText: { color:"#fff", fontSize:13, fontWeight:"600" },
  hostOverlay: { position:"absolute", bottom:24, left:0, right:0, alignItems:"center" },
  hostOverlayText: { color:"rgba(255,255,255,0.7)", fontSize:14, backgroundColor:"rgba(0,0,0,0.5)", paddingHorizontal:16, paddingVertical:6, borderRadius:20 },
  broadcastTile: { flex:1, alignItems:"center", justifyContent:"center", gap:8, backgroundColor:"#160e20" },
  broadcastTitle: { color:"#fff", fontSize:24, fontWeight:"700" },
  broadcastSub: { color:"#d8b6e8", fontSize:14 },
  waitBox: { flex:1, alignItems:"center", justifyContent:"center" },
  waitText: { color:"#888", fontSize:16 },
  goLiveBox: { margin:16, backgroundColor:"#111", borderRadius:16, padding:20, gap:12, borderWidth:0.5, borderColor:"#333" },
  glTitle: { color:"#fff", fontSize:18, fontWeight:"600" },
  glSub: { color:"#888", fontSize:13 },
  input: { backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#333", borderRadius:10, paddingHorizontal:16, paddingVertical:12, color:"#fff", fontSize:16 },
  goLiveBtn: { backgroundColor:"#c850c0", paddingVertical:14, borderRadius:12, alignItems:"center" },
  disabled: { opacity:0.6 },
  goLiveBtnText: { color:"#fff", fontSize:16, fontWeight:"600" },
  sectionLabel: { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:16, marginBottom:12 },
  dot: { width:8, height:8, borderRadius:4, backgroundColor:"#c850c0" },
  sectionLabelText: { color:"#fff", fontSize:15, fontWeight:"600" },
  roomRow: { flexDirection:"row", alignItems:"center", gap:12, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:"#1a1a1a" },
  roomAvatar: { width:44, height:44, borderRadius:22, alignItems:"center", justifyContent:"center" },
  roomAvatarText: { color:"#fff", fontSize:16, fontWeight:"700" },
  roomTitle: { color:"#fff", fontSize:14, fontWeight:"500", marginBottom:2 },
  roomMeta: { color:"#888", fontSize:12 },
  watchBtn: { backgroundColor:"#1a1a1a", borderWidth:0.5, borderColor:"#c850c0", paddingHorizontal:14, paddingVertical:7, borderRadius:20 },
  watchBtnText: { color:"#c850c0", fontSize:13, fontWeight:"500" },
});
