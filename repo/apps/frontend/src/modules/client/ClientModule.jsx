import { useMemo, useState } from "react";
import { createEntry, fetchNearbyFacilities } from "../../api/mindTrackApi.js";
import { CustomFieldsRenderer } from "../../shared/ui/CustomFieldsRenderer.jsx";
import { TimelineItem } from "../../shared/ui/TimelineItem.jsx";
import { displayPii, hasPiiViewPermission, maskAddress, maskPhone } from "../../shared/utils/piiUtils.js";

export function ClientModule({ selfContext, onRefresh, profileFields, currentUser }) {
  const [radius, setRadius] = useState(25);
  const [nearby, setNearby] = useState([]);
  const [nearbyView, setNearbyView] = useState("list");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [assessment, setAssessment] = useState({ title: "", body: "", tags: "" });

  const validationErrors = useMemo(() => {
    const errors = {};
    if (!assessment.title.trim()) {
      errors.title = "Assessment title is required.";
    }
    if (!assessment.body.trim()) {
      errors.body = "Assessment response is required.";
    }
    return errors;
  }, [assessment]);

  if (!selfContext) {
    return <section className="panel"><p>Loading your care context...</p></section>;
  }

  const { client, upcomingFollowUp, timeline: rawTimeline } = selfContext;
  const timeline = rawTimeline.filter(
    (entry) => entry.entryType === "assessment" || entry.entryType === "follow_up"
  );

  return (
    <section className="role-layout">
      <div className="panel">
        <h2>My Care Plan</h2>
        <p><strong>Name:</strong> {client.name}</p>
        {profileFields?.phone ? <p><strong>Phone:</strong> {displayPii(client.phone, hasPiiViewPermission(currentUser), maskPhone)}</p> : null}
        {profileFields?.address ? <p><strong>Address:</strong> {displayPii(client.address, hasPiiViewPermission(currentUser), maskAddress)}</p> : null}
        {profileFields?.piiPolicyVisible ? <p className="hint">PII is masked by default unless explicit permission is granted.</p> : null}
        <CustomFieldsRenderer
          fields={profileFields?.customProfileFields}
          role="client"
          values={client.customFields}
          readOnly
        />

        <h3>Upcoming Follow-up</h3>
        {upcomingFollowUp ? (
          <TimelineItem entry={upcomingFollowUp} />
        ) : (
          <p>No upcoming follow-up is currently scheduled.</p>
        )}

        <h3>Nearby Recommendations</h3>
        <label>
          Radius miles (1-100)
          <input
            type="number"
            min="1"
            max="100"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            const data = await fetchNearbyFacilities(client._id, radius || 25);
            setNearby(data);
          }}
        >
          Find nearby facilities
        </button>
        <div className="toggle-row">
          <button type="button" onClick={() => setNearbyView("list")}>List</button>
          <button type="button" onClick={() => setNearbyView("schematic")}>Schematic</button>
        </div>
        {nearby.length ? (
          nearbyView === "list" ? (
            <ul className="facility-list">
              {nearby.map((facility) => (
                <li key={facility._id}>{facility.name} - {facility.distanceMiles} miles</li>
              ))}
            </ul>
          ) : (
            <div className="schematic-board">
              {nearby.map((facility, index) => (
                <div
                  key={facility._id}
                  className="schematic-node"
                  style={{ left: `${10 + index * 28}%`, top: `${20 + (facility.distanceMiles % 40)}%` }}
                >
                  <strong>{facility.name}</strong>
                  <span>{facility.distanceMiles} mi</span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      <div className="panel">
        <h2>Complete Self-Assessment</h2>
        <form
          className="entry-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage("");
            if (Object.keys(validationErrors).length) {
              setStatus("error");
              return;
            }

            setStatus("saving");
            try {
              await createEntry({
                clientId: client._id,
                entryType: "assessment",
                title: assessment.title,
                body: assessment.body,
                tags: assessment.tags.split(",").map((item) => item.trim()).filter(Boolean),
                attachments: [],
                reason: "Client self-assessment"
              });
              setAssessment({ title: "", body: "", tags: "" });
              setStatus("success");
              setMessage("Assessment saved successfully.");
              await onRefresh();
            } catch (error) {
              setStatus("error");
              setMessage(error.message);
            }
          }}
        >
          <label>
            Assessment title
            <input
              value={assessment.title}
              onChange={(event) => setAssessment((previous) => ({ ...previous, title: event.target.value }))}
            />
          </label>
          {validationErrors.title ? <p className="inline-error">{validationErrors.title}</p> : null}

          <label>
            Response
            <textarea
              rows="4"
              value={assessment.body}
              onChange={(event) => setAssessment((previous) => ({ ...previous, body: event.target.value }))}
            />
          </label>
          {validationErrors.body ? <p className="inline-error">{validationErrors.body}</p> : null}

          <label>
            Tags
            <input
              value={assessment.tags}
              onChange={(event) => setAssessment((previous) => ({ ...previous, tags: event.target.value }))}
              placeholder="sleep, anxiety"
            />
          </label>

          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Submit Assessment"}
          </button>
          {message ? <p className={status === "success" ? "inline-message" : "inline-error"}>{message}</p> : null}
        </form>
      </div>

      <div className="panel role-span-full">
        <h3>My Timeline</h3>
        {timeline.length ? (
          <div className="timeline-list">
            {timeline.map((entry) => <TimelineItem key={entry._id} entry={entry} />)}
          </div>
        ) : (
          <p>No timeline entries yet.</p>
        )}
      </div>
    </section>
  );
}
