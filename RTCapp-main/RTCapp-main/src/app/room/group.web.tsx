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

export default function GroupVideoRoomWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("main");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<any>(null);
  const tracksRef = useRef<any[]>([]);

  const playRemoteVideo = (user: any) => {
    // Retry every animation frame until #videos-container exists in the DOM
    const tryPlay = () => {
      const container = document.getElementById("videos-container");
      if (!container) { requestAnimationFrame(tryPlay); return; }
      let div = document.getElementById(`remote-${user.uid}`);
      if (!div) {
        div = document.createElement("div");
        div.id = `remote-${user.uid}`;
        div.style.cssText = "width:320px;height:240px;background:#1a1a1a;border-radius:12px;overflow:hidden;flex-shrink:0;";
        container.appendChild(div);
      }
      user.videoTrack.play(`remote-${user.uid}`);
    };
    tryPlay();
  };

  const join = async () => {
    if (!channel.trim()) { setError("Enter a channel name"); return; }
    setJoining(true); setError("");
    try {
      const AgoraRTC = await loadAgoraSDK();
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user: any, mediaType: any) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") playRemoteVideo(user);
        if (mediaType === "audio") user.audioTrack?.play();
      });

      client.on("user-unpublished", (user: any) => {
        document.getElementById(`remote-${user.uid}`)?.remove();
      });

      await client.join(APP_ID, channel.trim(), null, null);
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        { AEC: true, ANS: true, AGC: true }, {}
      );
      tracksRef.current = [audioTrack, videoTrack];
      await client.publish([audioTrack, videoTrack]);
      setJoining(false);
      setInCall(true);
      // Play local video after state update
      setTimeout(() => videoTrack.play("local-video"), 300);
    } catch (e: any) {
      setError(e.message);
      setJoining(false);
    }
  };

  const leave = async () => {
    tracksRef.current.forEach(t => t.close());
    await clientRef.current?.leave();
    clientRef.current = null;
    tracksRef.current = [];
    setInCall(false);
  };

  useEffect(() => () => { leave(); }, []);

  if (inCall) {
    return (
      <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#0a0a0a", fontFamily:"sans-serif"}}>
        <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 16px", backgroundColor:"#111"}}>
          <div style={{display:"flex", alignItems:"center", gap:5, backgroundColor:"#c850c0", padding:"4px 10px", borderRadius:20, color:"#fff", fontSize:11, fontWeight:700}}>
            <div style={{width:6, height:6, borderRadius:"50%", backgroundColor:"#fff"}}/>LIVE
          </div>
          <span style={{color:"#fff", fontSize:14, flex:1}}>#{channel}</span>
          <button style={{backgroundColor:"#e53935", color:"#fff", border:"none", padding:"6px 16px", borderRadius:20, cursor:"pointer", fontWeight:600}} onClick={leave}>End Call</button>
        </div>
        {/* videos-container: local tile always here, remote tiles injected dynamically */}
        <div id="videos-container" style={{flex:1, display:"flex", flexWrap:"wrap", gap:12, padding:16, alignContent:"flex-start"}}>
          <div id="local-video" style={{width:320, height:240, backgroundColor:"#1a1a1a", borderRadius:12, overflow:"hidden", flexShrink:0}}/>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#0a0a0a", fontFamily:"sans-serif"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"0.5px solid #222"}}>
        <button style={{background:"none", border:"none", color:"#c850c0", fontSize:16, cursor:"pointer"}} onClick={() => router.back()}>← Back</button>
        <span style={{color:"#fff", fontSize:17, fontWeight:600}}>Group Video</span>
      </div>
      <div style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"0 32px"}}>
        <div style={{width:80, height:80, borderRadius:"50%", backgroundColor:"#f5e6ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36}}>👥</div>
        <div style={{fontSize:24, fontWeight:700, color:"#fff"}}>Join a Group Room</div>
        <div style={{fontSize:14, color:"#888", textAlign:"center"}}>Multiple people can join the same channel</div>
        {error && <div style={{color:"#ff4d4d", fontSize:14}}>{error}</div>}
        <div style={{width:"100%", maxWidth:400, display:"flex", flexDirection:"column", gap:6}}>
          <label style={{color:"#aaa", fontSize:13}}>Channel name</label>
          <input style={{backgroundColor:"#1a1a1a", border:"0.5px solid #333", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:16, outline:"none"}}
            value={channel} onChange={e => setChannel(e.target.value)} placeholder="e.g. main"
            onKeyDown={e => e.key === "Enter" && join()}/>
        </div>
        <button style={{backgroundColor:"#c850c0", color:"#fff", border:"none", padding:"16px 0", borderRadius:12, fontSize:16, fontWeight:600, cursor:"pointer", width:"100%", maxWidth:400, opacity:joining?0.6:1}}
          onClick={join} disabled={joining}>
          {joining ? "Joining…" : "Join Room"}
        </button>
      </div>
    </div>
  );
}
