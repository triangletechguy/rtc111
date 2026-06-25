import { useEffect, useMemo, useState } from "react";
import { getAdminBilling, issueRtcToken } from "./sdk/rtcServiceSdk";
import "./App.css";

const DEFAULT_APP_NAME = "Test-rtc";

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

  const appId = useMemo(() => toAppId(appName), [appName]);
  const billingTotals = useMemo(() => getBillingTotals(billingRows), [billingRows]);
  const tokenPreview = accessToken
    ? `${accessToken.slice(0, 28)}...${accessToken.slice(-14)}`
    : "No access token generated";

  useEffect(() => {
    void loadBilling();
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

        <div className="dashboard-grid">
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
        </div>

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
