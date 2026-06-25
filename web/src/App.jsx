import { useMemo, useState } from "react";
import { issueRtcToken } from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Test-rtc";

export default function App() {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [accessToken, setAccessToken] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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
    setStatusMessage("");

    try {
      const response = await issueRtcToken({
        externalUserId: appId,
        appName: trimmedAppName,
        role: "publisher",
        rtcMode: "video",
        permissions: ["join", "publish_audio", "publish_video", "chat", "signal"],
      });

      const nextToken = response.accessToken ?? response.token ?? "";
      setAccessToken(nextToken);
      setStatusMessage(nextToken ? "Token generated." : "No token returned.");
    } catch (event) {
      const message = getErrorMessage(event);
      console.error(message);
      setAccessToken("");
      setStatusMessage(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToken() {
    if (!accessToken) {
      return;
    }

    try {
      await writeClipboardText(accessToken);
      setStatusMessage("Token copied.");
    } catch (event) {
      console.error(getErrorMessage(event));
      setStatusMessage("Copy failed. Select the token text manually.");
    }
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
              {statusMessage === "Token copied." ? "Copied" : "Copy token"}
            </button>
          </div>
          <p className="token-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
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

async function writeClipboardText(value) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const didCopy = document.execCommand("copy");

    if (!didCopy) {
      throw new Error("Clipboard copy was not accepted");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
