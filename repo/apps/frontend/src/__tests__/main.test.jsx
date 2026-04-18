import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock('react-dom/client', () => ({ createRoot: mockCreateRoot }));
vi.mock('react-router-dom', () => ({ BrowserRouter: ({ children }) => children }));
vi.mock('../app/App.jsx', () => ({ App: () => null }));
vi.mock('../app/styles.css', () => ({}));

let rootEl;

beforeEach(() => {
  mockCreateRoot.mockClear();
  mockRender.mockClear();
  rootEl = document.createElement('div');
  rootEl.id = 'root';
  document.body.appendChild(rootEl);
});

afterEach(() => {
  if (rootEl && rootEl.parentNode) {
    rootEl.parentNode.removeChild(rootEl);
  }
  vi.resetModules();
});

describe('main — React entry point', () => {
  test('calls createRoot with the #root DOM element', async () => {
    await import('../main.jsx');
    expect(mockCreateRoot).toHaveBeenCalledWith(rootEl);
  });

  test('calls render after createRoot', async () => {
    await import('../main.jsx');
    expect(mockRender).toHaveBeenCalled();
  });

  test('document #root element is accessible for mounting', () => {
    expect(document.getElementById('root')).toBeTruthy();
  });
});
