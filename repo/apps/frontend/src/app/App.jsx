import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { fetchSession, login, logout } from "../api/authApi.js";
import { fetchClients, fetchSelfContext, fetchTrendingTerms } from "../api/mindTrackApi.js";
import { fetchProfileFields } from "../api/systemApi.js";
import { AdministratorModule } from "../modules/administrator/AdministratorModule.jsx";
import { ClientModule } from "../modules/client/ClientModule.jsx";
import { ClinicianModule } from "../modules/clinician/ClinicianModule.jsx";
import { AppShell } from "./AppShell.jsx";
import { LoginPage } from "./LoginPage.jsx";
import { ProtectedPage } from "./ProtectedPage.jsx";
import { SearchDiscovery } from "./SearchDiscovery.jsx";
import { defaultRouteForRole } from "./routePolicy.js";

export function App() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(null);
  const [selfContext, setSelfContext] = useState(null);
  const [clients, setClients] = useState([]);
  const [trendingTerms, setTrendingTerms] = useState([]);
  const [profileFields, setProfileFields] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  async function loadClients() {
    const data = await fetchClients();
    setClients(data);
  }

  useEffect(() => {
    (async () => {
      try {
        const session = await fetchSession();
        setAuth(session);
        navigate(defaultRouteForRole(session.user.role), { replace: true });
      } catch (_error) {
        setAuth(null);
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    (async () => {
      try {
        if (auth.user.role === "client") {
          const context = await fetchSelfContext();
          setSelfContext(context);
          setClients(context.client ? [context.client] : []);
        } else {
          await loadClients();
          setSelfContext(null);
        }
        const nextProfileFields = await fetchProfileFields();
        setProfileFields(nextProfileFields);
        const trends = await fetchTrendingTerms();
        setTrendingTerms(trends);
      } catch (loadError) {
        setError(loadError.message);
      }
    })();
  }, [auth]);

  if (isBootstrapping) {
    return <div className="login-shell"><div className="login-card"><p>Loading session...</p></div></div>;
  }

  if (!auth) {
    return <LoginPage onLogin={async (username, password) => {
      setError("");
      try {
        const payload = await login(username, password);
        setAuth(payload);
        setSelfContext(null);
        setMessage(`Signed in as ${payload.user.role}`);
        navigate(defaultRouteForRole(payload.user.role), { replace: true });
      } catch (loginError) {
        setError(loginError.message);
      }
    }} error={error} />;
  }

  const searchUi = auth.user.role !== "client" ? (
    <SearchDiscovery
      userKey={auth.user.id}
      trendingTerms={trendingTerms}
      onError={setError}
    />
  ) : null;

  return (
    <AppShell
      currentUser={auth.user}
      onLogout={async () => {
        await logout();
        setAuth(null);
        setSelfContext(null);
        setClients([]);
        setTrendingTerms([]);
        setProfileFields(null);
        setError("");
        setMessage("");
        navigate("/login", { replace: true });
      }}
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="inline-message">{message}</p> : null}
      <Routes>
        <Route path="/login" element={<Navigate to={defaultRouteForRole(auth.user.role)} replace />} />
        <Route path="/client" element={<ProtectedPage auth={auth}><ClientModule selfContext={selfContext} onRefresh={async () => setSelfContext(await fetchSelfContext())} profileFields={profileFields} currentUser={auth.user} /></ProtectedPage>} />
        <Route path="/clinician" element={<ProtectedPage auth={auth}><>{searchUi}<ClinicianModule clients={clients} profileFields={profileFields} onClientCreated={async () => { await loadClients(); }} currentUser={auth.user} /></></ProtectedPage>} />
        <Route path="/administrator" element={<ProtectedPage auth={auth}><>{searchUi}<AdministratorModule clients={clients} profileFields={profileFields} onProfileFieldsUpdated={setProfileFields} onClientCreated={async () => { await loadClients(); }} currentUser={auth.user} /></></ProtectedPage>} />
        <Route path="*" element={<Navigate to={defaultRouteForRole(auth.user.role)} replace />} />
      </Routes>
    </AppShell>
  );
}
