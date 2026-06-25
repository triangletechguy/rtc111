import React, { useState } from "react";
import { useRouter } from "expo-router";

export default function GroupVideoRoomWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("main");
  const [inRoom, setInRoom] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState(["You"]);
  const [error, setError] = useState("");

  const join = () => {
    if (!channel.trim()) {
      setError("Enter a channel name");
      return;
    }

    setError("");
    setJoining(true);
    window.setTimeout(() => {
      setParticipants(["You", "Demo guest"]);
      setInRoom(true);
      setJoining(false);
    }, 250);
  };

  const leave = () => {
    setParticipants(["You"]);
    setInRoom(false);
  };

  if (inRoom) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0a0a0a", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "#111" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: "#c850c0", padding: "4px 10px", borderRadius: 20, color: "#fff", fontSize: 11, fontWeight: 700 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />PREVIEW
          </div>
          <span style={{ color: "#fff", fontSize: 14, flex: 1 }}>#{channel}</span>
          <button style={{ backgroundColor: "#e53935", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontWeight: 600 }} onClick={leave}>End Room</button>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, padding: 16, alignContent: "start" }}>
          {participants.map((name, index) => (
            <div key={name} style={{ aspectRatio: "4 / 3", backgroundColor: index === 0 ? "#1a1a1a" : "#21152a", borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", border: "1px solid #333" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>{index === 0 ? "📹" : "👤"}</div>
                <div style={{ fontWeight: 700 }}>{name}</div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>UI tile</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0a0a0a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "0.5px solid #222" }}>
        <button style={{ background: "none", border: "none", color: "#c850c0", fontSize: 16, cursor: "pointer" }} onClick={() => router.back()}>Back</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Group Video</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: "#f5e6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>👥</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Join a Group Room</div>
        <div style={{ fontSize: 14, color: "#888", textAlign: "center" }}>Preview the group video layout without media services.</div>
        {error && <div style={{ color: "#ff4d4d", fontSize: 14 }}>{error}</div>}
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ color: "#aaa", fontSize: 13 }}>Channel name</label>
          <input style={{ backgroundColor: "#1a1a1a", border: "0.5px solid #333", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 16, outline: "none" }}
            value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="e.g. main"
            onKeyDown={(event) => event.key === "Enter" && join()} />
        </div>
        <button style={{ backgroundColor: "#c850c0", color: "#fff", border: "none", padding: "16px 0", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: 400, opacity: joining ? 0.6 : 1 }}
          onClick={join} disabled={joining}>
          {joining ? "Opening..." : "Open Preview"}
        </button>
      </div>
    </div>
  );
}
