import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedPage } from '../app/ProtectedPage.jsx';

// Replace Navigate with a test double that exposes destination, replace flag,
// and location state as data attributes so tests can assert them directly.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, replace, state }) => (
      <div
        data-testid="navigate"
        data-to={to}
        data-replace={String(replace)}
        data-state={state ? JSON.stringify(state) : ''}
      />
    ),
  };
});

function renderProtected(auth, pathname, children = <div>protected content</div>) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <ProtectedPage auth={auth}>{children}</ProtectedPage>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Unauthenticated visitors
// ---------------------------------------------------------------------------

describe('ProtectedPage — unauthenticated', () => {
  test('redirects to /login when auth is null', () => {
    renderProtected(null, '/client');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/login');
  });

  test('redirects to /login when auth is undefined', () => {
    renderProtected(undefined, '/clinician');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/login');
  });

  test('uses replace navigation when redirecting unauthenticated users', () => {
    renderProtected(null, '/client');
    expect(screen.getByTestId('navigate').getAttribute('data-replace')).toBe('true');
  });

  test('passes the original pathname as location state.from', () => {
    renderProtected(null, '/client');
    const stateJson = screen.getByTestId('navigate').getAttribute('data-state');
    const state = JSON.parse(stateJson);
    expect(state.from).toBe('/client');
  });

  test('passes the clinician pathname as state.from', () => {
    renderProtected(null, '/clinician');
    const state = JSON.parse(screen.getByTestId('navigate').getAttribute('data-state'));
    expect(state.from).toBe('/clinician');
  });

  test('passes the administrator pathname as state.from', () => {
    renderProtected(null, '/administrator');
    const state = JSON.parse(screen.getByTestId('navigate').getAttribute('data-state'));
    expect(state.from).toBe('/administrator');
  });

  test('children are not rendered when unauthenticated', () => {
    renderProtected(null, '/client', <div>secret</div>);
    expect(screen.queryByText('secret')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Authorized access — each role on its own route
// ---------------------------------------------------------------------------

describe('ProtectedPage — authorized access', () => {
  test('client accessing /client renders children', () => {
    renderProtected({ user: { role: 'client' } }, '/client', <div>client page</div>);
    expect(screen.getByText('client page')).toBeTruthy();
    expect(screen.queryByTestId('navigate')).toBeNull();
  });

  test('clinician accessing /clinician renders children', () => {
    renderProtected({ user: { role: 'clinician' } }, '/clinician', <div>clinician page</div>);
    expect(screen.getByText('clinician page')).toBeTruthy();
    expect(screen.queryByTestId('navigate')).toBeNull();
  });

  test('administrator accessing /administrator renders children', () => {
    renderProtected(
      { user: { role: 'administrator' } },
      '/administrator',
      <div>admin page</div>
    );
    expect(screen.getByText('admin page')).toBeTruthy();
    expect(screen.queryByTestId('navigate')).toBeNull();
  });

  test('children can be complex nested JSX', () => {
    renderProtected(
      { user: { role: 'administrator' } },
      '/administrator',
      <section><h1>Dashboard</h1><p>Welcome</p></section>
    );
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cross-role access — wrong role for the requested path
// ---------------------------------------------------------------------------

describe('ProtectedPage — unauthorized cross-role access', () => {
  test('client trying to access /administrator is redirected to /client', () => {
    renderProtected({ user: { role: 'client' } }, '/administrator');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/client');
  });

  test('client trying to access /clinician is redirected to /client', () => {
    renderProtected({ user: { role: 'client' } }, '/clinician');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/client');
  });

  test('clinician trying to access /administrator is redirected to /clinician', () => {
    renderProtected({ user: { role: 'clinician' } }, '/administrator');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/clinician');
  });

  test('clinician trying to access /client is redirected to /clinician', () => {
    renderProtected({ user: { role: 'clinician' } }, '/client');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/clinician');
  });

  test('administrator trying to access /client is redirected to /administrator', () => {
    renderProtected({ user: { role: 'administrator' } }, '/client');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/administrator');
  });

  test('administrator trying to access /clinician is redirected to /administrator', () => {
    renderProtected({ user: { role: 'administrator' } }, '/clinician');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/administrator');
  });

  test('cross-role redirect uses replace navigation', () => {
    renderProtected({ user: { role: 'client' } }, '/administrator');
    expect(screen.getByTestId('navigate').getAttribute('data-replace')).toBe('true');
  });

  test('children are not rendered on unauthorized cross-role path', () => {
    renderProtected({ user: { role: 'client' } }, '/administrator', <div>forbidden</div>);
    expect(screen.queryByText('forbidden')).toBeNull();
  });
});
