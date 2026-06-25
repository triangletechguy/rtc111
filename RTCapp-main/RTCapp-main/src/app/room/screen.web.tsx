import React, { useState } from "react";
import { useRouter } from "expo-router";

export default function ScreenShareWeb() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [role, setRole] = useState<"sharer" | "viewer">("sharer");
  const [inSession, setInSession] = useState(false);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  const join = () => {
    if (!channel.trim()) {
      setError("Enter a channel name");
      return;
    }

    setError("");
    setJoining(true);
    window.setTimeout(() => {
      setInSession(true);
      setSharing(role === "sharer");
      setJoining(false);
    }, 250);
  };

  const leave = () => {
    setInSession(false);
    setSharing(false);
  };

  if (inSession) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#000", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "#111" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: sharing ? "#4caf50" : "#534ab7", padding: "4px 10px", borderRadius: 20, color: "#fff", fontSize: 11, fontWeight: 700 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />{sharing ? "SHARING" : "WATCHING"}
          </div>
          <span style={{ color: "#fff", fontSize: 14, flex: 1 }}>#{channel}</span>
          <button style={{ backgroundColor: "#e53935", color: "#fff", border: "none", padding: "6px 16px", borderRadius: 20, cursor: "pointer", fontWeight: 600 }} onClick={leave}>Leave</button>
        </div>
        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "min(960px, calc(100% - 32px))", aspectRatio: "16 / 9", borderRadius: 16, backgroundColor: "#111", border: "1px solid #333", display: "grid", placeItems: "center", color: "#aaa" }}>
            {sharing ? "Your screen preview" : "Waiting for shared screen preview..."}
          </div>
          {role === "sharer" && (
            <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
              <button style={{ padding: "14px 28px", borderRadius: 28, border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", backgroundColor: sharing ? "#e53935" : "#534ab7" }}
                onClick={() => setSharing((value) => !value)}>
                {sharing ? "Stop Sharing" : "Share Screen"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0a0a0a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "0.5px solid #222" }}>
        <button style={{ background: "none", border: "none", color: "#534ab7", fontSize: 16, cursor: "pointer" }} onClick={() => router.back()}>Back</button>
        <span style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Screen Share</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: "#eeedfe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🖥️</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>Screen Share</div>
        <div style={{ fontSize: 14, color: "#888", textAlign: "center" }}>Preview sharing or watching a screen.</div>
        {error && <div style={{ color: "#ff4d4d", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 400 }}>
          <button onClick={() => setRole("sharer")} style={{ flex: 1, padding: 12, borderRadius: 10, border: role === "sharer" ? "0.5px solid #534ab7" : "0.5px solid #333", backgroundColor: role === "sharer" ? "#1a1530" : "#111", color: role === "sharer" ? "#a89cf7" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Share my screen</button>
          <button onClick={() => setRole("viewer")} style={{ flex: 1, padding: 12, borderRadius: 10, border: role === "viewer" ? "0.5px solid #534ab7" : "0.5px solid #333", backgroundColor: role === "viewer" ? "#1a1530" : "#111", color: role === "viewer" ? "#a89cf7" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Watch a screen</button>
        </div>
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ color: "#aaa", fontSize: 13 }}>Channel name</label>
          <input style={{ backgroundColor: "#1a1a1a", border: "0.5px solid #333", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 16, outline: "none" }} value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="e.g. my-screen" />
        </div>
        <button style={{ backgroundColor: "#534ab7", color: "#fff", border: "none", padding: "16px 0", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: 400, opacity: joining ? 0.6 : 1 }} onClick={join} disabled={joining}>
          {joining ? "Opening..." : role === "sharer" ? "Start Session" : "Watch Session"}
        </button>
      </div>
    </div>
  );
}
