import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";

const APP_ID = "a2547ce438e34f269a2a2f956cebb68a";
const AGORA_SDK_URL = "https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js";

function loadAgoraSDK(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).AgoraRTC) { resolve((window as any).AgoraRTC); return; }
    const script = document.createElement("script");
    script.src = AGORA_SDK_URL;
    script.onload = () => resolve((window as any).AgoraRTC);
    script.onerror = () => reject(new Error("Failed to load Agora SDK"));
    document.head.appendChild(script);
  });
}

export default function OneToOneCallWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<any>(null);
  const audioRef = useRef<any>(null);
  const videoRef = useRef<any>(null);

  const join = async () => {
    if (!channel.trim()) { setError("Enter a channel name"); return; }
    setJoining(true); setError("");
    try {
      const AgoraRTC = await loadAgoraSDK();
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;
      client.on("user-published", async (user: any, mediaType: any) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
          setRemoteJoined(true);
          setTimeout(() => user.videoTrack?.play("remote-video"), 100);
        }
        if (mediaType === "audio") user.audioTrack?.play();
      });
      client.on("user-unpublished", () => setRemoteJoined(false));
      await client.join(APP_ID, channel.trim(), null, null);
      const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks(
        { AEC: true, ANS: true, AGC: true }, {}
      );
      audioRef.current = audio;
      videoRef.current = video;
      await client.publish([audio, video]);
      setJoining(false);
      setInCall(true);
    } catch (e: any) {
      setError(e.message);
      setJoining(false);
    }
  };

  const leave = async () => {
    audioRef.current?.close();
    videoRef.current?.close();
    await clientRef.current?.leave();
    clientRef.current = null;
    setInCall(false);
    setRemoteJoined(false);
    setMuted(false);
    setVideoOff(false);
  };

  const toggleMute = () => { audioRef.current?.setMuted(!muted); setMuted(!muted); };
  const toggleVideo = () => { videoRef.current?.setMuted(!videoOff); setVideoOff(!videoOff); };

  useEffect(() => {
    if (inCall) setTimeout(() => videoRef.current?.play("local-video"), 100);
  }, [inCall]);

  useEffect(() => () => { leave(); }, []);

  if (inCall) {
    return (
      <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#000", fontFamily:"sans-serif", position:"relative"}}>
        {remoteJoined
          ? <div id="remote-video" style={{width:"100%", height:"100%"}}/>
          : (
            <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8}}>
              <div style={{color:"#888", fontSize:16}}>Waiting for other person…</div>
              <div style={{color:"#666", fontSize:14}}>Share channel: <span style={{color:"#c850c0"}}>#{channel}</span></div>
            </div>
          )
        }
        {!videoOff && <div id="local-video" style={{position:"absolute", top:16, right:16, width:160, height:120, borderRadius:12, overflow:"hidden", border:"2px solid #333", backgroundColor:"#111"}}/>}
        <div style={{position:"absolute", bottom:32, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"center", gap:20}}>
          <button onClick={toggleMute} style={{width:56, height:56, borderRadius:"50%", backgroundColor: muted?"rgba(200,80,192,0.4)":"rgba(255,255,255,0.15)", border:"none", fontSize:22, cursor:"pointer"}}>{muted?"🔇":"🎙️"}</button>
          <button onClick={leave} style={{width:68, height:68, borderRadius:"50%", backgroundColor:"#e53935", border:"none", fontSize:28, cursor:"pointer"}}>📵</button>
          <button onClick={toggleVideo} style={{width:56, height:56, borderRadius:"50%", backgroundColor: videoOff?"rgba(200,80,192,0.4)":"rgba(255,255,255,0.15)", border:"none", fontSize:22, cursor:"pointer"}}>{videoOff?"📷":"📹"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#0a0a0a", fontFamily:"sans-serif"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"0.5px solid #222"}}>
        <button style={{background:"none", border:"none", color:"#c850c0", fontSize:16, cursor:"pointer"}} onClick={() => router.back()}>← Back</button>
        <span style={{color:"#fff", fontSize:17, fontWeight:600}}>1-to-1 Call</span>
      </div>
      <div style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"0 32px"}}>
        <div style={{width:80, height:80, borderRadius:"50%", backgroundColor:"#e6f1fb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36}}>📞</div>
        <div style={{fontSize:24, fontWeight:700, color:"#fff"}}>Private Video Call</div>
        <div style={{fontSize:14, color:"#888", textAlign:"center"}}>Share the same channel name with the person you want to call</div>
        {error && <div style={{color:"#ff4d4d", fontSize:14}}>{error}</div>}
        <div style={{width:"100%", maxWidth:400, display:"flex", flexDirection:"column", gap:6}}>
          <label style={{color:"#aaa", fontSize:13}}>Channel name</label>
          <input style={{backgroundColor:"#1a1a1a", border:"0.5px solid #333", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:16, outline:"none"}} value={channel} onChange={e => setChannel(e.target.value)} placeholder="e.g. call-john"
            onKeyDown={e => e.key === "Enter" && join()}/>
        </div>
        <button style={{backgroundColor:"#4158d0", color:"#fff", border:"none", padding:"16px 0", borderRadius:12, fontSize:16, fontWeight:600, cursor:"pointer", width:"100%", maxWidth:400, opacity:joining?0.6:1}} onClick={join} disabled={joining}>
          {joining ? "Connecting…" : "📞 Start Call"}
        </button>
      </div>
    </div>
  );
}
