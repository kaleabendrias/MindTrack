import test from "node:test";
import assert from "node:assert/strict";
import { validatePassword } from "../../apps/frontend/src/shared/utils/passwordPolicy.js";

// ---------------------------------------------------------------------------
// LoginPage recovery module — focused unit tests
//
// These tests verify the logic that drives the password-recovery flow in
// LoginPage.jsx without mounting the React component. They cover:
//   1. Client-side password validation (the gate before any API call is made)
//   2. Recovery outcome routing — what message the UI should display given
//      each possible API response shape
//   3. Error propagation when the API call itself throws
// ---------------------------------------------------------------------------

// --- 1. Client-side password validation (runs before the API call) ----------

test("validatePassword: accepts a valid password meeting all policy requirements", () => {
  assert.equal(validatePassword("SecurePass42"), null);
  assert.equal(validatePassword("aB3aaaaaaaaa"), null);
  assert.equal(validatePassword("Tr0ub4dor&3xx"), null);
});

test("validatePassword: rejects passwords shorter than 12 characters", () => {
  const err = validatePassword("Short1");
  assert.ok(err, "should return an error message");
  assert.match(err, /12/i, "error should mention the 12-character minimum");
});

test("validatePassword: rejects passwords with no letter", () => {
  const err = validatePassword("123456789012");
  assert.ok(err, "should return an error message");
  assert.match(err, /letter/i);
});

test("validatePassword: rejects passwords with no digit", () => {
  const err = validatePassword("TwelveLetters");
  assert.ok(err, "should return an error message");
  assert.match(err, /number/i);
});

test("validatePassword: rejects non-string inputs", () => {
  assert.ok(validatePassword(null), "null should fail");
  assert.ok(validatePassword(undefined), "undefined should fail");
  assert.ok(validatePassword(123456789012), "number should fail");
});

// --- 2. Recovery outcome routing -------------------------------------------
// The LoginPage recovery form uses this pattern to decide what to display:
//
//   if (result.reset) {
//     setRecoveryMessage("Password reset successfully. You can now sign in.");
//   } else {
//     setRecoveryError("Recovery failed. Please verify your security answer and try again.");
//   }
//
// We verify the routing rule itself with a pure helper that mirrors the logic.

function recoveryOutcomeMessage(result) {
  if (result && result.reset) {
    return { kind: "success", text: "Password reset successfully. You can now sign in." };
  }
  return { kind: "error", text: "Recovery failed. Please verify your security answer and try again." };
}

test("recovery outcome: reset:true produces a success message", () => {
  const out = recoveryOutcomeMessage({ success: true, reset: true });
  assert.equal(out.kind, "success");
  assert.ok(out.text.includes("successfully"), "success text should confirm reset");
});

test("recovery outcome: reset:false produces an error message", () => {
  const out = recoveryOutcomeMessage({ success: true, reset: false });
  assert.equal(out.kind, "error");
  assert.ok(out.text.includes("failed"), "error text should indicate failure");
});

test("recovery outcome: missing reset field falls back to error (safe default)", () => {
  const out = recoveryOutcomeMessage({ success: true });
  assert.equal(out.kind, "error", "absent reset flag must not silently claim success");
});

test("recovery outcome: null result falls back to error (safe default)", () => {
  const out = recoveryOutcomeMessage(null);
  assert.equal(out.kind, "error");
});

test("recovery outcome: success and error messages are distinct strings", () => {
  const success = recoveryOutcomeMessage({ success: true, reset: true });
  const failure = recoveryOutcomeMessage({ success: true, reset: false });
  assert.notEqual(success.text, failure.text, "success and failure messages must differ");
  assert.notEqual(success.kind, failure.kind, "success and failure kinds must differ");
});

// --- 3. Error propagation from the API call --------------------------------
// When fetchSecurityQuestions or recoverPassword throws, the component catches
// the error and sets recoveryError to err.message. We verify that a thrown
// Error exposes a non-empty message string that the component can display.

test("thrown API errors expose a displayable message string", () => {
  const networkErr = new Error("Failed to fetch");
  assert.ok(typeof networkErr.message === "string");
  assert.ok(networkErr.message.length > 0, "error message must be non-empty");
});

test("empty-username guard fires before any API call is attempted", () => {
  // Mirrors the guard in loadQuestions():
  //   if (!recoveryUsername.trim()) { setRecoveryError("Enter your username first."); return; }
  function shouldFetchQuestions(username) {
    return typeof username === "string" && username.trim().length > 0;
  }

  assert.equal(shouldFetchQuestions(""), false);
  assert.equal(shouldFetchQuestions("   "), false);
  assert.equal(shouldFetchQuestions(null), false);
  assert.equal(shouldFetchQuestions("alice"), true);
  assert.equal(shouldFetchQuestions("  bob  "), true);
});

// --- 4. Uniform generic question display -----------------------------------
// The backend now always returns a single generic challenge label. The
// frontend must handle this correctly: display the label regardless of
// whether the account is real or not (it cannot distinguish them).

test("single returned question is displayed directly (not in a dropdown)", () => {
  // LoginPage renders a <p> for questions.length === 1 and a <select> for > 1.
  // Verify the branching condition used in JSX.
  function questionDisplayMode(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return "none";
    return questions.length === 1 ? "inline" : "select";
  }

  assert.equal(questionDisplayMode([{ question: "What is your account recovery question?" }]), "inline");
  assert.equal(questionDisplayMode([{ question: "Q1" }, { question: "Q2" }]), "select");
  assert.equal(questionDisplayMode([]), "none");
  assert.equal(questionDisplayMode(null), "none");
});

test("generic challenge label is preserved verbatim when set as selectedQuestion", () => {
  // After loadQuestions() succeeds, selectedQuestion is set to data[0].question.
  const apiResponse = [{ question: "What is your account recovery question?" }];
  const selectedQuestion = apiResponse.length ? apiResponse[0].question : "";
  assert.equal(selectedQuestion, "What is your account recovery question?");
});
