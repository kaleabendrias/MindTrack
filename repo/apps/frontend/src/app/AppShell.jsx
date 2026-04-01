export function AppShell({ currentUser, children, onLogout }) {
  return (
    <div className="shell">
      <header className="shell__header">
        <div>
          <p className="eyebrow">MindTrack Offline</p>
          <h1>Behavioral Workflow Console</h1>
        </div>
        <div className="shell__controls">
          <span className="identity-chip">{currentUser.username}</span>
          <span className="identity-chip">{currentUser.role}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
