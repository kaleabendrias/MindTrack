import { statusCue } from "../../app/roleLogic.js";

export function StatusBadge({ status }) {
  return <span className={`badge ${statusCue(status)}`}>{String(status).replace("_", " ")}</span>;
}
