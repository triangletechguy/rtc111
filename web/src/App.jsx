import { useMemo, useState } from "react";
import { RTC_DEFAULT_SIGNALING_URL, issueRtcToken } from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Test-rtc";

export default function App() {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [accessToken, setAccessToken] = useState("");
  const [tokenDetails, setTokenDetails] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const appId = useMemo(() => toAppId(appName), [appName]);
  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 28)}...${accessToken.slice(-14)}`
    : "No access token generated";

  async function generateToken(event) {
    event.preventDefault();

    const trimmedAppName = appName.trim();

    if (!trimmedAppName) {
      setError("App name is required");
      return;
    }

    setError("");
    setIsGenerating(true);
    setStatus("Generating");

    try {
      const response = await issueRtcToken({
        externalUserId: appId,
        appName: trimmedAppName,
        role: "publisher",
        rtcMode: "video",
        permissions: ["join", "publish_audio", "publish_video", "chat", "signal"],
      });

      setAccessToken(response.accessToken ?? response.token ?? "");
      setTokenDetails({
        appName: trimmedAppName,
        appId: response.externalUserId ?? response.userId ?? appId,
        tokenId: response.tokenId ?? response.token_id ?? "",
        expiresAt: response.expiresAt ?? response.expires_at ?? "",
      });
      setStatus("Token generated");
    } catch (event) {
      setStatus("Failed");
      setError(getErrorMessage(event));
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToken() {
    if (!accessToken) {
      return;
    }

    await navigator.clipboard?.writeText(accessToken);
    setStatus("Token copied");
  }

  return (
    <main className="app-shell">
      <section className="admin-dashboard" aria-label="RTC token admin dashboard">
        <header className="dashboard-header">
          <div>
            <p className="brand">RTC Platform</p>
            <h1>Admin Dashboard</h1>
          </div>
          <div className={accessToken ? "status ready" : "status"}>
            <span aria-hidden="true" />
            {status}
          </div>
        </header>

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

        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}

        <section className="token-output" aria-label="Generated access token">
          <div className="token-copy-row">
            <code>{tokenPreview}</code>
            <button type="button" onClick={copyToken} disabled={!accessToken}>
              Copy token
            </button>
          </div>

          {tokenDetails ? (
            <dl className="token-meta">
              <div>
                <dt>App</dt>
                <dd>{tokenDetails.appName}</dd>
              </div>
              <div>
                <dt>App ID</dt>
                <dd>{tokenDetails.appId}</dd>
              </div>
              <div>
                <dt>Token ID</dt>
                <dd>{tokenDetails.tokenId}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{formatDate(tokenDetails.expiresAt)}</dd>
              </div>
            </dl>
          ) : null}

          <div className="endpoint-row">
            <span>API</span>
            <code>{RTC_DEFAULT_SIGNALING_URL}</code>
          </div>
        </section>
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

function formatDate(value) {
  if (!value) {
    return "1 hour";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(event) {
  return event instanceof Error ? event.message : "Something went wrong";
}
