import { useRef, useState } from "react";
import {
  MAX_ATTACHMENTS_PER_ENTRY,
  validateAttachmentMeta
} from "../utils/attachmentRules.js";
import { fingerprintFile } from "../utils/fileFingerprint.js";

function toLabel(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AttachmentUploader({ items, onChange }) {
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function ingestFiles(fileList) {
    setError("");
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    if (items.length + files.length > MAX_ATTACHMENTS_PER_ENTRY) {
      setError("Maximum 20 files per entry.");
      return;
    }

    const existingFingerprints = new Set(items.map((item) => item.fingerprint));
    const appended = [...items];

    for (const file of files) {
      const fingerprint = await fingerprintFile(file);
      const validationError = validateAttachmentMeta(items, [
        {
          name: file.name,
          type: file.type,
          sizeBytes: file.size,
          fingerprint
        }
      ]);
      if (validationError || existingFingerprints.has(fingerprint)) {
        setError(validationError || `Duplicate upload blocked: ${file.name}`);
        return;
      }

      existingFingerprints.add(fingerprint);
      appended.push({
        name: file.name,
        type: file.type,
        sizeBytes: file.size,
        fingerprint
      });
    }

    onChange(appended);
  }

  function removeAt(index) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="attachment-uploader">
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          ingestFiles(event.dataTransfer.files);
        }}
      >
        <p>Drag and drop PDF/JPG/PNG files here</p>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          hidden
          onChange={(event) => ingestFiles(event.target.files)}
        />
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      {items.length ? (
        <ul className="attachment-list">
          {items.map((item, index) => (
            <li key={item.fingerprint}>
              <span>{item.name}</span>
              <span>{item.type}</span>
              <span>{toLabel(item.sizeBytes)}</span>
              <span className="fingerprint-cell">{item.fingerprint.slice(0, 16)}...</span>
              <button type="button" onClick={() => removeAt(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
