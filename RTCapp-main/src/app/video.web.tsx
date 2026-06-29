import { useEffect } from "react";

const AGORA_APP_ID = "a2547ce438e34f269a2a2f956cebb68a";
const AGORA_CHANNEL = "main";

export default function VideoWeb() {
  useEffect(() => {
    document.title = "Video Chat";
    document.body.innerHTML = `
      <div id="root2" style="background:#0a0a0a;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:sans-serif;">
        <h1 style="color:#fff;margin:0">🌐 Web Video Chat</h1>
        <p style="color:#888;margin:0">Channel: ${AGORA_CHANNEL}</p>
        <p id="error" style="color:#ff4d4d;display:none"></p>
        <div id="videos" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center"></div>
        <button id="joinBtn" style="background:#208AEF;color:#fff;border:none;padding:16px 48px;border-radius:12px;font-size:18px;cursor:pointer">Join Call</button>
      </div>
    `;

    const script = document.createElement("script");
    script.src = "https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js";
    script.onload = () => {
      const AgoraRTC = (window as any).AgoraRTC;
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      document.getElementById("joinBtn")!.onclick = async () => {
        try {
          document.getElementById("joinBtn")!.textContent = "Joining...";

          client.on("user-published", async (user: any, mediaType: any) => {
            await client.subscribe(user, mediaType);
            if (mediaType === "video") {
              const div = document.createElement("div");
              div.id = `remote-${user.uid}`;
              div.style.cssText = "width:320px;height:240px;background:#1a1a1a;border-radius:12px;overflow:hidden";
              document.getElementById("videos")!.appendChild(div);
              user.videoTrack.play(`remote-${user.uid}`);
            }
            if (mediaType === "audio") user.audioTrack.play();
          });

          client.on("user-unpublished", (user: any) => {
            document.getElementById(`remote-${user.uid}`)?.remove();
          });

          await client.join("${AGORA_APP_ID}", "${AGORA_CHANNEL}", null, null);
          const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
          await client.publish([audioTrack, videoTrack]);

          const localDiv = document.createElement("div");
          localDiv.id = "local";
          localDiv.style.cssText = "width:320px;height:240px;background:#1a1a1a;border-radius:12px;overflow:hidden";
          document.getElementById("videos")!.appendChild(localDiv);
          videoTrack.play("local");

          const btn = document.getElementById("joinBtn")!;
          btn.textContent = "End Call";
          btn.style.background = "#e53935";
          btn.onclick = async () => {
            videoTrack.close();
            audioTrack.close();
            await client.leave();
            window.location.reload();
          };
        } catch (e: any) {
          const err = document.getElementById("error")!;
          err.style.display = "block";
          err.textContent = e.message;
          document.getElementById("joinBtn")!.textContent = "Join Call";
        }
      };
    };
    document.head.appendChild(script);
  }, []);

  return null;
}