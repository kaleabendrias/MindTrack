export function defaultRouteForRole(role) {
  if (role === "administrator") {
    return "/administrator";
  }
  if (role === "clinician") {
    return "/clinician";
  }
  if (role === "client") {
    return "/client";
  }
  return "/login";
}

export function roleCanAccessPath(role, path) {
  if (!role) {
    return path === "/login";
  }
  const allowed = {
    administrator: ["/administrator"],
    clinician: ["/clinician"],
    client: ["/client"]
  };
  return (allowed[role] || []).includes(path);
}
