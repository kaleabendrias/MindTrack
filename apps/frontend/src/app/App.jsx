import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { fetchSession, login, logout } from "../api/authApi.js";
import { fetchClients, fetchSelfContext, fetchTrendingTerms, searchEntries } from "../api/mindTrackApi.js";
import { fetchProfileFields } from "../api/systemApi.js";
import { AdministratorModule } from "../modules/administrator/AdministratorModule.jsx";
import { ClientModule } from "../modules/client/ClientModule.jsx";
import { ClinicianModule } from "../modules/clinician/ClinicianModule.jsx";
import { SearchPanel } from "../shared/ui/SearchPanel.jsx";
import { TimelineItem } from "../shared/ui/TimelineItem.jsx";
import { AppShell } from "./AppShell.jsx";
import { defaultRouteForRole, roleCanAccessPath } from "./routePolicy.js";

function ProtectedPage({ auth, children }) {
  const location = useLocation();
  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roleCanAccessPath(auth.user.role, location.pathname)) {
    return <Navigate to={defaultRouteForRole(auth.user.role)} replace />;
  }
  return children;
}

function LoginPage({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-shell">
      <form
        className="login-card"
        onSubmit={async (event) => {
          event.preventDefault();
          await onLogin(username, password);
          setPassword("");
        }}
      >
        <h2>MindTrack Sign In</h2>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="password" />
        <button type="submit">Sign In</button>
        {error ? <p className="inline-error">{error}</p> : null}
      </form>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(null);
  const [selfContext, setSelfContext] = useState(null);
  const [clients, setClients] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [templateResults, setTemplateResults] = useState([]);
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
        setSearchResults([]);
        setTemplateResults([]);
        setMessage(`Signed in as ${payload.user.role}`);
        navigate(defaultRouteForRole(payload.user.role), { replace: true });
      } catch (loginError) {
        setError(loginError.message);
      }
    }} error={error} />;
  }

  const searchUi = auth.user.role !== "client" ? (
    <>
      <SearchPanel
        userKey={auth.user.id}
        trendingTerms={trendingTerms}
        onSearch={async (params) => {
          try {
            const results = await searchEntries(params);
            setSearchResults(results.entries || []);
            setTemplateResults(results.templates || []);
          } catch (searchError) {
            setError(searchError.message);
          }
        }}
      />
      <section className="panel">
        <h3>Discovery Results</h3>
        <div className="timeline-list">
          {searchResults.map((entry) => <TimelineItem key={entry._id} entry={entry} />)}
        </div>
        {templateResults.length ? (
          <div className="timeline-list">
            <h4>Templates</h4>
            {templateResults.map((template) => (
              <article key={template._id} className="timeline-item">
                <header><div><p className="entry-type">template {template.entryType.replace("_", " ")}</p><h4>{template.title}</h4></div></header>
                <p>{template.body}</p>
                <p className="tag-row">{(template.tags || []).map((tag) => `#${tag}`).join(" ")}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  ) : null;

  return (
    <AppShell
      currentUser={auth.user}
      onLogout={async () => {
        await logout();
        setAuth(null);
        setSelfContext(null);
        setClients([]);
        setSearchResults([]);
        setTemplateResults([]);
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
        <Route path="/client" element={<ProtectedPage auth={auth}><ClientModule selfContext={selfContext} onRefresh={async () => setSelfContext(await fetchSelfContext())} profileFields={profileFields} /></ProtectedPage>} />
        <Route path="/clinician" element={<ProtectedPage auth={auth}><>{searchUi}<ClinicianModule clients={clients} profileFields={profileFields} onClientCreated={async () => { await loadClients(); }} /></></ProtectedPage>} />
        <Route path="/administrator" element={<ProtectedPage auth={auth}><>{searchUi}<AdministratorModule clients={clients} profileFields={profileFields} onProfileFieldsUpdated={setProfileFields} onClientCreated={async () => { await loadClients(); }} /></></ProtectedPage>} />
        <Route path="*" element={<Navigate to={defaultRouteForRole(auth.user.role)} replace />} />
      </Routes>
    </AppShell>
  );
}
