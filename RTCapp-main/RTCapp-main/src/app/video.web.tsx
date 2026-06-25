import React, { useState } from "react";

const DEFAULT_CHANNEL = "main";

export default function VideoWeb() {
  const [channel, setChannel] = useState(DEFAULT_CHANNEL);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  if (joined) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#111" }}>
          <span style={{ background: "#208AEF", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 800 }}>PREVIEW</span>
          <span style={{ flex: 1, fontSize: 14 }}>#{channel}</span>
          <button onClick={() => setJoined(false)} style={{ background: "#e53935", color: "#fff", border: "none", borderRadius: 999, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
            End
          </button>
        </div>
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ width: "min(720px, 100%)", aspectRatio: "16 / 9", borderRadius: 18, background: "linear-gradient(135deg,#121212,#242a36)", border: "1px solid #333", display: "grid", placeItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>{cameraOn ? "📹" : "📷"}</div>
              <div style={{ color: "#d8d8d8", fontSize: 18, fontWeight: 700 }}>Video preview surface</div>
              <div style={{ color: "#888", marginTop: 6 }}>Controls are UI-only in this build.</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "18px 16px", background: "#111" }}>
          <button onClick={() => setMuted((value) => !value)} style={controlStyle}>{muted ? "Unmute" : "Mute"}</button>
          <button onClick={() => setCameraOn((value) => !value)} style={controlStyle}>{cameraOn ? "Camera Off" : "Camera On"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#f4f7fb", minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ width: "min(520px, 100%)", background: "#fff", border: "1px solid #d8e0ea", borderRadius: 14, padding: 24, boxShadow: "0 18px 45px rgba(15,23,42,0.12)" }}>
        <h1 style={{ margin: "0 0 8px", color: "#152033" }}>Web Video Chat</h1>
        <p style={{ margin: "0 0 20px", color: "#607086" }}>UI preview with local controls only.</p>
        <label style={{ color: "#344256", fontSize: 13, fontWeight: 700 }}>Channel</label>
        <input value={channel} onChange={(event) => setChannel(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 6, marginBottom: 16, border: "1px solid #c9d3df", borderRadius: 10, padding: "12px 14px", fontSize: 16 }} />
        <button onClick={() => setJoined(true)} disabled={!channel.trim()} style={{ width: "100%", border: "none", borderRadius: 10, padding: "14px 16px", background: "#208AEF", color: "#fff", fontSize: 16, fontWeight: 800, cursor: channel.trim() ? "pointer" : "not-allowed", opacity: channel.trim() ? 1 : 0.55 }}>
          Open Preview
        </button>
      </div>
    </div>
  );
}

const controlStyle = {
  background: "#242424",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "12px 18px",
  fontWeight: 700,
  cursor: "pointer",
};
