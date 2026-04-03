import { useMemo, useState } from "react";
import {
  amendEntry,
  createClient,
  createEntry,
  deleteEntry,
  fetchTimeline,
  restoreEntry,
  signEntry,
  updateClientProfile
} from "../../api/mindTrackApi.js";
import { AttachmentUploader } from "../../shared/ui/AttachmentUploader.jsx";
import { CustomFieldsRenderer } from "../../shared/ui/CustomFieldsRenderer.jsx";
import { TimelineItem } from "../../shared/ui/TimelineItem.jsx";
import { displayPii, hasPiiViewPermission, maskAddress, maskPhone } from "../../shared/utils/piiUtils.js";

const DEFAULT_FORM = {
  clientId: "",
  entryType: "assessment",
  title: "",
  body: "",
  channel: "in_person",
  tags: "",
  attachments: []
};

const EMPTY_CLIENT_FORM = {
  name: "",
  dob: "",
  phone: "",
  address: "",
  channel: "in_person",
  tags: "",
  customFields: {}
};

function validate(form) {
  const errors = {};
  if (!form.clientId) {
    errors.clientId = "Client is required.";
  }
  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }
  if (!form.body.trim()) {
    errors.body = "Body is required.";
  }
  return errors;
}

export function ClinicianModule({ clients, profileFields, onClientCreated, currentUser }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [message, setMessage] = useState("");
  const [timelineState, setTimelineState] = useState("idle");
  const [amendText, setAmendText] = useState({});
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM);
  const [clientMessage, setClientMessage] = useState("");
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({ phone: "", address: "", tags: "" });
  const [editMessage, setEditMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [entryBusy, setEntryBusy] = useState({});

  const selectedClient = useMemo(
    () => clients.find((client) => client._id === form.clientId),
    [clients, form.clientId]
  );

  async function loadTimeline(clientId) {
    setTimelineState("loading");
    try {
      const data = await fetchTimeline(clientId);
      setTimeline(data);
      setTimelineState(data.length ? "ready" : "empty");
    } catch (error) {
      setTimeline([]);
      setTimelineState("error");
      setMessage(error.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setMessage("");

    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    setBusy(true);
    try {
      await createEntry({
        clientId: form.clientId,
        entryType: form.entryType,
        title: form.title,
        body: form.body,
        channel: form.channel,
        tags: form.tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        attachments: form.attachments,
        reason: "Clinician timeline update"
      });

      setForm((previous) => ({ ...previous, title: "", body: "", tags: "", attachments: [] }));
      await loadTimeline(form.clientId);
      setMessage("Entry saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="role-layout">
      <div className="panel">
        <h2>Clinician Timeline</h2>
        <form onSubmit={submit} className="entry-form">
          <label>
            Client
            <select
              value={form.clientId}
              onChange={async (event) => {
                const clientId = event.target.value;
                setForm((previous) => ({ ...previous, clientId }));
                setEditingClient(null);
                if (clientId) {
                  await loadTimeline(clientId);
                }
              }}
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          {errors.clientId ? <p className="inline-error">{errors.clientId}</p> : null}

          <label>
            Entry Type
            <select
              value={form.entryType}
              onChange={(event) => setForm((previous) => ({ ...previous, entryType: event.target.value }))}
            >
              <option value="assessment">Assessment</option>
              <option value="counseling_note">Counseling note</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </label>

          <label>
            Title
            <input
              value={form.title}
              onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
            />
          </label>
          {errors.title ? <p className="inline-error">{errors.title}</p> : null}

          <label>
            Body
            <textarea
              rows="4"
              value={form.body}
              onChange={(event) => setForm((previous) => ({ ...previous, body: event.target.value }))}
            />
          </label>
          {errors.body ? <p className="inline-error">{errors.body}</p> : null}

          <label>
            Channel
            <select
              value={form.channel}
              onChange={(event) => setForm((previous) => ({ ...previous, channel: event.target.value }))}
            >
              <option value="in_person">In person</option>
              <option value="telehealth">Telehealth</option>
              <option value="phone">Phone</option>
            </select>
          </label>

          <label>
            Tags
            <input
              value={form.tags}
              onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
              placeholder="sleep, anxiety"
            />
          </label>

          <AttachmentUploader
            items={form.attachments}
            onChange={(attachments) => setForm((previous) => ({ ...previous, attachments }))}
          />
          <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save entry"}</button>
        </form>
        {message ? <p className="inline-message">{message}</p> : null}

        <div style={{ marginTop: "1rem", borderTop: "1px solid #d9e3ec", paddingTop: "0.75rem" }}>
          <button type="button" onClick={() => { setShowClientForm(!showClientForm); setClientMessage(""); }}>
            {showClientForm ? "Cancel new client" : "Register new client"}
          </button>
          {showClientForm ? (
            <form
              className="entry-form"
              style={{ marginTop: "0.5rem" }}
              onSubmit={async (event) => {
                event.preventDefault();
                setClientMessage("");
                try {
                  await createClient({
                    ...clientForm,
                    tags: clientForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                    customFields: clientForm.customFields,
                    reason: "Clinician client registration"
                  });
                  setClientForm(EMPTY_CLIENT_FORM);
                  setShowClientForm(false);
                  setClientMessage("Client registered.");
                  if (onClientCreated) {
                    await onClientCreated();
                  }
                } catch (error) {
                  setClientMessage(error.message);
                }
              }}
            >
              <label>Full Name<input value={clientForm.name} onChange={(event) => setClientForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label>Date of Birth<input type="date" value={clientForm.dob} onChange={(event) => setClientForm((prev) => ({ ...prev, dob: event.target.value }))} /></label>
              <label>Phone<input value={clientForm.phone} onChange={(event) => setClientForm((prev) => ({ ...prev, phone: event.target.value }))} /></label>
              <label>Address<input value={clientForm.address} onChange={(event) => setClientForm((prev) => ({ ...prev, address: event.target.value }))} /></label>
              <label>Tags<input value={clientForm.tags} onChange={(event) => setClientForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="anxiety, sleep" /></label>
              <CustomFieldsRenderer
                fields={profileFields?.customProfileFields}
                role="clinician"
                values={clientForm.customFields}
                onChange={(customFields) => setClientForm((prev) => ({ ...prev, customFields }))}
              />
              <button type="submit">Save client</button>
              {clientMessage ? <p className="inline-message">{clientMessage}</p> : null}
            </form>
          ) : null}
          {clientMessage && !showClientForm ? <p className="inline-message">{clientMessage}</p> : null}
        </div>
      </div>

      <div className="panel">
        <h3>
          Timeline {selectedClient ? `for ${selectedClient.name}` : ""}
        </h3>
        {selectedClient && profileFields?.phone ? <p>Phone: {displayPii(selectedClient.phone, hasPiiViewPermission(currentUser), maskPhone)}</p> : null}
        {selectedClient && profileFields?.address ? <p>Address: {displayPii(selectedClient.address, hasPiiViewPermission(currentUser), maskAddress)}</p> : null}
        {selectedClient ? (
          <CustomFieldsRenderer
            fields={profileFields?.customProfileFields}
            role="clinician"
            values={selectedClient.customFields}
            readOnly
          />
        ) : null}
        {selectedClient ? (
          <div style={{ marginBottom: "0.75rem" }}>
            {editingClient === selectedClient._id ? (
              <form
                className="entry-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setEditMessage("");
                  try {
                    const payload = { reason: "Clinician profile update" };
                    if (editForm.phone) {
                      payload.phone = editForm.phone;
                    }
                    if (editForm.address) {
                      payload.address = editForm.address;
                    }
                    if (editForm.tags) {
                      payload.tags = editForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
                    }
                    await updateClientProfile(selectedClient._id, payload);
                    setEditingClient(null);
                    setEditMessage("Profile updated.");
                    if (onClientCreated) {
                      await onClientCreated();
                    }
                  } catch (error) {
                    setEditMessage(error.message);
                  }
                }}
              >
                <label>Phone<input value={editForm.phone} onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))} /></label>
                <label>Address<input value={editForm.address} onChange={(event) => setEditForm((prev) => ({ ...prev, address: event.target.value }))} /></label>
                <label>Tags<input value={editForm.tags} onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))} /></label>
                <button type="submit">Save changes</button>
                <button type="button" onClick={() => setEditingClient(null)}>Cancel</button>
                {editMessage ? <p className="inline-error">{editMessage}</p> : null}
              </form>
            ) : (
              <>
                <button type="button" onClick={() => {
                  setEditingClient(selectedClient._id);
                  setEditForm({ phone: "", address: "", tags: (selectedClient.tags || []).join(", ") });
                  setEditMessage("");
                }}>
                  Edit profile
                </button>
                {editMessage ? <p className="inline-message">{editMessage}</p> : null}
              </>
            )}
          </div>
        ) : null}
        {timelineState === "loading" ? <p>Loading timeline...</p> : null}
        {timelineState === "error" ? <p className="inline-error">Unable to load timeline.</p> : null}
        {timelineState === "empty" ? <p>No timeline entries for this client yet.</p> : null}
        <div className="timeline-list">
          {timeline.map((entry) => (
            <TimelineItem
              key={entry._id}
              entry={entry}
              actions={
                <>
                  <button
                    type="button"
                    disabled={entryBusy[entry._id]}
                    onClick={async () => {
                      setEntryBusy((p) => ({ ...p, [entry._id]: true }));
                      try {
                        await signEntry(entry._id, entry.version, "Clinician sign");
                        await loadTimeline(form.clientId);
                      } catch (error) {
                        setMessage(error.message || "Unable to sign entry.");
                      } finally {
                        setEntryBusy((p) => ({ ...p, [entry._id]: false }));
                      }
                    }}
                  >
                    {entryBusy[entry._id] ? "..." : "Sign"}
                  </button>
                  <input
                    value={amendText[entry._id] || ""}
                    onChange={(event) =>
                      setAmendText((previous) => ({ ...previous, [entry._id]: event.target.value }))
                    }
                    placeholder="Amend text"
                  />
                  <button
                    type="button"
                    disabled={entryBusy[entry._id]}
                    onClick={async () => {
                      setEntryBusy((p) => ({ ...p, [entry._id]: true }));
                      try {
                        const amendment = amendText[entry._id] || entry.body;
                        await amendEntry(entry._id, entry.version, amendment, "Clinician amend");
                        await loadTimeline(form.clientId);
                      } catch (error) {
                        setMessage(error.message || "Unable to amend entry.");
                      } finally {
                        setEntryBusy((p) => ({ ...p, [entry._id]: false }));
                      }
                    }}
                  >
                    Amend
                  </button>
                  {entry.deletedAt ? (
                    <button
                      type="button"
                      disabled={entryBusy[entry._id]}
                      onClick={async () => {
                        setEntryBusy((p) => ({ ...p, [entry._id]: true }));
                        try {
                          await restoreEntry(entry._id, entry.version, "Clinician restore");
                          await loadTimeline(form.clientId);
                        } catch (error) {
                          setMessage(error.message || "Unable to restore entry.");
                        } finally {
                          setEntryBusy((p) => ({ ...p, [entry._id]: false }));
                        }
                      }}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={entryBusy[entry._id]}
                      onClick={async () => {
                        setEntryBusy((p) => ({ ...p, [entry._id]: true }));
                        try {
                          await deleteEntry(entry._id, entry.version, "Clinician soft-delete");
                          await loadTimeline(form.clientId);
                        } catch (error) {
                          setMessage(error.message || "Unable to delete entry.");
                        } finally {
                          setEntryBusy((p) => ({ ...p, [entry._id]: false }));
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </>
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
