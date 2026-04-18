import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../app/LoginPage.jsx';

vi.mock('../api/authApi.js', () => ({
  fetchSecurityQuestions: vi.fn(),
  recoverPassword: vi.fn(),
}));

import { fetchSecurityQuestions, recoverPassword } from '../api/authApi.js';

describe('LoginPage — sign-in form', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders MindTrack heading, username, password, and Sign In button', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByRole('heading', { name: 'MindTrack Sign In' })).toBeTruthy();
    expect(screen.getByPlaceholderText('username')).toBeTruthy();
    expect(screen.getByPlaceholderText('password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  test('renders inline error paragraph when error prop is set', () => {
    render(<LoginPage onLogin={vi.fn()} error="Invalid credentials" />);
    expect(screen.getByText('Invalid credentials')).toBeTruthy();
  });

  test('inline error is absent when error prop is null', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });

  test('Sign In calls onLogin with the entered username and password', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} error={null} />);

    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'administrator' } });
    fireEvent.change(screen.getByPlaceholderText('password'), { target: { value: 'MyPassword1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('administrator', 'MyPassword1234'));
  });

  test('all three third-party sign-in buttons are disabled in offline mode', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByRole('button', { name: 'Sign in with Google' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in with SAML SSO' }).disabled).toBe(true);
  });

  test('offline mode label is visible below third-party buttons', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByText('Unavailable in offline/on-prem mode')).toBeTruthy();
  });
});

describe('LoginPage — recovery form', () => {
  beforeEach(() => vi.clearAllMocks());

  test('clicking Forgot password shows the recovery form heading', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByRole('heading', { name: 'Password Recovery' })).toBeTruthy();
  });

  test('recovery form exposes Look up and Back to sign in buttons', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
  });

  test('Back to sign in restores the sign-in form', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'MindTrack Sign In' })).toBeTruthy();
  });

  test('Look up with empty username shows inline error', async () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Enter your username first.')).toBeTruthy());
  });

  test('successful lookup renders security question and Reset Password button', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Name of first pet?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'clinician' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByText('Name of first pet?')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeTruthy();
  });

  test('multiple questions render a select element', async () => {
    fetchSecurityQuestions.mockResolvedValue([
      { question: 'Pet name?' },
      { question: 'City of birth?' },
    ]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'u' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(2);
  });

  test('empty question list shows no-questions error', async () => {
    fetchSecurityQuestions.mockResolvedValue([]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() =>
      expect(screen.getByText('No security questions found for this user.')).toBeTruthy()
    );
  });

  test('submitting Reset Password with short password shows policy error', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'short' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(screen.getByText('Password must be at least 12 characters.')).toBeTruthy()
    );
  });

  test('successful reset shows success message and clears answer fields', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    recoverPassword.mockResolvedValue({ reset: true });
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(screen.getByPlaceholderText('Your answer (masked)'), { target: { value: 'myanswer' } });
    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'NewPassword99!' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(screen.getByText('Password reset successfully. You can now sign in.')).toBeTruthy()
    );
  });

  test('failed reset (reset:false) shows recovery error', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    recoverPassword.mockResolvedValue({ reset: false });
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(screen.getByPlaceholderText('Your answer (masked)'), { target: { value: 'wrong' } });
    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'ValidPassword1' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(
        screen.getByText('Recovery failed. Please verify your security answer and try again.')
      ).toBeTruthy()
    );
  });
});
