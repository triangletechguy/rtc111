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

export default function ScreenShareWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [role, setRole] = useState<"sharer"|"viewer">("sharer");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<any>(null);
  const screenTrackRef = useRef<any>(null);
  const audioTrackRef = useRef<any>(null);

  const join = async () => {
    if (!channel.trim()) { setError("Enter a channel name"); return; }
    setJoining(true); setError("");
    try {
      const AgoraRTC = await loadAgoraSDK();
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      clientRef.current = client;
      await client.setClientRole(role === "sharer" ? "host" : "audience");
      client.on("user-published", async (user: any, mediaType: any) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") { setRemoteJoined(true); setTimeout(() => user.videoTrack?.play("remote-screen"), 100); }
        if (mediaType === "audio") user.audioTrack?.play();
      });
      client.on("user-unpublished", () => setRemoteJoined(false));
      await client.join(APP_ID, channel.trim(), null, null);
      setJoining(false);
      setInCall(true);
    } catch (e: any) { setError(e.message); setJoining(false); }
  };

  const startScreenShare = async () => {
    try {
      const AgoraRTC = await loadAgoraSDK();
      const screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "auto");
      const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
      const audioTrack = Array.isArray(screenTrack) ? screenTrack[1] : null;
      screenTrackRef.current = videoTrack;
      audioTrackRef.current = audioTrack;
      await clientRef.current?.publish(audioTrack ? [videoTrack, audioTrack] : [videoTrack]);
      videoTrack.play("local-screen");
      setSharing(true);
    } catch (e: any) { setError(e.message); }
  };

  const stopScreenShare = async () => {
    screenTrackRef.current?.close();
    audioTrackRef.current?.close();
    await clientRef.current?.unpublish();
    setSharing(false);
  };

  const leave = async () => {
    if (sharing) await stopScreenShare();
    await clientRef.current?.leave();
    clientRef.current = null;
    setInCall(false);
    setSharing(false);
    setRemoteJoined(false);
  };

  useEffect(() => () => { leave(); }, []);

  if (inCall) {
    return (
      <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#000", fontFamily:"sans-serif"}}>
        <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 16px", backgroundColor:"#111"}}>
          <div style={{display:"flex", alignItems:"center", gap:5, backgroundColor: sharing?"#4caf50":"#534ab7", padding:"4px 10px", borderRadius:20, color:"#fff", fontSize:11, fontWeight:700}}>
            <div style={{width:6,height:6,borderRadius:"50%",backgroundColor:"#fff"}}/>{sharing?"SHARING":"LIVE"}
          </div>
          <span style={{color:"#fff", fontSize:14, flex:1}}>#{channel}</span>
          <button style={{backgroundColor:"#e53935", color:"#fff", border:"none", padding:"6px 16px", borderRadius:20, cursor:"pointer", fontWeight:600}} onClick={leave}>Leave</button>
        </div>
        <div style={{flex:1, position:"relative", display:"flex", alignItems:"center", justifyContent:"center"}}>
          {remoteJoined
            ? <div id="remote-screen" style={{width:"100%", height:"100%", minHeight:"calc(100vh - 56px)"}}/>
            : !sharing && <div style={{color:"#888", fontSize:16}}>Waiting for sharer…</div>
          }
          {sharing && <div id="local-screen" style={{position:"absolute", top:16, right:16, width:200, height:130, borderRadius:12, overflow:"hidden", border:"2px solid #4caf50", backgroundColor:"#111"}}/>}
          {role === "sharer" && (
            <div style={{position:"absolute", bottom:32, left:0, right:0, display:"flex", justifyContent:"center"}}>
              <button style={{padding:"14px 28px", borderRadius:28, border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", backgroundColor: sharing?"#e53935":"#534ab7"}}
                onClick={sharing ? stopScreenShare : startScreenShare}>
                {sharing ? "⏹ Stop Sharing" : "🖥️ Share Screen"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#0a0a0a", fontFamily:"sans-serif"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"0.5px solid #222"}}>
        <button style={{background:"none", border:"none", color:"#534ab7", fontSize:16, cursor:"pointer"}} onClick={() => router.back()}>← Back</button>
        <span style={{color:"#fff", fontSize:17, fontWeight:600}}>Screen Share</span>
      </div>
      <div style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"0 32px"}}>
        <div style={{width:80, height:80, borderRadius:"50%", backgroundColor:"#eeedfe", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36}}>🖥️</div>
        <div style={{fontSize:24, fontWeight:700, color:"#fff"}}>Screen Share</div>
        <div style={{fontSize:14, color:"#888", textAlign:"center"}}>Share your screen or watch someone else's</div>
        {error && <div style={{color:"#ff4d4d", fontSize:13}}>{error}</div>}
        <div style={{display:"flex", gap:8, width:"100%", maxWidth:400}}>
          <button onClick={()=>setRole("sharer")} style={{flex:1, padding:12, borderRadius:10, border: role==="sharer"?"0.5px solid #534ab7":"0.5px solid #333", backgroundColor: role==="sharer"?"#1a1530":"#111", color: role==="sharer"?"#a89cf7":"#666", fontSize:13, fontWeight:500, cursor:"pointer"}}>🖥️ Share my screen</button>
          <button onClick={()=>setRole("viewer")} style={{flex:1, padding:12, borderRadius:10, border: role==="viewer"?"0.5px solid #534ab7":"0.5px solid #333", backgroundColor: role==="viewer"?"#1a1530":"#111", color: role==="viewer"?"#a89cf7":"#666", fontSize:13, fontWeight:500, cursor:"pointer"}}>👁 Watch a screen</button>
        </div>
        <div style={{width:"100%", maxWidth:400, display:"flex", flexDirection:"column", gap:6}}>
          <label style={{color:"#aaa", fontSize:13}}>Channel name</label>
          <input style={{backgroundColor:"#1a1a1a", border:"0.5px solid #333", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:16, outline:"none"}} value={channel} onChange={e => setChannel(e.target.value)} placeholder="e.g. my-screen"/>
        </div>
        <button style={{backgroundColor:"#534ab7", color:"#fff", border:"none", padding:"16px 0", borderRadius:12, fontSize:16, fontWeight:600, cursor:"pointer", width:"100%", maxWidth:400, opacity:joining?0.6:1}} onClick={join} disabled={joining}>
          {joining ? "Connecting…" : role==="sharer" ? "🖥️ Start Session" : "👁 Watch Session"}
        </button>
      </div>
    </div>
  );
}
