import { useEffect, useMemo, useState } from "react";
import {
  RTC_DEFAULT_ADMIN_KEY,
  RTC_DEFAULT_SIGNALING_URL,
  createAdminApp,
  getAdminApp,
  getAdminApps,
  getRtcHealth,
  issueRtcToken,
} from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Android Voice App";
const DEFAULT_PACKAGE_NAME = "com.example.app";
const DEFAULT_ROOM_ID = "test-room";
const DEFAULT_USER_ID = "test-user";

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isIssuingToken, setIsIssuingToken] = useState(false);
  const [apps, setApps] = useState([]);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [tokenResult, setTokenResult] = useState(null);
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [packageName, setPackageName] = useState(DEFAULT_PACKAGE_NAME);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [rtcMode, setRtcMode] = useState("voice");

  const androidEnv = useMemo(() => {
    if (!createdCredentials) return "";

    return [
      `RTC_SIGNALING_URL=${RTC_DEFAULT_SIGNALING_URL}`,
      `RTC_APP_ID=${createdCredentials.appId}`,
      `RTC_APP_KEY=${createdCredentials.appKey}`,
    ].join("\n");
  }, [createdCredentials]);

  const backendEnv = useMemo(() => {
    if (!createdCredentials) return "";

    return [
      `RTC_API_BASE_URL=${RTC_DEFAULT_SIGNALING_URL}`,
      `RTC_APP_ID=${createdCredentials.appId}`,
      `RTC_APP_KEY=${createdCredentials.appKey}`,
      `RTC_SERVER_SECRET=${createdCredentials.serverSecret}`,
      "RTC_TOKEN_ENDPOINT=/client/rtc/token",
    ].join("\n");
  }, [createdCredentials]);

  useEffect(() => {
    void refreshDashboard();
  }, []);

  async function refreshDashboard() {
    setIsRefreshing(true);
    setStatusMessage("");
    setConnectionStatus("connecting");

    try {
      await getRtcHealth();
      const response = await getAdminApps({ adminKey: RTC_DEFAULT_ADMIN_KEY });
      const appList = readApps(response);
      const appsWithDetails = await Promise.all(
        appList.map(async (app) => {
          const appId = getAppId(app);

          if (!appId) return app;

          try {
            const details = await getAdminApp({ appId, adminKey: RTC_DEFAULT_ADMIN_KEY });
            return details.app ?? app;
          } catch {
            return app;
          }
        }),
      );

      setApps(appsWithDetails);
      setConnectionStatus("online");
      setStatusMessage("Dashboard ready.");
    } catch (error) {
      setConnectionStatus("offline");
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateApp(event) {
    event.preventDefault();

    const name = appName.trim();
    const packageId = packageName.trim();

    if (!name) {
      setStatusMessage("App name is required.");
      return;
    }

    setIsCreating(true);
    setCreatedCredentials(null);
    setTokenResult(null);
    setStatusMessage("");
    setConnectionStatus("connecting");

    try {
      const response = await createAdminApp({
        adminKey: RTC_DEFAULT_ADMIN_KEY,
        name,
        packageName: packageId || undefined,
        environment: "production",
        platforms: ["android"],
        keyLabel: "Production Server Secret",
      });
      const credentials = readCredentials(response);

      setCreatedCredentials(credentials);
      setConnectionStatus("online");
      setStatusMessage("App created. Save the Server Secret now.");
      await refreshDashboard();
    } catch (error) {
      setConnectionStatus("offline");
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleIssueToken(event) {
    event.preventDefault();

    if (!createdCredentials?.serverSecret) {
      setStatusMessage("Create an app first so the dashboard has a Server Secret.");
      return;
    }

    const trimmedRoomId = roomId.trim();
    const trimmedUserId = userId.trim();

    if (!trimmedRoomId || !trimmedUserId) {
      setStatusMessage("Room ID and user ID are required.");
      return;
    }

    setIsIssuingToken(true);
    setTokenResult(null);
    setStatusMessage("");
    setConnectionStatus("connecting");

    try {
      const response = await issueRtcToken({
        apiKey: createdCredentials.serverSecret,
        appId: createdCredentials.appId,
        appKey: createdCredentials.appKey,
        externalUserId: trimmedUserId,
        roomId: trimmedRoomId,
        rtcMode,
      });

      setTokenResult(readTokenResult(response));
      setConnectionStatus("online");
      setStatusMessage("Fresh RTC token generated.");
    } catch (error) {
      setConnectionStatus("offline");
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsIssuingToken(false);
    }
  }

  async function copyValue(value, label) {
    if (!value) return;

    try {
      await writeClipboardText(value);
      setStatusMessage(`${label} copied.`);
    } catch {
      setStatusMessage(`Copy failed. Select the ${label.toLowerCase()} manually.`);
    }
  }

  return (
    <main className="app-shell">
      <section className="dashboard" aria-label="RTC admin dashboard">
        <header className="dashboard-header">
          <div>
            <h1>RTC Admin Dashboard</h1>
            <p>Create one app, copy its SDK credentials, then generate a fresh room token from the Server Secret.</p>
            <div className="api-base">API base: <code>{RTC_DEFAULT_SIGNALING_URL}</code></div>
          </div>
          <div className="header-actions">
            <div className={`connection-indicator ${connectionStatus}`} role="status" aria-live="polite">
              <span aria-hidden="true" />
              {getConnectionLabel(connectionStatus)}
            </div>
            <button className="secondary-button compact-button" type="button" onClick={refreshDashboard} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        <section className="flow-grid" aria-label="RTC app setup flow">
          <StepCard number="1" title="Create App">
            <form className="stacked-form" onSubmit={handleCreateApp}>
              <label>
                <span>App name</span>
                <input value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="Android Voice App" />
              </label>
              <label>
                <span>Android package</span>
                <input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="com.example.app" />
              </label>
              <button type="submit" disabled={isCreating}>
                {isCreating ? "Creating" : "Create App Credentials"}
              </button>
            </form>
          </StepCard>

          <StepCard number="2" title="Use Credentials">
            {createdCredentials ? (
              <div className="credential-stack">
                <Credential label="App ID" value={createdCredentials.appId} onCopy={copyValue} />
                <Credential label="App Key" value={createdCredentials.appKey} onCopy={copyValue} />
                <Credential label="Server Secret" value={createdCredentials.serverSecret} onCopy={copyValue} secret />
                <div className="copy-row">
                  <button type="button" className="secondary-button" onClick={() => copyValue(androidEnv, "Android env")}>
                    Copy Android values
                  </button>
                  <button type="button" className="secondary-button" onClick={() => copyValue(backendEnv, "Backend env")}>
                    Copy backend values
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">Create an app to show App ID, App Key, and Server Secret here.</div>
            )}
          </StepCard>

          <StepCard number="3" title="Generate Test Token">
            <form className="stacked-form" onSubmit={handleIssueToken}>
              <label>
                <span>Room ID</span>
                <input value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="test-room" />
              </label>
              <label>
                <span>User ID</span>
                <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="test-user" />
              </label>
              <label>
                <span>RTC mode</span>
                <select value={rtcMode} onChange={(event) => setRtcMode(event.target.value)}>
                  <option value="voice">Voice room</option>
                  <option value="video">Video room</option>
                </select>
              </label>
              <button type="submit" disabled={isIssuingToken || !createdCredentials?.serverSecret}>
                {isIssuingToken ? "Generating" : "Generate Token"}
              </button>
            </form>
            {tokenResult?.token ? (
              <div className="token-result">
                <Credential label="RTC Token" value={tokenResult.token} onCopy={copyValue} secret />
                <p>Use this token only for testing. Your app backend should generate a new token for every room join.</p>
              </div>
            ) : null}
          </StepCard>
        </section>

        <section className="existing-apps" aria-label="Existing RTC apps">
          <div className="section-heading">
            <h2>Existing Apps</h2>
            <p>Server Secrets are shown only when created. Create a new app if you need a fresh visible secret.</p>
          </div>
          <div className="app-list">
            {apps.length ? apps.map((app) => (
              <article className="app-row" key={getAppId(app)}>
                <div>
                  <strong>{getAppName(app)}</strong>
                  <span>{getPackageName(app) || "No package set"}</span>
                </div>
                <code>{getAppId(app)}</code>
                <code>{getAppKey(app)}</code>
              </article>
            )) : (
              <div className="empty-state">No apps created yet.</div>
            )}
          </div>
        </section>

        <p className="status-message" role="status" aria-live="polite">{statusMessage}</p>
      </section>
    </main>
  );
}

function StepCard({ number, title, children }) {
  return (
    <section className="step-card">
      <div className="step-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Credential({ label, value, onCopy, secret = false }) {
  return (
    <div className={secret ? "credential secret" : "credential"}>
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button type="button" onClick={() => onCopy(value, label)}>Copy</button>
      </dd>
    </div>
  );
}

function readApps(response) {
  return Array.isArray(response?.apps) ? response.apps : [];
}

function readCredentials(response) {
  const apiKey = typeof response?.api_key === "string" ? { secret: response.api_key } : response?.apiKey;
  const app = response?.app ?? {};
  const serverSecret =
    response?.serverSecret ??
    response?.server_secret ??
    response?.appSecret ??
    response?.app_secret ??
    response?.api_key ??
    apiKey?.secret ??
    apiKey?.serverSecret ??
    apiKey?.server_secret ??
    apiKey?.appSecret ??
    apiKey?.app_secret ??
    apiKey?.apiKey ??
    apiKey?.api_key ??
    "";

  return {
    appId: getAppId(app) || apiKey?.appId || apiKey?.app_id || "",
    appKey: getAppKey(app) || response?.appKey || response?.app_key || "",
    serverSecret,
  };
}

function readTokenResult(response) {
  return {
    token: response?.token ?? response?.accessToken ?? response?.access_token ?? "",
    expiresAt: response?.expiresAt ?? response?.expires_at ?? "",
  };
}

function getAppId(app) {
  return app?.appId ?? app?.app_id ?? app?.id ?? "";
}

function getAppKey(app) {
  return app?.appKey ?? app?.app_key ?? "";
}

function getAppName(app) {
  return app?.name ?? "Untitled app";
}

function getPackageName(app) {
  return app?.packageName ?? app?.package_name ?? "";
}

function getConnectionLabel(status) {
  if (status === "online") return "API online";
  if (status === "connecting") return "Checking";
  if (status === "offline") return "API offline";
  return "Idle";
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong";
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
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}
