import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../app/LoginPage.jsx';

vi.mock('../api/authApi.js', () => ({
  fetchSecurityQuestions: vi.fn(),
  recoverPassword: vi.fn(),
}));

import { fetchSecurityQuestions, recoverPassword } from '../api/authApi.js';

// ---------------------------------------------------------------------------
// Sign-in form — static rendering
// ---------------------------------------------------------------------------

describe('LoginPage — sign-in form rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  test('renders MindTrack heading, username input, password input, and Sign In button', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByRole('heading', { name: 'MindTrack Sign In' })).toBeTruthy();
    expect(screen.getByPlaceholderText('username')).toBeTruthy();
    expect(screen.getByPlaceholderText('password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  test('password input has type="password" so the value is masked', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByPlaceholderText('password').type).toBe('password');
  });

  test('username input has no type restriction (plain text)', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    const input = screen.getByPlaceholderText('username');
    expect(input.type).toBe('text');
  });

  test('renders inline error paragraph when error prop is set', () => {
    render(<LoginPage onLogin={vi.fn()} error="Invalid credentials" />);
    expect(screen.getByText('Invalid credentials')).toBeTruthy();
  });

  test('inline error is absent when error prop is null', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.queryByText('Invalid credentials')).toBeNull();
  });

  test('all three third-party sign-in buttons are disabled in offline mode', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByRole('button', { name: 'Sign in with Google' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in with SAML SSO' }).disabled).toBe(true);
  });

  test('offline mode notice is visible below third-party buttons', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByText('Unavailable in offline/on-prem mode')).toBeTruthy();
  });

  test('Forgot password link is present in sign-in form', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.getByText(/forgot password/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sign-in form — user interactions and auth-state transitions
// ---------------------------------------------------------------------------

describe('LoginPage — sign-in interactions', () => {
  beforeEach(() => vi.clearAllMocks());

  test('Sign In calls onLogin with the entered username and password', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} error={null} />);

    await userEvent.type(screen.getByPlaceholderText('username'), 'administrator');
    await userEvent.type(screen.getByPlaceholderText('password'), 'MyPassword1234');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('administrator', 'MyPassword1234'));
  });

  test('Sign In clears the password field after onLogin resolves', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} error={null} />);

    const pwInput = screen.getByPlaceholderText('password');
    await userEvent.type(pwInput, 'SecretPass99!');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    await waitFor(() => expect(pwInput.value).toBe(''));
  });

  test('Sign In passes empty strings when fields are not filled', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('', ''));
  });

  test('latest error prop change is reflected immediately', () => {
    const { rerender } = render(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.queryByText('Bad password')).toBeNull();
    rerender(<LoginPage onLogin={vi.fn()} error="Bad password" />);
    expect(screen.getByText('Bad password')).toBeTruthy();
    rerender(<LoginPage onLogin={vi.fn()} error={null} />);
    expect(screen.queryByText('Bad password')).toBeNull();
  });

  test('onLogin is called once per submit click (no double-fire)', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// Recovery form — rendering
// ---------------------------------------------------------------------------

describe('LoginPage — recovery form rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  test('clicking Forgot password shows the Password Recovery heading', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByRole('heading', { name: 'Password Recovery' })).toBeTruthy();
  });

  test('recovery form shows Look up and Back to sign in buttons', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeTruthy();
  });

  test('Back to sign in restores the sign-in form and hides recovery UI', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'MindTrack Sign In' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Password Recovery' })).toBeNull();
  });

  test('security question and Reset Password button are hidden before lookup', () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.queryByRole('button', { name: 'Reset Password' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovery form — interactions
// ---------------------------------------------------------------------------

describe('LoginPage — recovery interactions', () => {
  beforeEach(() => vi.clearAllMocks());

  test('Look up with empty username shows inline validation error', async () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Enter your username first.')).toBeTruthy());
  });

  test('Look up with empty username does not call fetchSecurityQuestions', async () => {
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByText('Enter your username first.'));
    expect(fetchSecurityQuestions).not.toHaveBeenCalled();
  });

  test('successful lookup renders the security question text', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Name of first pet?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'clinician' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByText('Name of first pet?')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeTruthy();
  });

  test('single question shows as plain text (not a select)', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q1?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'u' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => screen.getByText('Q1?'));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('multiple questions render a select with one option per question', async () => {
    fetchSecurityQuestions.mockResolvedValue([
      { question: 'Pet name?' },
      { question: 'City of birth?' },
    ]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'u' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(screen.getAllByRole('option').length).toBe(2);
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
    expect(screen.queryByRole('button', { name: 'Reset Password' })).toBeNull();
  });

  test('API error on lookup is shown as inline error', async () => {
    fetchSecurityQuestions.mockRejectedValue(new Error('Service temporarily unavailable'));
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() =>
      expect(screen.getByText('Service temporarily unavailable')).toBeTruthy()
    );
  });

  test('changing username after successful lookup hides the question form', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    const usernameInput = screen.getByPlaceholderText('username');
    fireEvent.change(usernameInput, { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    // Changing the username resets questionsFetched
    fireEvent.change(usernameInput, { target: { value: 'different' } });
    expect(screen.queryByRole('button', { name: 'Reset Password' })).toBeNull();
  });

  test('Reset Password with password shorter than 12 chars shows policy error', async () => {
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
    expect(recoverPassword).not.toHaveBeenCalled();
  });

  test('Reset Password with no digits shows policy error', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'OnlyLettersNoDigits!' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
    await waitFor(() =>
      expect(screen.getByText('Password must contain at least one number.')).toBeTruthy()
    );
  });

  test('successful reset shows success message', async () => {
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

  test('successful reset clears answer and password inputs', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    recoverPassword.mockResolvedValue({ reset: true });
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    const answerInput = screen.getByPlaceholderText('Your answer (masked)');
    const newPwInput = screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)');
    fireEvent.change(answerInput, { target: { value: 'my-answer' } });
    fireEvent.change(newPwInput, { target: { value: 'NewPassword99!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => screen.getByText('Password reset successfully. You can now sign in.'));
    expect(answerInput.value).toBe('');
    expect(newPwInput.value).toBe('');
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

  test('API error during recoverPassword call is shown as inline error', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Q?' }]);
    recoverPassword.mockRejectedValue(new Error('Rate limit exceeded'));
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'user' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(screen.getByPlaceholderText('Your answer (masked)'), { target: { value: 'ans' } });
    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'ValidPassword1' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(screen.getByText('Rate limit exceeded')).toBeTruthy()
    );
  });

  test('recoverPassword is called with username, selected question, answer, and newPassword', async () => {
    fetchSecurityQuestions.mockResolvedValue([{ question: 'Childhood pet?' }]);
    recoverPassword.mockResolvedValue({ reset: true });
    render(<LoginPage onLogin={vi.fn()} error={null} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: 'myuser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => screen.getByRole('button', { name: 'Reset Password' }));

    fireEvent.change(screen.getByPlaceholderText('Your answer (masked)'), { target: { value: 'Fluffy' } });
    fireEvent.change(
      screen.getByPlaceholderText('New password (min 12 chars, 1 letter, 1 number)'),
      { target: { value: 'NewPassw0rd!' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(recoverPassword).toHaveBeenCalledWith({
      username: 'myuser',
      question: 'Childhood pet?',
      answer: 'Fluffy',
      newPassword: 'NewPassw0rd!',
    }));
  });
});
