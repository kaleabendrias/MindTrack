import { useState } from "react";
import { searchEntries } from "../api/mindTrackApi.js";
import { SearchPanel } from "../shared/ui/SearchPanel.jsx";
import { TimelineItem } from "../shared/ui/TimelineItem.jsx";

export function SearchDiscovery({ userKey, trendingTerms, onError }) {
  const [searchResults, setSearchResults] = useState([]);
  const [templateResults, setTemplateResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");

  return (
    <>
      <SearchPanel
        userKey={userKey}
        trendingTerms={trendingTerms}
        onSearch={async (params) => {
          setSearchState("loading");
          try {
            const results = await searchEntries(params);
            setSearchResults(results.entries || []);
            setTemplateResults(results.templates || []);
            setSearchState((results.entries || []).length || (results.templates || []).length ? "ready" : "empty");
          } catch (searchError) {
            if (onError) {
              onError(searchError.message);
            }
            setSearchState("error");
          }
        }}
      />
      <section className="panel">
        <h3>Discovery Results</h3>
        {searchState === "loading" ? <p>Searching...</p> : null}
        {searchState === "error" ? <p className="inline-error">Search failed. Please try again.</p> : null}
        {searchState === "empty" ? <p>No results found.</p> : null}
        {searchState === "idle" ? <p className="hint">Enter a query above to search entries and templates.</p> : null}
        <div className="timeline-list">
          {searchResults.map((entry) => <TimelineItem key={entry._id} entry={entry} />)}
        </div>
        {templateResults.length ? (
          <div className="timeline-list">
            <h4>Templates</h4>
            {templateResults.map((template) => (
              <article key={template._id} className="timeline-item">
                <header><div><p className="entry-type">template {template.entryType.replace("_", " ")}</p><h4>{template.title}</h4></div></header>
                <p>{template.body}</p>
                <p className="tag-row">{(template.tags || []).map((tag) => `#${tag}`).join(" ")}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
