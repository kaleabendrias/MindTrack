import { useEffect, useMemo, useState } from "react";
import { recentSearchStorageKey } from "../utils/searchHistory.js";

function loadHistory(userKey) {
  try {
    const raw = localStorage.getItem(recentSearchStorageKey(userKey));
    return raw ? JSON.parse(raw) : [];
  } catch (_error) {
    return [];
  }
}

function saveHistory(userKey, history) {
  localStorage.setItem(recentSearchStorageKey(userKey), JSON.stringify(history.slice(0, 10)));
}

export function SearchPanel({ onSearch, trendingTerms, userKey }) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [tags, setTags] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("relevance");
  const [history, setHistory] = useState(() => loadHistory(userKey));

  useEffect(() => {
    setHistory(loadHistory(userKey));
  }, [userKey]);

  useEffect(() => {
    saveHistory(userKey, history);
  }, [history, userKey]);

  const suggestionTerms = useMemo(() => history.filter(Boolean), [history]);

  function submit(event) {
    event.preventDefault();

    if (query.trim()) {
      setHistory((previous) => [query.trim(), ...previous.filter((item) => item !== query.trim())]);
    }

    onSearch({
      q: query,
      channel,
      tags: tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      from,
      to,
      sort
    });
  }

  return (
    <section className="search-panel">
      <form onSubmit={submit}>
        <div className="search-grid">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, bodies, tags, templates"
          />
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">Any workflow type</option>
            <option value="assessment">Assessment</option>
            <option value="counseling_note">Counseling note</option>
            <option value="follow_up">Follow-up</option>
          </select>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="tag1,tag2"
          />
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="relevance">Sort: relevance</option>
            <option value="newest">Sort: newest</option>
          </select>
          <button type="submit">Search</button>
        </div>
      </form>

      {suggestionTerms.length ? (
        <div className="history-row">
          <strong>Recent:</strong>
          {suggestionTerms.map((item) => (
            <button key={item} onClick={() => setQuery(item)} type="button">
              {item}
            </button>
          ))}
          <button type="button" onClick={() => setHistory([])}>
            Clear history
          </button>
        </div>
      ) : null}

      {trendingTerms?.length ? (
        <div className="history-row">
          <strong>Trending (7d):</strong>
          {trendingTerms.map((item) => (
            <button key={item.term} onClick={() => setQuery(item.term)} type="button">
              {item.term} ({item.count})
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
