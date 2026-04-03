import { useEffect, useState } from "react";
import { createClient, mergeClients, updateClientGovernance } from "../../api/mindTrackApi.js";
import {
  addCustomProfileField,
  deleteCustomProfileField,
  fetchBackupStatus,
  runBackupNow,
  updateCustomProfileField,
  updateProfileFields
} from "../../api/systemApi.js";
import { adminResetPassword, fetchUsers } from "../../api/userApi.js";
import { CustomFieldsRenderer } from "../../shared/ui/CustomFieldsRenderer.jsx";

const EMPTY_FORM = {
  name: "",
  dob: "",
  phone: "",
  address: "",
  primaryClinicianId: "",
  channel: "in_person",
  tags: "",
  customFields: {}
};

export function AdministratorModule({ clients, profileFields, onProfileFieldsUpdated, onClientCreated, currentUser }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const [selectedDuplicate, setSelectedDuplicate] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [legalHold, setLegalHold] = useState(false);
  const [retentionUntil, setRetentionUntil] = useState("");
  const [fieldConfig, setFieldConfig] = useState(
    profileFields || { phone: true, address: true, tags: true, piiPolicyVisible: true }
  );
  const [backupStatus, setBackupStatus] = useState(null);
  const [bootstrapState, setBootstrapState] = useState("loading");
  const [bootstrapError, setBootstrapError] = useState("");
  const [clinicians, setClinicians] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [newField, setNewField] = useState({ key: "", label: "", fieldType: "text", options: "", required: false, visibleTo: "administrator,clinician,client" });
  const [editingFieldKey, setEditingFieldKey] = useState(null);
  const [editFieldForm, setEditFieldForm] = useState({ label: "", required: false, visibleTo: "", options: "" });

  useEffect(() => {
    if (profileFields) {
      setFieldConfig(profileFields);
    }
  }, [profileFields]);

  useEffect(() => {
    (async () => {
      setBootstrapState("loading");
      setBootstrapError("");
      try {
        const data = await fetchBackupStatus();
        setBackupStatus(data);
        const users = await fetchUsers();
        setAllUsers(users);
        setClinicians(users.filter((user) => user.role === "clinician"));
        setBootstrapState("ready");
      } catch (err) {
        setBootstrapError(err.message || "Failed to load administrator data.");
        setBootstrapState("error");
      }
    })();
  }, []);

  if (bootstrapState === "loading") {
    return <section className="panel"><p>Loading administrator data...</p></section>;
  }
  if (bootstrapState === "error") {
    return <section className="panel"><p className="inline-error">{bootstrapError}</p></section>;
  }

  return (
    <section className="role-layout single-column">
      <div className="panel">
        <h2>Administrator Client Management</h2>
        <form
          className="entry-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage("");
            setDuplicateCandidates([]);
            try {
              const data = await createClient({
                ...form,
                tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                customFields: form.customFields,
                reason: "Administrator client registration"
              });
              setForm(EMPTY_FORM);
              setNewClientId(data.client?._id || "");
              setDuplicateCandidates(data.duplicateCandidates || []);
              setMessage("Client saved.");
              await onClientCreated();
            } catch (error) {
              if (error.code === "DUPLICATE_CLIENT") {
                setDuplicateCandidates(error.details || []);
              }
              setMessage(error.message);
            }
          }}
        >
          <label>Full Name<input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} /></label>
          <label>Date of Birth<input type="date" value={form.dob} onChange={(event) => setForm((previous) => ({ ...previous, dob: event.target.value }))} /></label>
          <label>Phone<input value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} /></label>
          <label>Address<input value={form.address} onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} /></label>
          <label>
            Primary Clinician
            <select value={form.primaryClinicianId} onChange={(event) => setForm((previous) => ({ ...previous, primaryClinicianId: event.target.value }))}>
              <option value="">Select clinician</option>
              {clinicians.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
            </select>
          </label>
          <label>
            Channel
            <select value={form.channel} onChange={(event) => setForm((previous) => ({ ...previous, channel: event.target.value }))}>
              <option value="in_person">In person</option>
              <option value="telehealth">Telehealth</option>
              <option value="phone">Phone</option>
            </select>
          </label>
          <label>Tags<input value={form.tags} onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))} /></label>
          <CustomFieldsRenderer
            fields={profileFields?.customProfileFields}
            role="administrator"
            values={form.customFields}
            onChange={(customFields) => setForm((previous) => ({ ...previous, customFields }))}
          />
          <button type="submit">Save client</button>
        </form>
        {message ? <p className="inline-message">{message}</p> : null}

        {duplicateCandidates.length ? (
          <div className="duplicate-box">
            <h3>Merge Oversight</h3>
            {duplicateCandidates.map((candidate) => (
              <label key={candidate.id}>
                <input type="radio" checked={selectedDuplicate === candidate.id} onChange={() => setSelectedDuplicate(candidate.id)} />
                {candidate.name} ({new Date(candidate.dob).toLocaleDateString()}) - score {candidate.score}
              </label>
            ))}
            <button
              type="button"
              disabled={!selectedDuplicate || !newClientId}
              onClick={async () => {
                await mergeClients({
                  primaryClientId: newClientId,
                  duplicateClientId: selectedDuplicate,
                  reason: "Administrator duplicate merge"
                });
                setMessage("Merge request completed with audit trail.");
                await onClientCreated();
              }}
            >
              Merge Selected
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Profile Field Management</h2>
        <h3>Built-in Field Visibility</h3>
        <label><input type="checkbox" checked={fieldConfig.phone} onChange={() => setFieldConfig((previous) => ({ ...previous, phone: !previous.phone }))} /> Show phone field</label>
        <label><input type="checkbox" checked={fieldConfig.address} onChange={() => setFieldConfig((previous) => ({ ...previous, address: !previous.address }))} /> Show address field</label>
        <label><input type="checkbox" checked={fieldConfig.tags} onChange={() => setFieldConfig((previous) => ({ ...previous, tags: !previous.tags }))} /> Show tags field</label>
        <label><input type="checkbox" checked={fieldConfig.piiPolicyVisible} onChange={() => setFieldConfig((previous) => ({ ...previous, piiPolicyVisible: !previous.piiPolicyVisible }))} /> Show PII policy notice</label>
        <button
          type="button"
          onClick={async () => {
            const updated = await updateProfileFields(fieldConfig, "Administrator profile field configuration update");
            onProfileFieldsUpdated(updated);
            setMessage("Profile-field configuration saved.");
          }}
        >
          Save Profile Field Configuration
        </button>
        <p className="hint">PII access itself remains server-enforced; these settings persist the UI field policy configuration used across screens.</p>

        <h3 style={{ marginTop: "1.5rem" }}>Custom Profile Fields</h3>
        {(profileFields?.customProfileFields || []).length ? (
          <table className="custom-fields-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Key</th>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Label</th>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Required</th>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Visible To</th>
                <th style={{ textAlign: "left", padding: "0.25rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(profileFields?.customProfileFields || []).map((field) => (
                <tr key={field.key}>
                  {editingFieldKey === field.key ? (
                    <>
                      <td style={{ padding: "0.25rem" }}>{field.key}</td>
                      <td style={{ padding: "0.25rem" }}><input value={editFieldForm.label} onChange={(e) => setEditFieldForm((p) => ({ ...p, label: e.target.value }))} /></td>
                      <td style={{ padding: "0.25rem" }}>{field.fieldType}</td>
                      <td style={{ padding: "0.25rem" }}><input type="checkbox" checked={editFieldForm.required} onChange={(e) => setEditFieldForm((p) => ({ ...p, required: e.target.checked }))} /></td>
                      <td style={{ padding: "0.25rem" }}><input value={editFieldForm.visibleTo} onChange={(e) => setEditFieldForm((p) => ({ ...p, visibleTo: e.target.value }))} placeholder="administrator,clinician,client" /></td>
                      <td style={{ padding: "0.25rem" }}>
                        <button type="button" onClick={async () => {
                          const updated = await updateCustomProfileField(field.key, {
                            label: editFieldForm.label,
                            required: editFieldForm.required,
                            visibleTo: editFieldForm.visibleTo.split(",").map((s) => s.trim()).filter(Boolean),
                            options: field.fieldType === "select" ? editFieldForm.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined
                          }, "Administrator custom field update");
                          onProfileFieldsUpdated(updated);
                          setEditingFieldKey(null);
                          setMessage("Custom field updated.");
                        }}>Save</button>
                        <button type="button" onClick={() => setEditingFieldKey(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: "0.25rem" }}>{field.key}</td>
                      <td style={{ padding: "0.25rem" }}>{field.label}</td>
                      <td style={{ padding: "0.25rem" }}>{field.fieldType}</td>
                      <td style={{ padding: "0.25rem" }}>{field.required ? "Yes" : "No"}</td>
                      <td style={{ padding: "0.25rem" }}>{(field.visibleTo || []).join(", ")}</td>
                      <td style={{ padding: "0.25rem" }}>
                        <button type="button" onClick={() => {
                          setEditingFieldKey(field.key);
                          setEditFieldForm({
                            label: field.label,
                            required: field.required,
                            visibleTo: (field.visibleTo || []).join(", "),
                            options: (field.options || []).join(", ")
                          });
                        }}>Edit</button>
                        <button type="button" onClick={async () => {
                          const updated = await deleteCustomProfileField(field.key, "Administrator custom field removal");
                          onProfileFieldsUpdated(updated);
                          setMessage(`Custom field "${field.key}" removed.`);
                        }}>Remove</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No custom profile fields defined yet.</p>
        )}

        <h4>Add Custom Field</h4>
        <form className="entry-form" onSubmit={async (event) => {
          event.preventDefault();
          try {
            const updated = await addCustomProfileField({
              key: newField.key,
              label: newField.label,
              fieldType: newField.fieldType,
              options: newField.fieldType === "select" ? newField.options.split(",").map((s) => s.trim()).filter(Boolean) : [],
              required: newField.required,
              visibleTo: newField.visibleTo.split(",").map((s) => s.trim()).filter(Boolean)
            }, "Administrator custom field creation");
            onProfileFieldsUpdated(updated);
            setNewField({ key: "", label: "", fieldType: "text", options: "", required: false, visibleTo: "administrator,clinician,client" });
            setMessage("Custom field added.");
          } catch (error) {
            setMessage(error.message);
          }
        }}>
          <label>Key<input value={newField.key} onChange={(e) => setNewField((p) => ({ ...p, key: e.target.value }))} placeholder="e.g. emergency_contact" /></label>
          <label>Label<input value={newField.label} onChange={(e) => setNewField((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. Emergency Contact" /></label>
          <label>Type
            <select value={newField.fieldType} onChange={(e) => setNewField((p) => ({ ...p, fieldType: e.target.value }))}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Boolean</option>
              <option value="select">Select</option>
            </select>
          </label>
          {newField.fieldType === "select" ? (
            <label>Options (comma-separated)<input value={newField.options} onChange={(e) => setNewField((p) => ({ ...p, options: e.target.value }))} placeholder="option1, option2" /></label>
          ) : null}
          <label><input type="checkbox" checked={newField.required} onChange={(e) => setNewField((p) => ({ ...p, required: e.target.checked }))} /> Required</label>
          <label>Visible To (comma-separated roles)<input value={newField.visibleTo} onChange={(e) => setNewField((p) => ({ ...p, visibleTo: e.target.value }))} /></label>
          <button type="submit">Add Custom Field</button>
        </form>
      </div>

      <div className="panel">
        <h2>Governance Controls</h2>
        <label>
          Client
          <select
            value={selectedClientId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedClientId(nextId);
              const selected = clients.find((client) => client._id === nextId);
              setLegalHold(Boolean(selected?.legalHold));
              setRetentionUntil(selected?.retentionUntil ? new Date(selected.retentionUntil).toISOString().slice(0, 10) : "");
            }}
          >
            <option value="">Select client</option>
            {clients.map((client) => <option key={client._id} value={client._id}>{client.name}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={legalHold} onChange={(event) => setLegalHold(event.target.checked)} /> Legal hold</label>
        <label>Retention until<input type="date" value={retentionUntil} onChange={(event) => setRetentionUntil(event.target.value)} /></label>
        <button
          type="button"
          disabled={!selectedClientId}
          onClick={async () => {
            await updateClientGovernance(selectedClientId, {
              legalHold,
              retentionUntil,
              reason: "Administrator governance update"
            });
            setMessage("Governance controls updated.");
            await onClientCreated();
          }}
        >
          Save Governance Controls
        </button>
      </div>

      <div className="panel">
        <h2>User Password Reset</h2>
        <form className="entry-form" onSubmit={async (event) => {
          event.preventDefault();
          setResetMessage("");
          if (!resetUserId || !resetPassword) {
            setResetMessage("Select a user and enter a new password.");
            return;
          }
          try {
            await adminResetPassword(resetUserId, resetPassword, "Administrator-initiated password reset");
            setResetPassword("");
            setResetMessage("Password reset successfully.");
          } catch (error) {
            setResetMessage(error.message);
          }
        }}>
          <label>
            User
            <select value={resetUserId} onChange={(event) => setResetUserId(event.target.value)}>
              <option value="">Select user</option>
              {allUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.username} ({user.role})</option>
              ))}
            </select>
          </label>
          <label>
            New Password
            <input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Min 12 chars, 1 letter, 1 number" />
          </label>
          <button type="submit">Reset Password</button>
          {resetMessage ? <p className="inline-message">{resetMessage}</p> : null}
        </form>
      </div>

      <div className="panel">
        <h2>Backups</h2>
        {backupStatus ? (
          <>
            <p>Schedule: {backupStatus.schedule}</p>
            <p>Destination: {backupStatus.destination}</p>
            <p>Retention: {backupStatus.retentionDays} days</p>
            <p>Last run: {backupStatus.lastRunAt || "never"}</p>
            <button
              type="button"
              onClick={async () => {
                const result = await runBackupNow("Administrator backup execution");
                setMessage(`Backup completed at ${result.lastRunAt}`);
                const next = await fetchBackupStatus();
                setBackupStatus(next);
              }}
            >
              Run Backup Now
            </button>
          </>
        ) : (
          <p>Loading backup status...</p>
        )}
      </div>
    </section>
  );
}
