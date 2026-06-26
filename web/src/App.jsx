import { useEffect, useState } from "react";
import {
  RTC_DEFAULT_ADMIN_KEY,
  RTC_DEFAULT_SIGNALING_URL,
  createAdminApp,
  createAdminAppKey,
  deleteAdminApp,
  getAdminApp,
  getAdminApps,
  getRtcHealth,
} from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_CLIENT_APP_NAME = "Hapi App";

export default function App() {
  const [apiHealthStatus, setApiHealthStatus] = useState("");
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [rtcConnectionStatus, setRtcConnectionStatus] = useState("idle");
  const [clientApps, setClientApps] = useState([]);
  const [clientKeyStatus, setClientKeyStatus] = useState("");
  const [isClientAppsLoading, setIsClientAppsLoading] = useState(false);
  const [isCreatingClientApp, setIsCreatingClientApp] = useState(false);
  const [newClientAppName, setNewClientAppName] = useState(DEFAULT_CLIENT_APP_NAME);
  const [generatedClientKey, setGeneratedClientKey] = useState(null);
  const [creatingKeyAppId, setCreatingKeyAppId] = useState("");
  const [deletingAppId, setDeletingAppId] = useState("");

  const apiErrorMessage = rtcConnectionStatus === "offline"
    ? apiHealthStatus || clientKeyStatus
    : "";

  useEffect(() => {
    void refreshDashboard();
  }, []);

  async function refreshDashboard() {
    await Promise.allSettled([
      loadApiHealth(),
      loadClientApps(),
    ]);
  }

  async function loadApiHealth() {
    setIsHealthLoading(true);
    setApiHealthStatus("");
    setRtcConnectionStatus("connecting");

    try {
      await getRtcHealth();
      setApiHealthStatus("RTC API is online.");
      setRtcConnectionStatus("online");
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setApiHealthStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setIsHealthLoading(false);
    }
  }

  async function loadClientApps() {
    setIsClientAppsLoading(true);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await getAdminApps({ adminKey: RTC_DEFAULT_ADMIN_KEY });
      const apps = readClientApps(response);
      const appsWithKeys = await Promise.all(
        apps.map(async (app) => {
          const currentAppId = getClientAppId(app);

          if (!currentAppId) {
            return {
              ...app,
              apiKeys: [],
            };
          }

          try {
            const details = await getAdminApp({
              appId: currentAppId,
              adminKey: RTC_DEFAULT_ADMIN_KEY,
            });

            return {
              ...(details.app ?? app),
              apiKeys: readApiKeys(details),
            };
          } catch (event) {
            console.error(getErrorMessage(event));

            return {
              ...app,
              apiKeys: [],
            };
          }
        }),
      );

      setClientApps(appsWithKeys);
      setClientKeyStatus(appsWithKeys.length ? "Credentials refreshed." : "No RTC app credentials created yet.");
      setRtcConnectionStatus("online");
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setClientKeyStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setIsClientAppsLoading(false);
    }
  }

  async function handleCreateClientApp(event) {
    event.preventDefault();

    const name = newClientAppName.trim();

    if (!name) {
      setClientKeyStatus("Project name is required.");
      return;
    }

    setIsCreatingClientApp(true);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await createAdminApp({
        adminKey: RTC_DEFAULT_ADMIN_KEY,
        name,
        environment: "production",
        keyLabel: "Production App Secret",
      });

      setGeneratedClientKey(readGeneratedClientKey(response));
      setClientKeyStatus("App ID, App Key, and App Secret created.");
      setRtcConnectionStatus("online");
      await loadClientApps();
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setGeneratedClientKey(null);
      setClientKeyStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setIsCreatingClientApp(false);
    }
  }

  async function handleCreateClientKey(app) {
    const currentAppId = getClientAppId(app);

    if (!currentAppId) {
      return;
    }

    setCreatingKeyAppId(currentAppId);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await createAdminAppKey({
        adminKey: RTC_DEFAULT_ADMIN_KEY,
        appId: currentAppId,
        label: "Rotated App Secret",
      });

      setGeneratedClientKey(readGeneratedClientKey(response));
      setClientKeyStatus("New App Secret generated.");
      setRtcConnectionStatus("online");
      await loadClientApps();
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setClientKeyStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setCreatingKeyAppId("");
    }
  }

  async function handleDeleteClientApp(app) {
    const currentAppId = getClientAppId(app);
    const appNameToDelete = getClientAppName(app);

    if (!currentAppId || isProtectedClientApp(app)) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${appNameToDelete}"?\n\nThis removes its App Secrets and in-memory RTC state.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingAppId(currentAppId);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      await deleteAdminApp({ appId: currentAppId, adminKey: RTC_DEFAULT_ADMIN_KEY });
      setGeneratedClientKey((key) => (key?.appId === currentAppId ? null : key));
      setClientKeyStatus(`${appNameToDelete} deleted.`);
      setRtcConnectionStatus("online");
      await loadClientApps();
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setClientKeyStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setDeletingAppId("");
    }
  }

  async function copyGeneratedValue(value, label) {
    if (!value) {
      return;
    }

    try {
      await writeClipboardText(value);
      setClientKeyStatus(`${label} copied.`);
    } catch (event) {
      console.error(getErrorMessage(event));
      setClientKeyStatus(`Copy failed. Select the ${label.toLowerCase()} manually.`);
    }
  }

  async function copyGeneratedEnv() {
    if (!generatedClientKey?.secret) {
      return;
    }

    try {
      await writeClipboardText(
        [
          `RTC_API_BASE_URL=${RTC_DEFAULT_SIGNALING_URL}`,
          `RTC_APP_ID=${generatedClientKey.appId}`,
          `RTC_APP_KEY=${generatedClientKey.appKey}`,
          `RTC_APP_SECRET=${generatedClientKey.secret}`,
          `RTC_SERVER_SECRET=${generatedClientKey.secret}`,
          "RTC_TOKEN_ENDPOINT=/client/rtc/token",
        ].join("\n"),
      );
      setClientKeyStatus("Backend env values copied.");
    } catch (event) {
      console.error(getErrorMessage(event));
      setClientKeyStatus("Copy failed. Select the env text manually.");
    }
  }

  return (
    <main className="app-shell">
      <section className="admin-dashboard" aria-label="RTC credentials dashboard">
        <header className="dashboard-header">
          <div>
            <h1>RTC Credentials Dashboard</h1>
            <p>Create the App ID, App Key, and backend-only App Secret required for client SDK integration.</p>
            <dl className="dashboard-endpoints" aria-label="RTC endpoint">
              <div>
                <dt>API base</dt>
                <dd>{RTC_DEFAULT_SIGNALING_URL}</dd>
              </div>
            </dl>
          </div>
          <div className="dashboard-status-row">
            <div className={`connection-indicator ${rtcConnectionStatus}`} role="status" aria-live="polite">
              <span aria-hidden="true" />
              {getConnectionLabel(rtcConnectionStatus)}
            </div>
            <button
              className="secondary-button refresh-all-button"
              type="button"
              onClick={() => refreshDashboard()}
              disabled={isHealthLoading || isClientAppsLoading}
            >
              {isHealthLoading || isClientAppsLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        {apiErrorMessage ? (
          <section className="api-alert" role="status" aria-live="polite">
            <strong>RTC API unavailable</strong>
            <span>{apiErrorMessage}</span>
          </section>
        ) : null}

        <form className="client-app-panel" onSubmit={handleCreateClientApp}>
          <div className="panel-header">
            <div>
              <h2>Create App Credentials</h2>
              <p>Use App ID and App Key in the SDK. Keep App Secret on your backend only.</p>
            </div>
          </div>

          <div className="client-app-form-grid">
            <div className="field-group">
              <label htmlFor="client-app-name">Project name</label>
              <input
                id="client-app-name"
                value={newClientAppName}
                onChange={(event) => setNewClientAppName(event.target.value)}
                autoComplete="off"
                placeholder="Hapi App"
              />
            </div>

          </div>

          <button className="create-client-button" type="submit" disabled={isCreatingClientApp}>
            {isCreatingClientApp ? "Creating" : "Create App ID + App Key + App Secret"}
          </button>
        </form>

        {generatedClientKey?.secret ? (
          <section className="client-secret-panel" aria-label="Generated RTC app credentials">
            <div>
              <h2>Generated App Credentials</h2>
              <p>Save these now. App Secret is shown only when it is generated.</p>
            </div>
            <dl className="credential-result-grid">
              <div>
                <dt>App ID</dt>
                <dd>
                  <code>{generatedClientKey.appId}</code>
                  <button type="button" onClick={() => copyGeneratedValue(generatedClientKey.appId, "App ID")}>
                    Copy
                  </button>
                </dd>
              </div>
              <div>
                <dt>App Key</dt>
                <dd>
                  <code>{generatedClientKey.appKey}</code>
                  <button type="button" onClick={() => copyGeneratedValue(generatedClientKey.appKey, "App Key")}>
                    Copy
                  </button>
                </dd>
              </div>
              <div className="credential-secret-row">
                <dt>App Secret</dt>
                <dd>
                  <code>{generatedClientKey.secret}</code>
                  <button type="button" onClick={() => copyGeneratedValue(generatedClientKey.secret, "App Secret")}>
                    Copy
                  </button>
                </dd>
              </div>
              <div className="credential-api-row">
                <dt>API base</dt>
                <dd>
                  <code>{RTC_DEFAULT_SIGNALING_URL}</code>
                  <button type="button" onClick={() => copyGeneratedValue(RTC_DEFAULT_SIGNALING_URL, "API base")}>
                    Copy
                  </button>
                </dd>
              </div>
            </dl>
            <div className="client-secret-actions">
              <button type="button" className="secondary-button" onClick={copyGeneratedEnv}>
                Copy backend env
              </button>
            </div>
          </section>
        ) : null}

        <section className="client-apps-panel" aria-label="Existing RTC app credentials">
          <div className="panel-header">
            <div>
              <h2>Existing App Credentials</h2>
              <p>Review SDK credentials and rotate backend App Secrets when needed.</p>
            </div>
            <button className="secondary-button" type="button" onClick={loadClientApps} disabled={isClientAppsLoading}>
              {isClientAppsLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <div className="client-apps-table-wrap">
            <table className="client-apps-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>SDK credentials</th>
                  <th>App Secrets</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientApps.length ? (
                  clientApps.map((app) => {
                    const currentAppId = getClientAppId(app);
                    const apiKeys = readApiKeys(app);
                    const clientPlatformId = getClientPackageName(app) || getClientBundleId(app);
                    const protectedClientApp = isProtectedClientApp(app);

                    return (
                      <tr key={currentAppId}>
                        <td>
                          <strong>{getClientAppName(app)}</strong>
                          <span>{getClientEnvironment(app)}</span>
                          {clientPlatformId ? <span>{clientPlatformId}</span> : null}
                        </td>
                        <td>
                          <div className="key-preview-list">
                            <span>App ID: {currentAppId}</span>
                            <span>App Key: {getClientAppKey(app)}</span>
                          </div>
                        </td>
                        <td>
                          {apiKeys.length ? (
                            <div className="key-preview-list">
                              {apiKeys.map((apiKey) => (
                                <span key={getApiKeyId(apiKey)}>
                                  {getApiKeyLabel(apiKey)}: {getApiKeyPreview(apiKey)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "No App Secrets loaded"
                          )}
                        </td>
                        <td>
                          <div className="table-action-stack">
                            <button
                              className="secondary-button table-action-button"
                              type="button"
                              onClick={() => handleCreateClientKey(app)}
                              disabled={creatingKeyAppId === currentAppId}
                            >
                              {creatingKeyAppId === currentAppId ? "Generating" : "Generate Secret"}
                            </button>
                            <button
                              className="danger-button table-action-button"
                              type="button"
                              onClick={() => handleDeleteClientApp(app)}
                              disabled={protectedClientApp || deletingAppId === currentAppId}
                              title={protectedClientApp ? "The default local development app cannot be deleted" : ""}
                            >
                              {deletingAppId === currentAppId ? "Deleting" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="empty-cell" colSpan={4}>
                      No RTC app credentials created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="status-message" role="status" aria-live="polite">
            {clientKeyStatus}
          </p>
        </section>
      </section>
    </main>
  );
}

function readClientApps(response) {
  if (Array.isArray(response?.apps)) {
    return response.apps;
  }

  return [];
}

function readApiKeys(source) {
  if (Array.isArray(source?.apiKeys)) {
    return source.apiKeys;
  }

  if (Array.isArray(source?.api_keys)) {
    return source.api_keys;
  }

  return [];
}

function readGeneratedClientKey(response) {
  const apiKey = typeof response?.api_key === "string" ? { secret: response.api_key } : response?.apiKey;
  const app = response?.app ?? {};
  const appId = getClientAppId(app) || apiKey?.appId || apiKey?.app_id || "";
  const appKey = getClientAppKey(app) || response?.appKey || response?.app_key || "";
  const secret =
    response?.appSecret ??
    response?.app_secret ??
    apiKey?.secret ??
    apiKey?.appSecret ??
    apiKey?.app_secret ??
    apiKey?.serverSecret ??
    apiKey?.server_secret ??
    apiKey?.apiKey ??
    apiKey?.api_key ??
    response?.serverSecret ??
    response?.server_secret ??
    response?.api_key ??
    "";

  return {
    appId,
    appKey,
    appName: getClientAppName(app),
    keyId: apiKey?.id ?? apiKey?.keyId ?? apiKey?.key_id ?? "",
    label: apiKey?.label ?? "App Secret",
    secret,
    preview: apiKey?.keyPreview ?? apiKey?.key_preview ?? makeKeyPreview(secret),
  };
}

function getClientAppId(app) {
  return app?.appId ?? app?.app_id ?? app?.id ?? "";
}

function getClientAppKey(app) {
  return app?.appKey ?? app?.app_key ?? "";
}

function getClientAppName(app) {
  return app?.name ?? "Untitled app";
}

function getClientPackageName(app) {
  return app?.packageName ?? app?.package_name ?? "";
}

function getClientBundleId(app) {
  return app?.bundleId ?? app?.bundle_id ?? "";
}

function getClientEnvironment(app) {
  return app?.environment ?? "development";
}

function isProtectedClientApp(app) {
  return getClientAppId(app) === "local-rtc-client";
}

function getApiKeyId(apiKey) {
  return apiKey?.id ?? apiKey?.keyId ?? apiKey?.key_id ?? getApiKeyPreview(apiKey);
}

function getApiKeyLabel(apiKey) {
  return apiKey?.label ?? "App Secret";
}

function getApiKeyPreview(apiKey) {
  return apiKey?.keyPreview ??
    apiKey?.key_preview ??
    apiKey?.appSecretPreview ??
    apiKey?.app_secret_preview ??
    makeKeyPreview(
      apiKey?.secret ??
        apiKey?.appSecret ??
        apiKey?.app_secret ??
        apiKey?.serverSecret ??
        apiKey?.server_secret ??
        apiKey?.apiKey ??
        apiKey?.api_key ??
        "",
    );
}

function makeKeyPreview(secret) {
  if (!secret) {
    return "secret hidden";
  }

  if (secret.length <= 20) {
    return secret;
  }

  return `${secret.slice(0, 10)}...${secret.slice(-8)}`;
}

function getConnectionLabel(status) {
  if (status === "online") {
    return "RTC API online";
  }

  if (status === "connecting") {
    return "Checking RTC API";
  }

  if (status === "offline") {
    return "RTC API offline";
  }

  return "RTC API idle";
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
