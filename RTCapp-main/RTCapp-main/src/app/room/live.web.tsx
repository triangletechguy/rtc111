import React, { useState } from "react";
import { useRouter } from "expo-router";

const LIVE_ROOMS = [
  { id: "ch_music", host: "MelodyV", title: "Live covers - request songs!", viewers: 3205, color: "#9c27b0" },
  { id: "ch_chat", host: "MissJay", title: "Chill chat room, come hang!", viewers: 1240, color: "#c850c0" },
  { id: "ch_study", host: "StudyBro", title: "Study with me - lo-fi session", viewers: 412, color: "#4158d0" },
];

export default function SoloLiveWeb() {
  const router = useRouter();
  const [mode, setMode] = useState<"lobby" | "host" | "viewer">("lobby");
  const [channel, setChannel] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const startSession = (nextChannel: string, nextMode: "host" | "viewer") => {
    if (!nextChannel.trim()) {
      setError("Enter a channel name");
      return;
    }

    setJoining(true);
    setError("");
    window.setTimeout(() => {
      setChannel(nextChannel.trim());
      setMode(nextMode);
      setJoining(false);
    }, 250);
  };

  const leave = () => {
    setMode("lobby");
    setJoining(false);
  };

  if (mode === "host") {
    return (
      <LiveShell channel={channel} actionLabel="End Live" onLeave={leave}>
        <div style={{ flex: 1, minHeight: "calc(100vh - 56px)", display: "grid", placeItems: "center", color: "#fff", background: "radial-gradient(circle at 50% 30%,#2a1838,#000 65%)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 58, marginBottom: 12 }}>📡</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Host preview</div>
            <div style={{ color: "#888", marginTop: 6 }}>Broadcast controls are visual only.</div>
          </div>
        </div>
      </LiveShell>
    );
  }

  if (mode === "viewer") {
    return (
      <LiveShell channel={channel} actionLabel="Leave" onLeave={leave}>
        <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#888", fontSize: 16 }}>
          Waiting for host preview...
        </div>
      </LiveShell>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#0a0a0a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "0.5px solid #222" }}>
        <button style={{ background: "none", border: "none", color: "#c850c0", fontSize: 16, cursor: "pointer" }} onClick={() => router.back()}>Back</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Solo Live</span>
      </div>
      <div style={{ margin: 16, backgroundColor: "#111", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12, border: "0.5px solid #333" }}>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Start your live stream</div>
        <div style={{ color: "#888", fontSize: 13 }}>UI preview for hosting and watching</div>
        {error && <div style={{ color: "#ff4d4d", fontSize: 13 }}>{error}</div>}
        <input style={{ backgroundColor: "#1a1a1a", border: "0.5px solid #333", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 16, outline: "none" }} value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="Channel name" />
        <button style={{ backgroundColor: "#c850c0", color: "#fff", border: "none", padding: 14, borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: joining ? 0.6 : 1 }} onClick={() => startSession(channel, "host")} disabled={joining}>
          {joining ? "Opening..." : "Go Live Preview"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", color: "#fff", fontSize: 15, fontWeight: 600 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#c850c0" }} />Live now
      </div>
      {LIVE_ROOMS.map((room) => (
        <div key={room.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "0.5px solid #1a1a1a" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: room.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff" }}>{room.host[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{room.title}</div>
            <div style={{ color: "#888", fontSize: 12 }}>{room.host} - {room.viewers.toLocaleString()} viewers</div>
          </div>
          <button style={{ backgroundColor: "#1a1a1a", border: "0.5px solid #c850c0", color: "#c850c0", padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 500 }} onClick={() => startSession(room.id, "viewer")}>Watch</button>
        </div>
      ))}
    </div>
  );
}

function LiveShell({
  channel,
  actionLabel,
  onLeave,
  children,
}: {
  channel: string;
  actionLabel: string;
  onLeave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#000", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "#111" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: "#c850c0", padding: "4px 10px", borderRadius: 20, color: "#fff", fontSize: 11, fontWeight: 700 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />LIVE
        </div>
        <span style={{ color: "#fff", fontSize: 14, flex: 1 }}>#{channel}</span>
        <button style={{ backgroundColor: "#e53935", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontWeight: 600 }} onClick={onLeave}>{actionLabel}</button>
      </div>
      {children}
    </div>
  );
}
