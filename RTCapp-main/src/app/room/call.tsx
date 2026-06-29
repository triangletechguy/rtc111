import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, PermissionsAndroid } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const APP_ID = "a2547ce438e34f269a2a2f956cebb68a";

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
  const [remoteUid, setRemoteUid] = useState<number|null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const engineRef = useRef<any>(null);

  const join = async () => {
    if (!channel.trim()) { Alert.alert("Enter a channel name"); return; }
    setJoining(true);
    const ok = await requestPermissions();
    if (!ok) { setJoining(false); return; }

    const { createAgoraRtcEngine, ChannelProfileType } = require("react-native-agora");
    const engine = createAgoraRtcEngine();
    engineRef.current = engine;
    engine.initialize({ appId: APP_ID });
    engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
    engine.enableVideo();
    engine.startPreview();
    engine.registerEventHandler({
      onUserJoined: (_c: any, uid: number) => setRemoteUid(uid),
      onUserOffline: () => setRemoteUid(null),
    });
    await engine.joinChannel(null, channel.trim(), 0, {});
    setJoining(false);
    setInCall(true);
  };

  const leave = async () => {
    await engineRef.current?.leaveChannel();
    engineRef.current?.release();
    engineRef.current = null;
    setRemoteUid(null);
    setInCall(false);
    setMuted(false);
    setVideoOff(false);
  };

  const toggleMute = () => { engineRef.current?.muteLocalAudioStream(!muted); setMuted(!muted); };
  const toggleVideo = () => { engineRef.current?.muteLocalVideoStream(!videoOff); setVideoOff(!videoOff); };

  if (inCall) {
    const { RtcSurfaceView, VideoSourceType } = require("react-native-agora");
    return (
      <SafeAreaView style={s.safe}>
        <View style={{flex:1, backgroundColor:"#000"}}>
          {remoteUid !== null
            ? <RtcSurfaceView style={{flex:1}} canvas={{uid: remoteUid, sourceType: VideoSourceType.VideoSourceRemote}}/>
            : (
              <View style={s.waitingBox}>
                <Text style={s.waitingText}>Waiting for other person…</Text>
                <Text style={s.waitingSub}>Share channel: <Text style={{color:"#c850c0"}}>#{channel}</Text></Text>
              </View>
            )
          }
          {!videoOff && (
            <View style={s.pip}>
              <RtcSurfaceView style={{flex:1}} canvas={{uid:0, sourceType: VideoSourceType.VideoSourceCamera}}/>
            </View>
          )}
          <View style={s.controls}>
            <TouchableOpacity style={[s.ctrlBtn, muted && s.ctrlActive]} onPress={toggleMute}>
              <Text style={s.ctrlIcon}>{muted?"🔇":"🎙️"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.endCallBtn} onPress={leave}>
              <Text style={s.endCallIcon}>📵</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctrlBtn, videoOff && s.ctrlActive]} onPress={toggleVideo}>
              <Text style={s.ctrlIcon}>{videoOff?"📷":"📹"}</Text>
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
  waitingText: { color:"#888", fontSize:16 },
  waitingSub: { color:"#666", fontSize:14 },
  pip: { position:"absolute", top:16, right:16, width:100, height:140, borderRadius:12, overflow:"hidden", borderWidth:2, borderColor:"#333" },
  controls: { position:"absolute", bottom:32, left:0, right:0, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:20 },
  ctrlBtn: { width:56, height:56, borderRadius:28, backgroundColor:"rgba(255,255,255,0.15)", alignItems:"center", justifyContent:"center" },
  ctrlActive: { backgroundColor:"rgba(200,80,192,0.4)" },
  ctrlIcon: { fontSize:22 },
  endCallBtn: { width:68, height:68, borderRadius:34, backgroundColor:"#e53935", alignItems:"center", justifyContent:"center" },
  endCallIcon: { fontSize:28 },
});
