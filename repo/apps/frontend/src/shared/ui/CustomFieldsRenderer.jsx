export function CustomFieldsRenderer({ fields, role, values, onChange, readOnly }) {
  const visibleFields = (fields || []).filter(
    (field) => (field.visibleTo || []).includes(role)
  );

  if (!visibleFields.length) {
    return null;
  }

  return (
    <div className="custom-fields">
      {visibleFields.map((field) => {
        const value = (values || {})[field.key] ?? "";

        if (readOnly) {
          return (
            <p key={field.key}>
              <strong>{field.label}:</strong>{" "}
              {field.fieldType === "boolean" ? (value ? "Yes" : "No") : String(value || "—")}
            </p>
          );
        }

        function handleChange(nextValue) {
          onChange({ ...values, [field.key]: nextValue });
        }

        return (
          <label key={field.key}>
            {field.label}{field.required ? " *" : ""}
            {field.fieldType === "text" && (
              <input value={value} onChange={(e) => handleChange(e.target.value)} />
            )}
            {field.fieldType === "number" && (
              <input type="number" value={value} onChange={(e) => handleChange(e.target.value)} />
            )}
            {field.fieldType === "date" && (
              <input type="date" value={value} onChange={(e) => handleChange(e.target.value)} />
            )}
            {field.fieldType === "boolean" && (
              <input type="checkbox" checked={Boolean(value)} onChange={(e) => handleChange(e.target.checked)} />
            )}
            {field.fieldType === "select" && (
              <select value={value} onChange={(e) => handleChange(e.target.value)}>
                <option value="">Select...</option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </label>
        );
      })}
    </div>
  );
}
