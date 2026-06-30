(() => {
  const input = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearchButton");
  const status = document.getElementById("searchStatus");
  const results = document.getElementById("searchResults");

  if (!input || !clearButton || !status || !results) {
    return;
  }

  let searchIndex = [];
  let indexLoaded = false;
  let searchTimer = null;

  const MAX_RESULTS = 30;
  const SNIPPET_LENGTH = 110;

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getTerms(query) {
    return normalizeText(query)
      .split(/[ 　]+/)
      .map(term => term.trim())
      .filter(Boolean);
  }

  async function loadIndex() {
    if (indexLoaded) return;

    status.textContent = "検索データを読み込み中です…";

    try {
      const response = await fetch("search_index.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      searchIndex = await response.json();
      indexLoaded = true;
      status.textContent = "";
    } catch (error) {
      console.error(error);
      status.textContent = "検索データを読み込めませんでした。search_index.json を確認してください。";
    }
  }

  function countOccurrences(text, term) {
    if (!term) return 0;

    const normalized = normalizeText(text);
    const escaped = escapeRegExp(term);
    const matches = normalized.match(new RegExp(escaped, "g"));

    return matches ? matches.length : 0;
  }

  function scoreDocument(doc, terms) {
    const title = normalizeText(doc.title);
    const text = normalizeText(doc.text);

    let score = 0;

    for (const term of terms) {
      const inTitle = title.includes(term);
      const inText = text.includes(term);

      if (!inTitle && !inText) {
        return 0;
      }

      if (inTitle) {
        score += 20;
      }

      if (inText) {
        score += 2;
        score += Math.min(countOccurrences(doc.text, term), 10);
      }
    }

    return score;
  }

  function makeSnippet(text, terms) {
    const rawText = String(text || "").replace(/\s+/g, " ").trim();
    const normalized = normalizeText(rawText);

    let firstIndex = -1;

    for (const term of terms) {
      const index = normalized.indexOf(term);
      if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
        firstIndex = index;
      }
    }

    if (firstIndex === -1) {
      return rawText.slice(0, SNIPPET_LENGTH) + (rawText.length > SNIPPET_LENGTH ? "…" : "");
    }

    const start = Math.max(0, firstIndex - 35);
    const end = Math.min(rawText.length, firstIndex + SNIPPET_LENGTH);

    return `${start > 0 ? "…" : ""}${rawText.slice(start, end)}${end < rawText.length ? "…" : ""}`;
  }

  function highlightTerms(text, terms) {
    let escaped = escapeHtml(text);

    const uniqueTerms = [...new Set(terms)]
      .filter(term => term.length > 0)
      .sort((a, b) => b.length - a.length);

    for (const term of uniqueTerms) {
      const pattern = new RegExp(`(${escapeRegExp(escapeHtml(term))})`, "gi");
      escaped = escaped.replace(pattern, "<mark>$1</mark>");
    }

    return escaped;
  }

  function renderResults(query) {
    const terms = getTerms(query);

    results.innerHTML = "";

    if (terms.length === 0) {
      status.textContent = "";
      return;
    }

    const matched = searchIndex
      .map(doc => ({
        ...doc,
        score: scoreDocument(doc, terms)
      }))
      .filter(doc => doc.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.date || "").localeCompare(String(a.date || ""));
      })
      .slice(0, MAX_RESULTS);

    if (matched.length === 0) {
      status.textContent = `「${query}」に一致する本文は見つかりませんでした。`;
      return;
    }

    status.textContent = `${matched.length}件見つかりました。`;

    const html = matched.map(doc => {
      const snippet = makeSnippet(doc.text, terms);

      return `
        <article class="search-result-card">
          <h3 class="search-result-title">
            <a href="${escapeHtml(doc.url)}">${highlightTerms(doc.title, terms)}</a>
          </h3>
          <p class="search-result-date">${escapeHtml(doc.date || "")}</p>
          <p class="search-result-snippet">${highlightTerms(snippet, terms)}</p>
          <a class="search-result-link" href="${escapeHtml(doc.url)}">この回を読む</a>
        </article>
      `;
    }).join("");

    results.innerHTML = html;
  }

  function debounceSearch() {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
      await loadIndex();
      renderResults(input.value);
    }, 180);
  }

  input.addEventListener("input", debounceSearch);

  input.addEventListener("focus", async () => {
    await loadIndex();
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    status.textContent = "";
    results.innerHTML = "";
    input.focus();
  });
})();