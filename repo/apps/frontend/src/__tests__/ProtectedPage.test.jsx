import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedPage } from '../app/ProtectedPage.jsx';

// Replace Navigate with a test double that renders its destination as a
// data attribute so tests can assert the redirect target without needing a
// full router setup.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
  };
});

function renderProtected(auth, pathname, children = <div>content</div>) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <ProtectedPage auth={auth}>{children}</ProtectedPage>
    </MemoryRouter>
  );
}

describe('ProtectedPage — unauthenticated', () => {
  test('redirects to /login when auth is null', () => {
    renderProtected(null, '/client');
    const nav = screen.getByTestId('navigate');
    expect(nav.getAttribute('data-to')).toBe('/login');
  });

  test('redirects to /login when auth is undefined', () => {
    renderProtected(undefined, '/clinician');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/login');
  });

  test('children are not rendered when unauthenticated', () => {
    renderProtected(null, '/client', <div>secret</div>);
    expect(screen.queryByText('secret')).toBeNull();
  });
});

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
});

describe('ProtectedPage — unauthorized access (wrong role)', () => {
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

  test('administrator trying to access /client is redirected to /administrator', () => {
    renderProtected({ user: { role: 'administrator' } }, '/client');
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/administrator');
  });

  test('children are not rendered for cross-role access attempts', () => {
    renderProtected({ user: { role: 'client' } }, '/administrator', <div>forbidden</div>);
    expect(screen.queryByText('forbidden')).toBeNull();
  });
});
