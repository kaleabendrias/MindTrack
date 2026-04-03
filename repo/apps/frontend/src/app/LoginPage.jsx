import { useState } from "react";
import { recoverPassword } from "../api/authApi.js";
import { validatePassword } from "../shared/utils/passwordPolicy.js";

export function LoginPage({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recovery, setRecovery] = useState({ username: "", question: "", answer: "", newPassword: "" });
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");

  return (
    <div className="login-shell">
      {!showRecovery ? (
        <form
          className="login-card"
          onSubmit={async (event) => {
            event.preventDefault();
            await onLogin(username, password);
            setPassword("");
          }}
        >
          <h2>MindTrack Sign In</h2>
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" />
          <button type="submit">Sign In</button>
          {error ? <p className="inline-error">{error}</p> : null}

          <div style={{ marginTop: "1rem", borderTop: "1px solid #d9e3ec", paddingTop: "0.75rem" }}>
            <button type="button" onClick={() => setShowRecovery(true)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Forgot password? Recover with security question
            </button>
          </div>

          <div style={{ marginTop: "1rem", borderTop: "1px solid #d9e3ec", paddingTop: "0.75rem" }}>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.5rem" }}>Third-party login</p>
            <button type="button" disabled style={{ opacity: 0.4, cursor: "not-allowed", marginRight: "0.5rem" }} title="Third-party login is disabled in offline mode">
              Sign in with Google
            </button>
            <button type="button" disabled style={{ opacity: 0.4, cursor: "not-allowed", marginRight: "0.5rem" }} title="Third-party login is disabled in offline mode">
              Sign in with Microsoft
            </button>
            <button type="button" disabled style={{ opacity: 0.4, cursor: "not-allowed" }} title="Third-party login is disabled in offline mode">
              Sign in with SAML SSO
            </button>
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>Unavailable in offline/on-prem mode</p>
          </div>
        </form>
      ) : (
        <form
          className="login-card"
          onSubmit={async (event) => {
            event.preventDefault();
            setRecoveryMessage("");
            setRecoveryError("");
            const policyError = validatePassword(recovery.newPassword);
            if (policyError) {
              setRecoveryError(policyError);
              return;
            }
            try {
              await recoverPassword(recovery);
              setRecoveryMessage("Password reset successfully. You can now sign in.");
              setRecovery({ username: "", question: "", answer: "", newPassword: "" });
            } catch (err) {
              setRecoveryError(err.message);
            }
          }}
        >
          <h2>Password Recovery</h2>
          <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>Answer your security question to reset your password.</p>
          <input value={recovery.username} onChange={(e) => setRecovery((p) => ({ ...p, username: e.target.value }))} placeholder="username" />
          <input value={recovery.question} onChange={(e) => setRecovery((p) => ({ ...p, question: e.target.value }))} placeholder="Security question" />
          <input value={recovery.answer} onChange={(e) => setRecovery((p) => ({ ...p, answer: e.target.value }))} placeholder="Your answer" />
          <input type="password" value={recovery.newPassword} onChange={(e) => setRecovery((p) => ({ ...p, newPassword: e.target.value }))} placeholder="New password (min 12 chars, 1 letter, 1 number)" />
          <button type="submit">Reset Password</button>
          {recoveryMessage ? <p className="inline-message">{recoveryMessage}</p> : null}
          {recoveryError ? <p className="inline-error">{recoveryError}</p> : null}
          <button type="button" onClick={() => { setShowRecovery(false); setRecoveryError(""); setRecoveryMessage(""); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: "0.5rem" }}>
            Back to sign in
          </button>
        </form>
      )}
    </div>
  );
}
