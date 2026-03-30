import { StatusBadge } from "./StatusBadge.jsx";

export function TimelineItem({ entry, actions }) {
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
        <p className="attachment-summary">Attachments: {entry.attachments.length}</p>
      ) : null}
      {actions ? <div className="timeline-actions">{actions}</div> : null}
    </article>
  );
}
