import { useMemo, useState } from "react";
import { issueRtcToken } from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Test-rtc";

export default function App() {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [accessToken, setAccessToken] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const appId = useMemo(() => toAppId(appName), [appName]);
  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 28)}...${accessToken.slice(-14)}`
    : "No access token generated";

  async function generateToken(event) {
    event.preventDefault();

    const trimmedAppName = appName.trim();

    if (!trimmedAppName) {
      return;
    }

    setIsGenerating(true);

    try {
      const response = await issueRtcToken({
        externalUserId: appId,
        appName: trimmedAppName,
        role: "publisher",
        rtcMode: "video",
        permissions: ["join", "publish_audio", "publish_video", "chat", "signal"],
      });

      setAccessToken(response.accessToken ?? response.token ?? "");
    } catch (event) {
      console.error(getErrorMessage(event));
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToken() {
    if (!accessToken) {
      return;
    }

    await navigator.clipboard?.writeText(accessToken);
  }

  return (
    <main className="app-shell">
      <section className="admin-dashboard" aria-label="RTC token admin dashboard">
        <form className="token-panel" onSubmit={generateToken}>
          <div className="field-group">
            <label htmlFor="app-name">App name</label>
            <input
              id="app-name"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              autoComplete="off"
              placeholder="Test-rtc"
            />
          </div>

          <button type="submit" disabled={isGenerating}>
            {isGenerating ? "Generating" : "Generate access token"}
          </button>
        </form>

        <div className="token-output" aria-label="Generated access token">
          <div className="token-copy-row">
            <code>{tokenPreview}</code>
            <button type="button" onClick={copyToken} disabled={!accessToken}>
              Copy token
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function toAppId(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "rtc-app";
}

function getErrorMessage(event) {
  return event instanceof Error ? event.message : "Something went wrong";
}
