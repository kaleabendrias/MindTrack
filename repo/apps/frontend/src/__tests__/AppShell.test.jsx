import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { AppShell } from '../app/AppShell.jsx';

function renderShell({ username = 'testuser', role = 'clinician', onLogout = vi.fn(), children } = {}) {
  return render(
    <AppShell currentUser={{ username, role }} onLogout={onLogout}>
      {children ?? <div>child content</div>}
    </AppShell>
  );
}

describe('AppShell — identity chips', () => {
  test('displays the username in an identity chip', () => {
    renderShell({ username: 'alice' });
    expect(screen.getByText('alice')).toBeTruthy();
  });

  test('displays the role in an identity chip', () => {
    renderShell({ role: 'administrator' });
    expect(screen.getByText('administrator')).toBeTruthy();
  });

  test('displays the correct role for clinician user', () => {
    renderShell({ username: 'dr_jones', role: 'clinician' });
    expect(screen.getByText('dr_jones')).toBeTruthy();
    expect(screen.getByText('clinician')).toBeTruthy();
  });

  test('displays the correct role for client user', () => {
    renderShell({ username: 'patient1', role: 'client' });
    expect(screen.getByText('patient1')).toBeTruthy();
    expect(screen.getByText('client')).toBeTruthy();
  });
});

describe('AppShell — logout', () => {
  test('renders a Logout button', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy();
  });

  test('calls onLogout when Logout button is clicked', () => {
    const onLogout = vi.fn();
    renderShell({ onLogout });
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  test('onLogout is not called before button click', () => {
    const onLogout = vi.fn();
    renderShell({ onLogout });
    expect(onLogout).not.toHaveBeenCalled();
  });
});

describe('AppShell — children', () => {
  test('renders children inside the main element', () => {
    renderShell({ children: <p>page body</p> });
    const main = document.querySelector('main');
    expect(main).toBeTruthy();
    expect(main.textContent).toContain('page body');
  });

  test('renders complex nested children', () => {
    renderShell({
      children: (
        <section>
          <h2>Dashboard</h2>
          <ul><li>Item A</li><li>Item B</li></ul>
        </section>
      )
    });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Item A')).toBeTruthy();
    expect(screen.getByText('Item B')).toBeTruthy();
  });

  test('renders brand heading and eyebrow text', () => {
    renderShell();
    expect(screen.getByText('MindTrack Offline')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Behavioral Workflow Console' })).toBeTruthy();
  });
});
