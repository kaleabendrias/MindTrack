import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AdministratorModule } from '../modules/administrator/AdministratorModule.jsx';

// ---------------------------------------------------------------------------
// Mock API modules — all return safe defaults so bootstrap completes
// ---------------------------------------------------------------------------

vi.mock('../api/mindTrackApi.js', () => ({
  createClient: vi.fn(),
  mergeClients: vi.fn(),
  updateClientGovernance: vi.fn()
}));

vi.mock('../api/systemApi.js', () => ({
  addCustomProfileField: vi.fn(),
  deleteCustomProfileField: vi.fn(),
  fetchBackupStatus: vi.fn(),
  runBackupNow: vi.fn(),
  updateCustomProfileField: vi.fn(),
  updateProfileFields: vi.fn()
}));

vi.mock('../api/userApi.js', () => ({
  adminResetPassword: vi.fn(),
  fetchUsers: vi.fn()
}));

vi.mock('../shared/ui/CustomFieldsRenderer.jsx', () => ({
  CustomFieldsRenderer: () => null
}));

import { fetchBackupStatus } from '../api/systemApi.js';
import { fetchUsers } from '../api/userApi.js';
import { createClient } from '../api/mindTrackApi.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_BACKUP_STATUS = {
  schedule: '0 0 * * *',
  retentionDays: 30,
  lastRunAt: null,
  destination: '/var/lib/offline-system/backups'
};

const MOCK_USERS = [
  { id: 'u1', username: 'dr_jones', role: 'clinician' },
  { id: 'u2', username: 'client1', role: 'client' }
];

const DEFAULT_PROPS = {
  clients: [],
  profileFields: { phone: true, address: true, tags: true, piiPolicyVisible: true },
  onProfileFieldsUpdated: vi.fn(),
  onClientCreated: vi.fn(),
  currentUser: { role: 'administrator', username: 'administrator', permissions: ['AUDIT_READ', 'PII_VIEW'] }
};

function renderAdmin(props = {}) {
  return render(<AdministratorModule {...DEFAULT_PROPS} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchBackupStatus.mockResolvedValue(MOCK_BACKUP_STATUS);
  fetchUsers.mockResolvedValue(MOCK_USERS);
});

// ---------------------------------------------------------------------------
// Loading and error states
// ---------------------------------------------------------------------------

describe('AdministratorModule — loading state', () => {
  test('shows loading state initially', () => {
    fetchBackupStatus.mockReturnValue(new Promise(() => {}));
    fetchUsers.mockReturnValue(new Promise(() => {}));
    renderAdmin();
    expect(screen.getByText('Loading administrator data...')).toBeTruthy();
  });

  test('shows error state when fetchBackupStatus rejects', async () => {
    fetchBackupStatus.mockRejectedValue(new Error('Backup service unreachable'));
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('Backup service unreachable')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Ready state — main UI
// ---------------------------------------------------------------------------

describe('AdministratorModule — ready state', () => {
  test('renders Administrator Client Management heading', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Administrator Client Management' })).toBeTruthy();
    });
  });

  test('renders Save client button', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save client' })).toBeTruthy();
    });
  });

  test('renders Full Name input field', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByLabelText('Full Name')).toBeTruthy();
    });
  });

  test('renders Primary Clinician select with clinician options', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('dr_jones')).toBeTruthy();
    });
  });

  test('calls fetchBackupStatus on mount', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(fetchBackupStatus).toHaveBeenCalledTimes(1);
    });
  });

  test('calls fetchUsers on mount', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(fetchUsers).toHaveBeenCalledTimes(1);
    });
  });

  test('renders backup status section', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getAllByText(/backup/i).length >= 1).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Clinician population
// ---------------------------------------------------------------------------

describe('AdministratorModule — clinician list', () => {
  test('only clinician-role users appear in Primary Clinician select', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('dr_jones')).toBeTruthy();
      expect(screen.queryByText('client1')).toBeNull();
    });
  });

  test('shows Select clinician placeholder option', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('Select clinician')).toBeTruthy();
    });
  });
});
