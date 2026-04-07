import { useState } from "react";
import { downloadAttachment } from "../../api/mindTrackApi.js";
import { StatusBadge } from "./StatusBadge.jsx";

export function TimelineItem({ entry, actions }) {
  const [downloadError, setDownloadError] = useState(null);

  // Click handler that performs a signed binary fetch and then turns the
  // returned Blob into an in-memory object URL the browser can open or
  // save. The plain `<a href="...">` approach used previously could not
  // attach the HMAC signature headers required by the protected /api/v1
  // chain and was rejected with 401.
  const handleDownload = async (att) => {
    setDownloadError(null);
    try {
      const { blob, fileName } = await downloadAttachment(entry._id, att.fingerprint);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const tempAnchor = document.createElement("a");
        tempAnchor.href = objectUrl;
        tempAnchor.download = fileName;
        tempAnchor.rel = "noopener";
        document.body.appendChild(tempAnchor);
        tempAnchor.click();
        document.body.removeChild(tempAnchor);
      } finally {
        // Defer revocation slightly so the browser has time to start
        // streaming the click target before the blob disappears.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (err) {
      setDownloadError(err?.code || err?.message || "download failed");
    }
  };

  return (
    <article className="timeline-item">
      <header>
        <div>
          <p className="entry-type">{entry.entryType.replace("_", " ")}</p>
          <h4>{entry.title}</h4>
        </div>
        <StatusBadge status={entry.status} />
      </header>
      <p>{entry.body}</p>
      <div className="meta-row">
        <span>{new Date(entry.occurredAt).toLocaleString()}</span>
        <span>{entry.channel}</span>
        <span>v{entry.version}</span>
      </div>
      {entry.tags?.length ? <p className="tag-row">{entry.tags.map((tag) => `#${tag}`).join(" ")}</p> : null}
      {entry.attachments?.length ? (
        <div className="attachment-list-view">
          <p className="attachment-summary">Attachments ({entry.attachments.length}):</p>
          <ul className="attachment-links">
            {entry.attachments.map((att) => (
              <li key={att.fingerprint}>
                {att.storagePath ? (
                  <button
                    type="button"
                    className="attachment-download-button"
                    onClick={() => handleDownload(att)}
                  >
                    {att.name}
                  </button>
                ) : (
                  <span>{att.name} (metadata only)</span>
                )}
                <span className="attachment-meta"> — {att.type}, {(att.sizeBytes / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
          {downloadError ? (
            <p className="attachment-download-error" role="alert">
              Attachment download failed: {downloadError}
            </p>
          ) : null}
        </div>
      ) : null}
      {actions ? <div className="timeline-actions">{actions}</div> : null}
    </article>
  );
}
