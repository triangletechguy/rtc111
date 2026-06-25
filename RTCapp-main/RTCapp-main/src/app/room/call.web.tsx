import React, { useState } from "react";
import { useRouter } from "expo-router";

export default function OneToOneCallWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState("");

  const join = () => {
    if (!channel.trim()) {
      setError("Enter a channel name");
      return;
    }

    setJoining(true);
    setError("");
    window.setTimeout(() => {
      setInCall(true);
      setJoining(false);
    }, 250);
  };

  const leave = () => {
    setInCall(false);
    setRemoteJoined(false);
    setMuted(false);
    setVideoOff(false);
  };

  if (inCall) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#000", fontFamily: "sans-serif", position: "relative" }}>
        {remoteJoined ? (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#15151d,#25314d)", color: "#fff" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>👤</div>
              <div style={{ fontWeight: 800 }}>Demo participant</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#888", fontSize: 16 }}>Waiting for other person...</div>
            <div style={{ color: "#666", fontSize: 14 }}>Share channel: <span style={{ color: "#c850c0" }}>#{channel}</span></div>
            <button onClick={() => setRemoteJoined(true)} style={{ marginTop: 12, background: "#242424", color: "#fff", border: "1px solid #444", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>Show demo participant</button>
          </div>
        )}
        {!videoOff && (
          <div style={{ position: "absolute", top: 16, right: 16, width: 160, height: 120, borderRadius: 12, overflow: "hidden", border: "2px solid #333", backgroundColor: "#111", display: "grid", placeItems: "center", color: "#fff", fontSize: 12 }}>
            Local preview
          </div>
        )}
        <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <button onClick={() => setMuted((value) => !value)} style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: muted ? "rgba(200,80,192,0.4)" : "rgba(255,255,255,0.15)", border: "none", fontSize: 22, cursor: "pointer" }}>{muted ? "🔇" : "🎙️"}</button>
          <button onClick={leave} style={{ width: 68, height: 68, borderRadius: "50%", backgroundColor: "#e53935", border: "none", fontSize: 28, cursor: "pointer" }}>📵</button>
          <button onClick={() => setVideoOff((value) => !value)} style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: videoOff ? "rgba(200,80,192,0.4)" : "rgba(255,255,255,0.15)", border: "none", fontSize: 22, cursor: "pointer" }}>{videoOff ? "📷" : "📹"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0a0a0a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "0.5px solid #222" }}>
        <button style={{ background: "none", border: "none", color: "#c850c0", fontSize: 16, cursor: "pointer" }} onClick={() => router.back()}>Back</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>1-to-1 Call</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: "#e6f1fb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>📞</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Private Video Call</div>
        <div style={{ fontSize: 14, color: "#888", textAlign: "center" }}>Preview call controls and video surfaces.</div>
        {error && <div style={{ color: "#ff4d4d", fontSize: 14 }}>{error}</div>}
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ color: "#aaa", fontSize: 13 }}>Channel name</label>
          <input style={{ backgroundColor: "#1a1a1a", border: "0.5px solid #333", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 16, outline: "none" }} value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="e.g. call-john"
            onKeyDown={(event) => event.key === "Enter" && join()} />
        </div>
        <button style={{ backgroundColor: "#4158d0", color: "#fff", border: "none", padding: "16px 0", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: 400, opacity: joining ? 0.6 : 1 }} onClick={join} disabled={joining}>
          {joining ? "Opening..." : "Start Call Preview"}
        </button>
      </div>
    </div>
  );
}
