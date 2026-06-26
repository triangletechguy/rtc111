import { useEffect, useMemo, useState } from "react";
import {
  createAdminApp,
  createAdminAppKey,
  deleteAdminApp,
  getAdminApp,
  getAdminApps,
  getAdminBilling,
  issueRtcToken,
} from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Test-rtc";
const DEFAULT_CLIENT_APP_NAME = "Hapi App";
const DEFAULT_CLIENT_PACKAGE_NAME = "com.example.hapi";

export default function App() {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [accessToken, setAccessToken] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [billingRows, setBillingRows] = useState([]);
  const [billingGeneratedAt, setBillingGeneratedAt] = useState("");
  const [billingRate, setBillingRate] = useState(0);
  const [billingStatus, setBillingStatus] = useState("");
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [rtcConnectionStatus, setRtcConnectionStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("token");
  const [clientApps, setClientApps] = useState([]);
  const [clientKeyStatus, setClientKeyStatus] = useState("");
  const [isClientAppsLoading, setIsClientAppsLoading] = useState(false);
  const [isCreatingClientApp, setIsCreatingClientApp] = useState(false);
  const [newClientAppName, setNewClientAppName] = useState(DEFAULT_CLIENT_APP_NAME);
  const [newClientPackageName, setNewClientPackageName] = useState(DEFAULT_CLIENT_PACKAGE_NAME);
  const [newClientAllowedOrigins, setNewClientAllowedOrigins] = useState("");
  const [newClientKeyLabel, setNewClientKeyLabel] = useState("Production backend key");
  const [generatedClientKey, setGeneratedClientKey] = useState(null);
  const [keyLabelsByApp, setKeyLabelsByApp] = useState({});
  const [creatingKeyAppId, setCreatingKeyAppId] = useState("");
  const [deletingAppId, setDeletingAppId] = useState("");

  const appId = useMemo(() => toAppId(appName), [appName]);
  const billingTotals = useMemo(() => getBillingTotals(billingRows), [billingRows]);
  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 28)}...${accessToken.slice(-14)}`
    : "No access token generated";

  useEffect(() => {
    void loadBilling();
    void loadClientApps();
  }, []);

  async function loadBilling() {
    setIsBillingLoading(true);
    setBillingStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await getAdminBilling();
      const rows = readBillingRows(response);

      setBillingRows(rows);
      setBillingGeneratedAt(response.generatedAt ?? response.generated_at ?? new Date().toISOString());
      setBillingRate(readNumber(response.ratePerMinute ?? response.rate_per_minute));
      setBillingStatus(rows.length ? "Billing refreshed." : "No company usage recorded yet.");
      setRtcConnectionStatus("online");
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setBillingStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setIsBillingLoading(false);
    }
  }

  async function generateToken(event) {
    event.preventDefault();

    const trimmedAppName = appName.trim();

    if (!trimmedAppName) {
      return;
    }

    setIsGenerating(true);
    setStatusMessage("");
    setRtcConnectionStatus("connecting");

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
      setRtcConnectionStatus("online");
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setAccessToken("");
      setStatusMessage(message);
      setRtcConnectionStatus("offline");
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

  async function loadClientApps() {
    setIsClientAppsLoading(true);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await getAdminApps();
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
            const details = await getAdminApp({ appId: currentAppId });

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
      setClientKeyStatus(appsWithKeys.length ? "Client apps refreshed." : "No client apps created yet.");
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
      setClientKeyStatus("Client app name is required.");
      return;
    }

    setIsCreatingClientApp(true);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      const response = await createAdminApp({
        name,
        packageName: newClientPackageName.trim(),
        allowedOrigins: parseAllowedOrigins(newClientAllowedOrigins),
        keyLabel: newClientKeyLabel.trim() || "Production backend key",
      });

      setGeneratedClientKey(readGeneratedClientKey(response));
      setClientKeyStatus("Client app and backend key created.");
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
        appId: currentAppId,
        label: keyLabelsByApp[currentAppId]?.trim() || "Rotated backend key",
      });

      setGeneratedClientKey(readGeneratedClientKey(response));
      setClientKeyStatus("New backend key generated.");
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
      `Delete "${appNameToDelete}"?\n\nThis removes its client API keys and in-memory RTC state.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingAppId(currentAppId);
    setClientKeyStatus("");
    setRtcConnectionStatus("connecting");

    try {
      await deleteAdminApp({ appId: currentAppId });
      setGeneratedClientKey((key) => (key?.appId === currentAppId ? null : key));
      setKeyLabelsByApp((labels) => {
        const nextLabels = { ...labels };
        delete nextLabels[currentAppId];
        return nextLabels;
      });
      setClientKeyStatus(`${appNameToDelete} deleted.`);
      setRtcConnectionStatus("online");
      await loadClientApps();
      await loadBilling();
    } catch (event) {
      const message = getErrorMessage(event);

      console.error(message);
      setClientKeyStatus(message);
      setRtcConnectionStatus("offline");
    } finally {
      setDeletingAppId("");
    }
  }

  async function copyGeneratedClientKey() {
    if (!generatedClientKey?.secret) {
      return;
    }

    try {
      await writeClipboardText(generatedClientKey.secret);
      setClientKeyStatus("Client API key copied.");
    } catch (event) {
      console.error(getErrorMessage(event));
      setClientKeyStatus("Copy failed. Select the key text manually.");
    }
  }

  async function copyGeneratedEnv() {
    if (!generatedClientKey?.secret) {
      return;
    }

    try {
      await writeClipboardText(
        `RTC_API_BASE_URL=https://funint.online\nRTC_CLIENT_API_KEY=${generatedClientKey.secret}`,
      );
      setClientKeyStatus("Backend env values copied.");
    } catch (event) {
      console.error(getErrorMessage(event));
      setClientKeyStatus("Copy failed. Select the env text manually.");
    }
  }

  return (
    <main className="app-shell">
      <section className="admin-dashboard" aria-label="RTC admin panel">
        <header className="dashboard-header">
          <div>
            <h1>RTC Admin Panel</h1>
            <p>Company usage billing is calculated from used RTC minutes. Payment gateway is disabled.</p>
          </div>
          <div className={`connection-indicator ${rtcConnectionStatus}`} role="status" aria-live="polite">
            <span aria-hidden="true" />
            {getConnectionLabel(rtcConnectionStatus)}
          </div>
        </header>

        <div className="admin-tabs" role="tablist" aria-label="Admin sections">
          <button
            id="token-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "token"}
            aria-controls="token-panel"
            className={activeTab === "token" ? "active" : ""}
            onClick={() => setActiveTab("token")}
          >
            Token
          </button>
          <button
            id="client-keys-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "client-keys"}
            aria-controls="client-keys-panel"
            className={activeTab === "client-keys" ? "active" : ""}
            onClick={() => setActiveTab("client-keys")}
          >
            Client Keys
          </button>
          <button
            id="package-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === "package"}
            aria-controls="package-panel"
            className={activeTab === "package" ? "active" : ""}
            onClick={() => setActiveTab("package")}
          >
            Package
          </button>
        </div>

        <section
          id="token-panel"
          className="tab-panel token-stack"
          role="tabpanel"
          aria-labelledby="token-tab"
          hidden={activeTab !== "token"}
        >
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

        <section
          id="client-keys-panel"
          className="tab-panel client-keys-stack"
          role="tabpanel"
          aria-labelledby="client-keys-tab"
          hidden={activeTab !== "client-keys"}
        >
          <form className="client-app-panel" onSubmit={handleCreateClientApp}>
            <div className="panel-header">
              <div>
                <h2>Client App Keys</h2>
                <p>Create the backend API key a client needs before their server can issue RTC access tokens.</p>
              </div>
              <button className="secondary-button" type="button" onClick={loadClientApps} disabled={isClientAppsLoading}>
                {isClientAppsLoading ? "Refreshing" : "Refresh"}
              </button>
            </div>

            <div className="client-app-form-grid">
              <div className="field-group">
                <label htmlFor="client-app-name">Client app name</label>
                <input
                  id="client-app-name"
                  value={newClientAppName}
                  onChange={(event) => setNewClientAppName(event.target.value)}
                  autoComplete="off"
                  placeholder="Hapi App"
                />
              </div>

              <div className="field-group">
                <label htmlFor="client-package-name">Android package</label>
                <input
                  id="client-package-name"
                  value={newClientPackageName}
                  onChange={(event) => setNewClientPackageName(event.target.value)}
                  autoComplete="off"
                  placeholder="com.example.hapi"
                />
              </div>

              <div className="field-group">
                <label htmlFor="client-key-label">Key label</label>
                <input
                  id="client-key-label"
                  value={newClientKeyLabel}
                  onChange={(event) => setNewClientKeyLabel(event.target.value)}
                  autoComplete="off"
                  placeholder="Production backend key"
                />
              </div>

              <div className="field-group">
                <label htmlFor="client-allowed-origins">Allowed origins</label>
                <input
                  id="client-allowed-origins"
                  value={newClientAllowedOrigins}
                  onChange={(event) => setNewClientAllowedOrigins(event.target.value)}
                  autoComplete="off"
                  placeholder="https://client.example"
                />
              </div>
            </div>

            <button className="create-client-button" type="submit" disabled={isCreatingClientApp}>
              {isCreatingClientApp ? "Creating" : "Create client app and key"}
            </button>
          </form>

          {generatedClientKey?.secret ? (
            <section className="client-secret-panel" aria-label="Generated client API key">
              <div>
                <h3>New client API key</h3>
                <p>Give this value to the client backend only. It is shown here from the creation response.</p>
              </div>
              <code>{generatedClientKey.secret}</code>
              <div className="client-env-box">
                <code>RTC_API_BASE_URL=https://funint.online</code>
                <code>RTC_CLIENT_API_KEY={generatedClientKey.secret}</code>
              </div>
              <div className="client-secret-actions">
                <button type="button" onClick={copyGeneratedClientKey}>
                  Copy key
                </button>
                <button type="button" className="secondary-button" onClick={copyGeneratedEnv}>
                  Copy env
                </button>
              </div>
            </section>
          ) : null}

          <section className="client-apps-panel" aria-label="Client apps">
            <div className="client-apps-table-wrap">
              <table className="client-apps-table">
                <thead>
                  <tr>
                    <th>Client app</th>
                    <th>Package</th>
                    <th>Keys</th>
                    <th>New key label</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientApps.length ? (
                    clientApps.map((app) => {
                      const currentAppId = getClientAppId(app);
                      const apiKeys = readApiKeys(app);
                      const protectedClientApp = isProtectedClientApp(app);

                      return (
                        <tr key={currentAppId}>
                          <td>
                            <strong>{getClientAppName(app)}</strong>
                            <span>{currentAppId}</span>
                          </td>
                          <td>{getClientPackageName(app) || "Not set"}</td>
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
                              "No keys loaded"
                            )}
                          </td>
                          <td>
                            <input
                              className="inline-input"
                              value={keyLabelsByApp[currentAppId] ?? ""}
                              onChange={(event) =>
                                setKeyLabelsByApp((labels) => ({
                                  ...labels,
                                  [currentAppId]: event.target.value,
                                }))
                              }
                              placeholder="Rotated backend key"
                            />
                          </td>
                          <td>
                            <div className="table-action-stack">
                              <button
                                className="secondary-button table-action-button"
                                type="button"
                                onClick={() => handleCreateClientKey(app)}
                                disabled={creatingKeyAppId === currentAppId}
                              >
                                {creatingKeyAppId === currentAppId ? "Generating" : "Generate key"}
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
                      <td className="empty-cell" colSpan={5}>
                        No client apps created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="billing-status" role="status" aria-live="polite">
              {clientKeyStatus}
            </p>
          </section>
        </section>

        <section
          id="package-panel"
          className="tab-panel package-stack"
          role="tabpanel"
          aria-labelledby="package-tab"
          hidden={activeTab !== "package"}
        >
          <section className="usage-summary" aria-label="Usage summary">
            <dl>
              <div>
                <dt>Used minutes</dt>
                <dd>{formatMinutes(billingTotals.usedMinutes)}</dd>
              </div>
              <div>
                <dt>Billable minutes</dt>
                <dd>{formatNumber(billingTotals.billableMinutes)}</dd>
              </div>
              <div>
                <dt>Estimated bill</dt>
                <dd>{formatCurrency(billingTotals.estimatedAmount)}</dd>
              </div>
            </dl>
          </section>

          <section className="billing-panel" aria-label="Company billing">
            <div className="panel-header">
              <div>
                <h2>Company Minute Billing</h2>
                <p>
                  Rate: {formatCurrency(billingRate)} per minute. No payment gateway is connected.
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={loadBilling} disabled={isBillingLoading}>
                {isBillingLoading ? "Refreshing" : "Refresh"}
              </button>
            </div>

            <div className="billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Used min</th>
                    <th>Billable min</th>
                    <th>Active</th>
                    <th>Sessions</th>
                    <th>Est. bill</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRows.length ? (
                    billingRows.map((row) => (
                      <tr key={row.appId ?? row.app_id}>
                        <td>
                          <strong>{row.companyName ?? row.company_name}</strong>
                          <span>{row.appId ?? row.app_id}</span>
                        </td>
                        <td>{formatMinutes(readNumber(row.usedMinutes ?? row.used_minutes))}</td>
                        <td>{formatNumber(readNumber(row.billableMinutes ?? row.billable_minutes))}</td>
                        <td>{formatNumber(readNumber(row.activeSessions ?? row.active_sessions))}</td>
                        <td>{formatNumber(readNumber(row.totalSessions ?? row.total_sessions))}</td>
                        <td>{formatCurrency(readNumber(row.estimatedAmount ?? row.estimated_amount))}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-cell" colSpan={6}>
                        No RTC usage recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="billing-status" role="status" aria-live="polite">
              {billingStatus || formatGeneratedAt(billingGeneratedAt)}
            </p>
          </section>
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

function getBillingTotals(rows) {
  return rows.reduce(
    (totals, row) => ({
      usedMinutes: totals.usedMinutes + readNumber(row.usedMinutes ?? row.used_minutes),
      billableMinutes: totals.billableMinutes + readNumber(row.billableMinutes ?? row.billable_minutes),
      estimatedAmount: totals.estimatedAmount + readNumber(row.estimatedAmount ?? row.estimated_amount),
    }),
    {
      usedMinutes: 0,
      billableMinutes: 0,
      estimatedAmount: 0,
    },
  );
}

function readBillingRows(response) {
  if (Array.isArray(response?.billing)) {
    return response.billing;
  }

  if (Array.isArray(response?.companies)) {
    return response.companies;
  }

  return [];
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
  const secret = apiKey?.secret ?? apiKey?.apiKey ?? apiKey?.api_key ?? response?.api_key ?? "";

  return {
    appId,
    appName: getClientAppName(app),
    keyId: apiKey?.id ?? apiKey?.keyId ?? apiKey?.key_id ?? "",
    label: apiKey?.label ?? "Backend API key",
    secret,
    preview: apiKey?.keyPreview ?? apiKey?.key_preview ?? makeKeyPreview(secret),
  };
}

function getClientAppId(app) {
  return app?.appId ?? app?.app_id ?? app?.id ?? "";
}

function getClientAppName(app) {
  return app?.name ?? "Untitled client app";
}

function getClientPackageName(app) {
  return app?.packageName ?? app?.package_name ?? "";
}

function isProtectedClientApp(app) {
  return getClientAppId(app) === "local-rtc-client";
}

function getApiKeyId(apiKey) {
  return apiKey?.id ?? apiKey?.keyId ?? apiKey?.key_id ?? getApiKeyPreview(apiKey);
}

function getApiKeyLabel(apiKey) {
  return apiKey?.label ?? "API key";
}

function getApiKeyPreview(apiKey) {
  return apiKey?.keyPreview ?? apiKey?.key_preview ?? makeKeyPreview(apiKey?.secret ?? apiKey?.apiKey ?? apiKey?.api_key ?? "");
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

function parseAllowedOrigins(value) {
  return value
    .split(/[\n,]+/g)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function readNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
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

function formatGeneratedAt(value) {
  if (!value) {
    return "";
  }

  return `Last refreshed ${new Date(value).toLocaleString()}.`;
}

function formatMinutes(value) {
  return `${formatNumber(value)} min`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(readNumber(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(readNumber(value));
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
