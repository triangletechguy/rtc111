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

const LIVE_ROOMS = [
  { id:"ch_music", host:"MelodyV", title:"Live covers — request songs!", viewers:3205, color:"#9c27b0" },
  { id:"ch_chat",  host:"MissJay", title:"Chill chat room, come hang!", viewers:1240, color:"#c850c0" },
  { id:"ch_study", host:"StudyBro", title:"Study with me — lo-fi session", viewers:412, color:"#4158d0" },
];

export default function SoloLiveWeb() {
  const router = useRouter();
  const [mode, setMode] = useState<"lobby"|"host"|"viewer">("lobby");
  const [channel, setChannel] = useState("");
  const [joining, setJoining] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<any>(null);
  const tracksRef = useRef<any[]>([]);

  const startSession = async (ch: string, role: "host"|"viewer") => {
    setJoining(true); setError("");
    try {
      const AgoraRTC = await loadAgoraSDK();
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      clientRef.current = client;
      await client.setClientRole(role === "host" ? "host" : "audience");
      client.on("user-published", async (user: any, mediaType: any) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") { setRemoteJoined(true); setTimeout(() => user.videoTrack?.play("remote-live"), 100); }
        if (mediaType === "audio") user.audioTrack?.play();
      });
      client.on("user-unpublished", () => setRemoteJoined(false));
      await client.join(APP_ID, ch, null, null);
      if (role === "host") {
        const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks({ AEC: true, ANS: true, AGC: true }, {});
        tracksRef.current = [audio, video];
        await client.publish([audio, video]);
        setTimeout(() => video.play("local-live"), 100);
      }
      setJoining(false);
      setMode(role);
    } catch (e: any) { setError(e.message); setJoining(false); }
  };

  const leave = async () => {
    tracksRef.current.forEach(t => t.close());
    await clientRef.current?.leave();
    clientRef.current = null;
    tracksRef.current = [];
    setRemoteJoined(false);
    setMode("lobby");
  };

  useEffect(() => () => { leave(); }, []);

  if (mode === "host") {
    return (
      <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#000", fontFamily:"sans-serif"}}>
        <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 16px", backgroundColor:"#111"}}>
          <div style={{display:"flex", alignItems:"center", gap:5, backgroundColor:"#c850c0", padding:"4px 10px", borderRadius:20, color:"#fff", fontSize:11, fontWeight:700}}><div style={{width:6,height:6,borderRadius:"50%",backgroundColor:"#fff"}}/>LIVE</div>
          <span style={{color:"#fff", fontSize:14, flex:1}}>#{channel}</span>
          <button style={{backgroundColor:"#e53935", color:"#fff", border:"none", padding:"6px 16px", borderRadius:20, cursor:"pointer", fontWeight:600}} onClick={leave}>End Live</button>
        </div>
        <div id="local-live" style={{flex:1, minHeight:"calc(100vh - 56px)"}}/>
      </div>
    );
  }

  if (mode === "viewer") {
    return (
      <div style={{display:"flex", flexDirection:"column", height:"100vh", backgroundColor:"#000", fontFamily:"sans-serif"}}>
        <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 16px", backgroundColor:"#111"}}>
          <div style={{display:"flex", alignItems:"center", gap:5, backgroundColor:"#c850c0", padding:"4px 10px", borderRadius:20, color:"#fff", fontSize:11, fontWeight:700}}><div style={{width:6,height:6,borderRadius:"50%",backgroundColor:"#fff"}}/>LIVE</div>
          <span style={{color:"#fff", fontSize:14, flex:1}}>#{channel}</span>
          <button style={{backgroundColor:"#e53935", color:"#fff", border:"none", padding:"6px 16px", borderRadius:20, cursor:"pointer", fontWeight:600}} onClick={leave}>Leave</button>
        </div>
        <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center"}}>
          {remoteJoined ? <div id="remote-live" style={{width:"100%", height:"100%", minHeight:"calc(100vh - 56px)"}}/> : <div style={{color:"#888", fontSize:16}}>Waiting for host…</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex", flexDirection:"column", minHeight:"100vh", backgroundColor:"#0a0a0a", fontFamily:"sans-serif"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderBottom:"0.5px solid #222"}}>
        <button style={{background:"none", border:"none", color:"#c850c0", fontSize:16, cursor:"pointer"}} onClick={() => router.back()}>← Back</button>
        <span style={{color:"#fff", fontSize:17, fontWeight:600}}>Solo Live</span>
      </div>
      <div style={{margin:16, backgroundColor:"#111", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12, border:"0.5px solid #333"}}>
        <div style={{color:"#fff", fontSize:18, fontWeight:600}}>Start your live stream</div>
        <div style={{color:"#888", fontSize:13}}>You broadcast — others watch</div>
        {error && <div style={{color:"#ff4d4d", fontSize:13}}>{error}</div>}
        <input style={{backgroundColor:"#1a1a1a", border:"0.5px solid #333", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:16, outline:"none"}} value={channel} onChange={e => setChannel(e.target.value)} placeholder="Channel name"/>
        <button style={{backgroundColor:"#c850c0", color:"#fff", border:"none", padding:14, borderRadius:12, fontSize:16, fontWeight:600, cursor:"pointer", opacity:joining?0.6:1}} onClick={() => { if(channel.trim()) startSession(channel.trim(),"host"); else setError("Enter a channel name"); }} disabled={joining}>
          {joining ? "Starting…" : "📡 Go Live"}
        </button>
      </div>
      <div style={{display:"flex", alignItems:"center", gap:6, padding:"12px 16px", color:"#fff", fontSize:15, fontWeight:600}}>
        <div style={{width:8, height:8, borderRadius:"50%", backgroundColor:"#c850c0"}}/>Live now
      </div>
      {LIVE_ROOMS.map(room => (
        <div key={room.id} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:"0.5px solid #1a1a1a"}}>
          <div style={{width:44, height:44, borderRadius:"50%", backgroundColor:room.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff"}}>{room.host[0]}</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff", fontSize:14, fontWeight:500, marginBottom:2}}>{room.title}</div>
            <div style={{color:"#888", fontSize:12}}>{room.host} · 👥 {room.viewers.toLocaleString()}</div>
          </div>
          <button style={{backgroundColor:"#1a1a1a", border:"0.5px solid #c850c0", color:"#c850c0", padding:"7px 14px", borderRadius:20, cursor:"pointer", fontSize:13, fontWeight:500}} onClick={() => { setChannel(room.id); startSession(room.id, "viewer"); }}>Watch</button>
        </div>
      ))}
    </div>
  );
}
