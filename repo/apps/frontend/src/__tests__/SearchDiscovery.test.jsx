import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { SearchDiscovery } from '../app/SearchDiscovery.jsx';

vi.mock('../api/mindTrackApi.js', () => ({
  searchEntries: vi.fn()
}));

vi.mock('../shared/ui/SearchPanel.jsx', () => ({
  SearchPanel: ({ onSearch }) => (
    <div data-testid="search-panel">
      <button type="button" onClick={() => onSearch({ q: 'test' })}>Run search</button>
    </div>
  )
}));

vi.mock('../shared/ui/TimelineItem.jsx', () => ({
  TimelineItem: ({ entry }) => <div data-testid={`entry-${entry._id}`}>{entry.title}</div>
}));

import { searchEntries } from '../api/mindTrackApi.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDiscovery(props = {}) {
  return render(
    <SearchDiscovery userKey="user1" trendingTerms={[]} onError={vi.fn()} {...props} />
  );
}

describe('SearchDiscovery — idle state', () => {
  test('renders the search panel', () => {
    renderDiscovery();
    expect(screen.getByTestId('search-panel')).toBeTruthy();
  });

  test('shows idle hint text before any search', () => {
    renderDiscovery();
    expect(screen.getByText('Enter a query above to search entries and templates.')).toBeTruthy();
  });
});

describe('SearchDiscovery — loading state', () => {
  test('shows Searching... while awaiting results', async () => {
    let resolve;
    searchEntries.mockReturnValue(new Promise((res) => { resolve = res; }));
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeTruthy();
    });
    resolve({ entries: [], templates: [] });
  });
});

describe('SearchDiscovery — error state', () => {
  test('shows error message when searchEntries rejects', async () => {
    searchEntries.mockRejectedValue(new Error('Network failure'));
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.getByText('Search failed. Please try again.')).toBeTruthy();
    });
  });

  test('calls onError with the error message', async () => {
    const onError = vi.fn();
    searchEntries.mockRejectedValue(new Error('timeout'));
    renderDiscovery({ onError });
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('timeout');
    });
  });
});

describe('SearchDiscovery — empty state', () => {
  test('shows no results message when entries and templates are empty', async () => {
    searchEntries.mockResolvedValue({ entries: [], templates: [] });
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeTruthy();
    });
  });
});

describe('SearchDiscovery — ready state', () => {
  test('renders entry results returned by searchEntries', async () => {
    searchEntries.mockResolvedValue({
      entries: [
        { _id: 'e1', title: 'Entry One', entryType: 'assessment' },
        { _id: 'e2', title: 'Entry Two', entryType: 'follow_up' }
      ],
      templates: []
    });
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.getByTestId('entry-e1')).toBeTruthy();
      expect(screen.getByTestId('entry-e2')).toBeTruthy();
    });
  });

  test('renders template results when templates are returned', async () => {
    searchEntries.mockResolvedValue({
      entries: [],
      templates: [
        { _id: 't1', title: 'Template Alpha', entryType: 'assessment', body: 'Template body', tags: ['intake'] }
      ]
    });
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.getByText('Template Alpha')).toBeTruthy();
    });
  });

  test('does not show idle hint or error when results are present', async () => {
    searchEntries.mockResolvedValue({
      entries: [{ _id: 'e1', title: 'Result', entryType: 'assessment' }],
      templates: []
    });
    renderDiscovery();
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }));
    await waitFor(() => {
      expect(screen.queryByText('Enter a query above to search entries and templates.')).toBeNull();
      expect(screen.queryByText('Search failed. Please try again.')).toBeNull();
    });
  });
});
