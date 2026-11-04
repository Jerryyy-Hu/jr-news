"use strict";

const CATEGORY_LABELS = {positive: "利好", negative: "负面", neutral: "中立"};
const state = {manifest: null, editions: new Map(), date: "", category: "all", market: "all", query: "", allDates: false, expanded: false, view: "news"};
const byId = id => document.getElementById(id);
const dayFormatter = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", weekday: "long"});

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function formatDate(date, year = false) {
  const [yyyy, month, day] = date.split("-");
  return year ? `${yyyy}年${Number(month)}月${Number(day)}日` : `${Number(month)}月${Number(day)}日`;
}

function formatWindow(edition) {
  const label = value => {
    const parsed = new Date(value);
    return new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false}).format(parsed);
  };
  return `${label(edition.windowStart)} — ${label(edition.windowEnd)} · 北京时间`;
}

function getHashState() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {date: params.get("date"), article: params.get("article"), view: params.get("view")};
}

function setHash(date, article = null, view = "news") {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (article) params.set("article", article);
  if (view === "learn") params.set("view", "learn");
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${params}`);
}

function showNotice(message) {
  byId("notice").textContent = message;
  byId("notice").hidden = !message;
}

async function fetchJson(path) {
  const response = await fetch(path, {cache: "no-cache"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildArchive() {
  const fragment = document.createDocumentFragment();
  for (const date of state.manifest.dates) {
    const edition = state.editions.get(date);
    const button = createElement("button", "date-button");
    button.type = "button";
    button.dataset.date = date;
    button.setAttribute("aria-label", `${formatDate(date, true)}的简报${edition ? `，${edition.items.length}条消息` : "，暂不可用"}`);
    button.disabled = !edition;
    const label = createElement("span", "date-button-main");
    label.append(createElement("span", "date-numeral", date.slice(5).replace("-", ".")), createElement("span", "date-weekday", dayFormatter.format(new Date(`${date}T12:00:00+08:00`)).replace("星期", "周")));
    const count = createElement("span", "date-count");
    count.append(createElement("span", "", edition ? `${edition.items.length} 条消息` : "加载失败"));
    if (date === state.manifest.latestDate) count.append(createElement("span", "", " · 最新"));
    button.append(label, count);
    button.addEventListener("click", () => selectDate(date));
    fragment.append(button);
  }
  byId("archive-dates").replaceChildren(fragment);
}

function selectDate(date, article = null) {
  if (!state.editions.has(date)) return;
  if (article) resetFilters(false);
  state.date = date;
  state.allDates = false;
  byId("search-all-dates").checked = false;
  setView("news", false);
  setHash(date, article);
  renderEdition();
  if (article) focusArticle(article);
}

function setView(view, updateHash = true) {
  state.view = view;
  byId("news-view").hidden = view !== "news";
  byId("learn-view").hidden = view !== "learn";
  for (const button of document.querySelectorAll("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
  if (view === "learn") renderGlossary();
  if (updateHash) setHash(state.date, null, view);
}

function renderEdition() {
  const edition = state.editions.get(state.date);
  if (!edition) return;
  byId("header-date").textContent = state.date.replaceAll("-", ".");
  byId("header-weekday").textContent = `${dayFormatter.format(new Date(`${state.date}T12:00:00+08:00`))} · 每日金融简报`;
  byId("edition-title").textContent = `${formatDate(state.date)}，市场在关注什么？`;
  byId("edition-window").textContent = formatWindow(edition);
  byId("outlook-text").textContent = edition.outlook;
  byId("coverage-text").textContent = edition.coverageNote || "新闻按公开发布时间纳入本期，市场影响为分析判断。";
  byId("backfill-note").textContent = edition.backfilled ? "本期为历史补录：按当时已公开的信息整理；后续结果不倒填为当日已知事实。" : "消息按截止时点整理，已发生的市场表现与后续可能影响分别说明。";
  byId("coverage").hidden = false;
  for (const button of document.querySelectorAll("[data-date]")) {
    if (button.dataset.date === state.date) button.setAttribute("aria-current", "date");
    else button.removeAttribute("aria-current");
  }
  const available = state.manifest.dates.filter(date => state.editions.has(date));
  const index = available.indexOf(state.date);
  byId("previous-date").disabled = index === available.length - 1;
  byId("next-date").disabled = index <= 0;
  renderNews();
}

function searchableText(item) {
  return [item.title, item.summary, item.analysis, item.topic, ...(item.markets || []), item.knowledge?.term, item.knowledge?.explanation, item.knowledge?.example, item.watch].filter(Boolean).join(" ").toLocaleLowerCase();
}

function getFilteredGroups() {
  const dates = state.allDates ? state.manifest.dates : [state.date];
  const query = state.query.trim().toLocaleLowerCase();
  return dates.map(date => {
    const edition = state.editions.get(date);
    return {date, edition, items: (edition?.items || []).filter(item => (state.category === "all" || item.category === state.category) && (state.market === "all" || item.markets?.includes(state.market)) && (!query || searchableText(item).includes(query)))};
  }).filter(group => group.items.length);
}

function setLessonOpen(button, panel, isOpen) {
  button.setAttribute("aria-expanded", String(isOpen));
  panel.classList.toggle("is-open", isOpen);
  panel.inert = !isOpen;
  panel.setAttribute("aria-hidden", String(!isOpen));
}

function createNewsCard(item, edition, index) {
  const article = createElement("article", `news-card ${item.category} enter-card`);
  article.id = `article-${edition.date}-${item.id}`;
  article.dataset.article = item.id;
  article.style.setProperty("--delay", `${Math.min(index, 5) * 35}ms`);
  const meta = createElement("div", "news-meta");
  const tags = createElement("div", "news-tags");
  tags.append(createElement("span", "sentiment", CATEGORY_LABELS[item.category] || "中立"), createElement("span", "market-tag", (item.markets || []).join(" / ")), createElement("span", "", item.topic));
  meta.append(tags, createElement("span", "news-time", item.timeLabel || formatDate(edition.date)));
  const titleRow = createElement("div", "news-title-row");
  titleRow.append(createElement("span", "article-number", String(index + 1).padStart(2, "0")), createElement("h3", "", item.title));
  const analysis = createElement("div", "analysis");
  analysis.append(createElement("span", "analysis-label", "为什么重要 · 简单解读"), createElement("p", "", item.analysis));
  article.append(meta, titleRow, createElement("p", "news-summary", item.summary), analysis);
  if (item.knowledge?.term) {
    const lessonId = `lesson-${edition.date}-${item.id}`;
    const toggle = createElement("button", "lesson-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-controls", lessonId);
    toggle.setAttribute("aria-label", `金融知识：${item.knowledge.term}，展开或收起讲解`);
    toggle.append(createElement("span", "lesson-tag", "金融小课堂"), createElement("span", "lesson-term", item.knowledge.term), createElement("span", "lesson-icon", "＋"));
    const panel = createElement("div", "lesson-panel");
    panel.id = lessonId;
    const inner = createElement("div", "lesson-inner");
    const lesson = createElement("div", "lesson-content");
    lesson.append(createElement("p", "", item.knowledge.explanation));
    if (item.knowledge.example) lesson.append(createElement("p", "example", `举个例子：${item.knowledge.example}`));
    if (item.watch) {
      const watch = createElement("p", "watch");
      watch.append(createElement("strong", "", "接下来观察"), createElement("span", "", item.watch));
      lesson.append(watch);
    }
    if (item.caveat) lesson.append(createElement("p", "caveat", `判断边界：${item.caveat}`));
    inner.append(lesson);
    panel.append(inner);
    setLessonOpen(toggle, panel, state.expanded);
    toggle.addEventListener("click", () => setLessonOpen(toggle, panel, toggle.getAttribute("aria-expanded") !== "true"));
    article.append(toggle, panel);
  }
  const bottom = createElement("div", "news-bottom");
  const sources = createElement("div", "source-links");
  sources.append(createElement("span", "", "消息来源"));
  for (const source of item.sources || []) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") continue;
      const link = createElement("a", "", `${source.name} ↗`);
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = source.verification === "search_excerpt" ? "根据检索摘要核对，原文待复核" : "已读取来源正文";
      if (source.verification === "search_excerpt") link.append(createElement("span", "source-note", " · 摘要"));
      sources.append(link);
    } catch {
      continue;
    }
  }
  if (item.sources?.length && item.sources.every(source => source.verification === "search_excerpt")) sources.append(createElement("span", "source-note", "依据检索摘要，原文待复核"));
  const permalink = createElement("button", "permalink", "定位此条 ↗");
  permalink.type = "button";
  permalink.setAttribute("aria-label", `生成「${item.title}」的定位链接`);
  permalink.addEventListener("click", () => {
    setHash(edition.date, item.id);
    permalink.textContent = "地址已定位 ✓";
    article.classList.remove("flash-card");
    requestAnimationFrame(() => article.classList.add("flash-card"));
  });
  bottom.append(sources, permalink);
  article.append(bottom);
  return article;
}

function renderNews() {
  const groups = getFilteredGroups();
  const fragment = document.createDocumentFragment();
  let total = 0;
  for (const group of groups) {
    const section = createElement("section", "news-group");
    if (state.allDates) {
      const heading = createElement("div", "group-date");
      heading.append(createElement("h2", "", formatDate(group.date, true)), createElement("span", "", `${group.items.length} 条重要消息`));
      section.append(heading);
    }
    group.items.forEach((item, index) => section.append(createNewsCard(item, group.edition, index)));
    total += group.items.length;
    fragment.append(section);
  }
  byId("news-list").replaceChildren(fragment);
  byId("empty-state").hidden = total > 0;
  const baseItems = (state.allDates ? [...state.editions.values()] : [state.editions.get(state.date)]).flatMap(edition => edition?.items || []);
  byId("count-all").textContent = baseItems.length;
  for (const category of Object.keys(CATEGORY_LABELS)) byId(`count-${category}`).textContent = baseItems.filter(item => item.category === category).length;
  byId("results-status").textContent = `${state.allDates ? "全部日期" : "本期简报"} · 显示 ${total} 条消息${state.allDates ? ` / ${groups.length} 个日期` : ""}`;
  byId("clear-filters").hidden = state.category === "all" && state.market === "all" && !state.query && !state.allDates;
  for (const button of document.querySelectorAll("[data-category]")) button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
}

function renderGlossary() {
  const seen = new Set();
  const entries = [];
  const query = byId("glossary-search").value.trim().toLocaleLowerCase();
  for (const date of state.manifest.dates) {
    for (const item of state.editions.get(date)?.items || []) {
      const knowledge = item.knowledge;
      if (!knowledge?.term || seen.has(knowledge.term)) continue;
      seen.add(knowledge.term);
      if (query && ![knowledge.term, knowledge.explanation, knowledge.example].join(" ").toLocaleLowerCase().includes(query)) continue;
      entries.push({date, item, knowledge});
    }
  }
  const fragment = document.createDocumentFragment();
  entries.forEach(({date, item, knowledge}, index) => {
    const card = createElement("article", "glossary-card enter-card");
    card.style.setProperty("--delay", `${Math.min(index, 5) * 35}ms`);
    card.append(createElement("span", "eyebrow", "A CONCEPT FROM THE NEWS"), createElement("h2", "", knowledge.term), createElement("p", "", knowledge.explanation));
    if (knowledge.example) card.append(createElement("p", "example", knowledge.example));
    const related = createElement("button", "related-story", `${formatDate(date)} · ${item.title} ↗`);
    related.type = "button";
    related.addEventListener("click", () => {
      resetFilters(false);
      state.expanded = true;
      syncExpandButton();
      selectDate(date, item.id);
    });
    card.append(related);
    fragment.append(card);
  });
  byId("glossary-list").replaceChildren(fragment);
  byId("glossary-status").textContent = entries.length ? `共 ${entries.length} 个知识点 · 点击相关新闻，可以回到实际案例。` : "没有匹配的知识点，请换一个关键词。";
}

function syncExpandButton() {
  const button = byId("expand-lessons");
  button.setAttribute("aria-pressed", String(state.expanded));
  button.replaceChildren(document.createTextNode(state.expanded ? "收起全部知识讲解 " : "展开全部知识讲解 "), createElement("span", "", state.expanded ? "−" : "＋"));
}

function resetFilters(shouldRender = true) {
  Object.assign(state, {query: "", category: "all", market: "all", allDates: false});
  byId("news-search").value = "";
  byId("market-filter").value = "all";
  byId("search-all-dates").checked = false;
  if (shouldRender) renderNews();
}

function focusArticle(id) {
  requestAnimationFrame(() => {
    const edition = state.editions.get(state.date);
    const article = document.getElementById(`article-${edition.date}-${id}`);
    if (!article) return;
    article.classList.add("flash-card");
    article.setAttribute("tabindex", "-1");
    article.focus({preventScroll: true});
    article.scrollIntoView({block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  });
}

function bindControls() {
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => setView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-category]")) button.addEventListener("click", () => {state.category = button.dataset.category; renderNews();});
  byId("search-form").addEventListener("submit", event => event.preventDefault());
  byId("news-search").addEventListener("input", event => {state.query = event.target.value; renderNews();});
  byId("market-filter").addEventListener("change", event => {state.market = event.target.value; renderNews();});
  byId("search-all-dates").addEventListener("change", event => {state.allDates = event.target.checked; renderNews();});
  byId("glossary-search").addEventListener("input", renderGlossary);
  byId("clear-filters").addEventListener("click", () => resetFilters());
  byId("empty-reset").addEventListener("click", () => resetFilters());
  byId("expand-lessons").addEventListener("click", () => {
    state.expanded = !state.expanded;
    syncExpandButton();
    for (const button of document.querySelectorAll(".lesson-toggle")) setLessonOpen(button, byId(button.getAttribute("aria-controls")), state.expanded);
  });
  const moveDate = offset => {
    const dates = state.manifest.dates.filter(date => state.editions.has(date));
    const next = dates[dates.indexOf(state.date) + offset];
    if (next) selectDate(next);
  };
  byId("previous-date").addEventListener("click", () => moveDate(1));
  byId("next-date").addEventListener("click", () => moveDate(-1));
  for (const link of document.querySelectorAll('a[href="#"]')) link.addEventListener("click", event => {
    event.preventDefault();
    if (link.classList.contains("brand") || link.classList.contains("footer-brand")) {
      resetFilters(false);
      selectDate(state.manifest.latestDate);
    }
    window.scrollTo({top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  });
  window.addEventListener("hashchange", () => {
    const hash = getHashState();
    if (hash.date && state.editions.has(hash.date)) selectDate(hash.date, hash.article);
    if (hash.view === "learn") setView("learn", false);
  });
}

async function initialize() {
  try {
    const bundle = window.__JR_NEWS_BUNDLE__;
    state.manifest = bundle?.manifest || await fetchJson("./data/index.json");
    if (!Array.isArray(state.manifest.dates) || !state.manifest.dates.length || !state.manifest.dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error("Invalid archive manifest");
    state.manifest.dates = [...new Set(state.manifest.dates)].sort().reverse();
    const results = await Promise.allSettled(state.manifest.dates.map(async date => {
      const edition = bundle?.editions?.[date] || await fetchJson(`./data/${date}.json`);
      if (edition.date !== date || !Array.isArray(edition.items)) throw new Error("Invalid edition data");
      state.editions.set(date, edition);
    }));
    if (!state.editions.size) throw new Error("No available editions");
    const failures = results.filter(result => result.status === "rejected").length;
    if (failures) showNotice(`有 ${failures} 期简报暂时无法载入，当前显示已成功读取的内容；可以稍后刷新重试。`);
    const hash = getHashState();
    state.date = state.editions.has(hash.date) ? hash.date : state.editions.has(state.manifest.latestDate) ? state.manifest.latestDate : state.manifest.dates.find(date => state.editions.has(date));
    buildArchive();
    bindControls();
    renderEdition();
    byId("loading").hidden = true;
    if (state.manifest.nextEdition) byId("next-edition").textContent = `下一期：${formatDate(state.manifest.nextEdition)} 22:00`;
    if (state.manifest.updatedAt) {
      const updated = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false}).format(new Date(state.manifest.updatedAt));
      byId("updated-at").textContent = `最近整理：${updated} · 北京时间（UTC+8）`;
    }
    if (hash.view === "learn") setView("learn", false);
    if (hash.article) focusArticle(hash.article);
  } catch (error) {
    byId("loading").hidden = true;
    byId("results-status").textContent = "简报暂时无法载入";
    byId("outlook-text").textContent = "内容暂时无法读取，请稍后刷新页面。";
    showNotice("未能读取新闻归档。请检查网络后刷新；如果是本地文件，请通过网页预览服务打开。" );
    console.error("JR News archive could not be loaded:", error.message);
  }
}

initialize();
