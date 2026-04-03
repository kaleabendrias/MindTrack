import { Navigate, useLocation } from "react-router-dom";
import { defaultRouteForRole, roleCanAccessPath } from "./routePolicy.js";

export function ProtectedPage({ auth, children }) {
  const location = useLocation();
  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roleCanAccessPath(auth.user.role, location.pathname)) {
    return <Navigate to={defaultRouteForRole(auth.user.role)} replace />;
  }
  return children;
}
