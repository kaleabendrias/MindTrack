import { useState } from "react";
import { fetchSecurityQuestions, recoverPassword } from "../api/authApi.js";
import { validatePassword } from "../shared/utils/passwordPolicy.js";

export function LoginPage({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState("");
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [questionsFetched, setQuestionsFetched] = useState(false);

  async function loadQuestions() {
    setRecoveryError("");
    setQuestionsFetched(false);
    if (!recoveryUsername.trim()) {
      setRecoveryError("Enter your username first.");
      return;
    }
    try {
      const data = await fetchSecurityQuestions(recoveryUsername.trim());
      setQuestions(data);
      setSelectedQuestion(data.length ? data[0].question : "");
      setQuestionsFetched(true);
    } catch (err) {
      setRecoveryError(err.message);
    }
  }

  function resetRecoveryState() {
    setShowRecovery(false);
    setRecoveryUsername("");
    setQuestions([]);
    setSelectedQuestion("");
    setRecoveryAnswer("");
    setNewPassword("");
    setRecoveryMessage("");
    setRecoveryError("");
    setQuestionsFetched(false);
  }

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
            const policyError = validatePassword(newPassword);
            if (policyError) {
              setRecoveryError(policyError);
              return;
            }
            try {
              await recoverPassword({
                username: recoveryUsername,
                question: selectedQuestion,
                answer: recoveryAnswer,
                newPassword
              });
              setRecoveryMessage("Password reset successfully. You can now sign in.");
              setRecoveryAnswer("");
              setNewPassword("");
            } catch (err) {
              setRecoveryError(err.message);
            }
          }}
        >
          <h2>Password Recovery</h2>
          <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>Enter your username to retrieve your security question.</p>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <input
              value={recoveryUsername}
              onChange={(e) => { setRecoveryUsername(e.target.value); setQuestionsFetched(false); }}
              placeholder="username"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={loadQuestions}>Look up</button>
          </div>

          {questionsFetched && questions.length > 0 ? (
            <>
              <label style={{ marginTop: "0.75rem", display: "block" }}>
                Security question
                {questions.length === 1 ? (
                  <p style={{ fontWeight: "bold", margin: "0.25rem 0" }}>{questions[0].question}</p>
                ) : (
                  <select value={selectedQuestion} onChange={(e) => setSelectedQuestion(e.target.value)}>
                    {questions.map((q) => (
                      <option key={q.question} value={q.question}>{q.question}</option>
                    ))}
                  </select>
                )}
              </label>
              <input
                type="password"
                value={recoveryAnswer}
                onChange={(e) => setRecoveryAnswer(e.target.value)}
                placeholder="Your answer (masked)"
                autoComplete="off"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 12 chars, 1 letter, 1 number)"
              />
              <button type="submit">Reset Password</button>
            </>
          ) : null}

          {questionsFetched && questions.length === 0 ? (
            <p className="inline-error">No security questions found for this user.</p>
          ) : null}

          {recoveryMessage ? <p className="inline-message">{recoveryMessage}</p> : null}
          {recoveryError ? <p className="inline-error">{recoveryError}</p> : null}
          <button type="button" onClick={resetRecoveryState} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: "0.5rem" }}>
            Back to sign in
          </button>
        </form>
      )}
    </div>
  );
}
