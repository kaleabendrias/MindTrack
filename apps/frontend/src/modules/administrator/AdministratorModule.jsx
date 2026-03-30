import { useEffect, useState } from "react";
import { createClient, mergeClients, updateClientGovernance } from "../../api/mindTrackApi.js";
import {
  fetchBackupStatus,
  runBackupNow,
  updateProfileFields
} from "../../api/systemApi.js";
import { fetchUsers } from "../../api/userApi.js";

const EMPTY_FORM = {
  name: "",
  dob: "",
  phone: "",
  address: "",
  primaryClinicianId: "",
  channel: "in_person",
  tags: ""
};

export function AdministratorModule({ clients, profileFields, onProfileFieldsUpdated, onClientCreated }) {
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
  const [clinicians, setClinicians] = useState([]);

  useEffect(() => {
    if (profileFields) {
      setFieldConfig(profileFields);
    }
  }, [profileFields]);

  useEffect(() => {
    (async () => {
      const data = await fetchBackupStatus();
      setBackupStatus(data);
      const users = await fetchUsers();
      setClinicians(users.filter((user) => user.role === "clinician"));
    })();
  }, []);

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
