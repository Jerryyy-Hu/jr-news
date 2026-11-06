"use strict";

const CATEGORY_LABELS = {positive: "利好", negative: "负面", neutral: "中立"};
const state = {manifest: null, editions: new Map(), date: "", category: "all", market: "all", query: "", allDates: false, expanded: false, view: "news"};
const byId = id => document.getElementById(id);
const dayFormatter = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", weekday: "long"});
const refreshAnimations = new Map();

function canAnimate() {
  return document.documentElement.dataset.input !== "keyboard" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopRefreshAnimations() {
  for (const animation of refreshAnimations.values()) animation.cancel();
  refreshAnimations.clear();
}

function animateRefresh(node) {
  if (!node?.animate || !canAnimate()) return;
  const tokens = getComputedStyle(document.documentElement);
  const duration = parseFloat(tokens.getPropertyValue("--motion-change"));
  const easing = tokens.getPropertyValue("--ease-out").trim();
  if (!duration || !easing) return;
  const previous = refreshAnimations.get(node);
  const opacity = previous ? getComputedStyle(node).opacity : 0.82;
  previous?.cancel();
  const animation = node.animate([{opacity}, {opacity: 1}], {duration, easing});
  refreshAnimations.set(node, animation);
  animation.onfinish = () => {
    if (refreshAnimations.get(node) === animation) refreshAnimations.delete(node);
  };
}
const TERM_ALIASES = {
  "供需与产量配额": ["供需", "产量配额", "减产"],
  "结构性再贷款": ["再贷款"],
  "杠杆与保证金": ["杠杆", "保证金", "融资保证金"],
  "全股票收购与企业价值": ["全股票收购", "企业价值"],
  "基点与估值折现": ["基点", "折现", "折现率"],
  "投放、到期与净投放": ["净投放", "资金投放"],
  "JOLTS与利率预期": ["JOLTS", "利率", "利率预期"],
  "ADP与“超预期”": ["ADP", "超预期"],
  "基点与通胀的二次传导": ["通胀", "二次传导"],
  "原油风险溢价与预期定价": ["原油风险溢价", "预期定价"],
  "初请、续请与存量流量": ["初请", "续请", "存量", "流量"],
  "非农就业与失业率的统计口径": ["非农就业", "非农", "失业率"],
  "库存可用天数与供应缓冲": ["库存可用天数", "可用天数", "供应缓冲"],
  "回购授权与每股收益": ["股票回购授权", "股票回购", "回购授权", "每股收益", "回购"]
};
let glossaryEntries = [];
let termTargets = new Map();
let termPattern = null;

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
  return {date: params.get("date"), article: params.get("article"), view: params.get("view"), term: params.get("term")};
}

function setHash(date, article = null, view = "news", term = null, push = false) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (article) params.set("article", article);
  if (view === "learn") params.set("view", "learn");
  if (term) params.set("term", term);
  history[push ? "pushState" : "replaceState"](null, "", `${window.location.pathname}${window.location.search}#${params}`);
}

function knowledgeAliases(knowledge) {
  return [...new Set([knowledge.term, ...knowledge.term.split(/[与、]/u), ...(TERM_ALIASES[knowledge.term] || []), ...(knowledge.aliases || [])])]
    .map(term => term.trim()).filter(term => term.length >= 2);
}

function buildGlossaryIndex() {
  const entries = new Map();
  for (const date of state.manifest.dates) {
    for (const item of state.editions.get(date)?.items || []) {
      if (!item.knowledge?.term) continue;
      const term = item.knowledge.term;
      if (!entries.has(term)) entries.set(term, {knowledge: item.knowledge, aliases: new Set(), stories: new Map()});
      const entry = entries.get(term);
      knowledgeAliases(item.knowledge).forEach(alias => entry.aliases.add(alias));
      entry.stories.set(item.id, {date, item});
    }
  }
  glossaryEntries = [...entries.values()];
  termTargets = new Map(glossaryEntries.map(entry => [entry.knowledge.term.toLocaleLowerCase(), entry]));
  for (const entry of glossaryEntries) {
    for (const alias of entry.aliases) {
      if (!termTargets.has(alias.toLocaleLowerCase())) termTargets.set(alias.toLocaleLowerCase(), entry);
    }
  }
  const labels = [...termTargets.keys()].sort((a, b) => b.length - a.length);
  termPattern = labels.length ? new RegExp(labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu") : null;
  for (const date of state.manifest.dates) {
    for (const item of state.editions.get(date)?.items || []) {
      for (const match of findTerms(articleText(item), item)) match.entry.stories.set(item.id, {date, item});
    }
  }
}

function articleText(item) {
  return [item.title, item.summary, item.analysis, item.knowledge?.explanation, item.knowledge?.example, item.watch, item.caveat].filter(Boolean).join(" ");
}

function findTerms(text, item = null) {
  if (!termPattern) return [];
  termPattern.lastIndex = 0;
  const ownAliases = item?.knowledge ? knowledgeAliases(item.knowledge).map(alias => alias.toLocaleLowerCase()) : [];
  return [...text.matchAll(termPattern)].filter(match => {
    if (!/^[a-z0-9]/i.test(match[0])) return true;
    return !/[a-z0-9]/i.test(text[match.index - 1] || "") && !/[a-z0-9]/i.test(text[match.index + match[0].length] || "");
  }).map(match => ({text: match[0], index: match.index, entry: ownAliases.includes(match[0].toLocaleLowerCase())
    ? termTargets.get(item.knowledge.term.toLocaleLowerCase()) : termTargets.get(match[0].toLocaleLowerCase())}));
}

function glossaryHref(term) {
  return `#${new URLSearchParams({date: state.date, view: "learn", term})}`;
}

function handleInternalLink(event, navigate) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate();
}

function summaryHighlights(item) {
  const text = item.summary;
  const explicit = Array.isArray(item.highlights) ? item.highlights.filter(value => typeof value === "string" && value && text.includes(value)).slice(0, 3) : [];
  if (explicit.length) return explicit.map(value => ({start: text.indexOf(value), end: text.indexOf(value) + value.length}));
  const clauses = [...text.matchAll(/[^，；。！？]+/gu)].map(match => ({text: match[0], start: match.index, end: match.index + match[0].length}));
  if (!clauses.length) return [];
  const impact = clauses.find(clause => /可能|有助于|意味着|显示|有利于|不代表|不等于|但/.test(clause.text));
  const ranges = [{start: clauses[0].start, end: clauses[0].end}];
  if (impact && impact !== clauses[0]) ranges.push({start: impact.start, end: text.replace(/[。！？]+$/u, "").length});
  return ranges;
}

function appendHighlightedText(node, text, start, end, highlights) {
  const boundaries = [...new Set([start, end, ...highlights.flatMap(range => [range.start, range.end]).filter(index => index > start && index < end)])].sort((a, b) => a - b);
  for (let index = 0; index < boundaries.length - 1; index++) {
    const left = boundaries[index];
    const right = boundaries[index + 1];
    const value = text.slice(left, right);
    node.append(highlights.some(range => left >= range.start && right <= range.end) ? createElement("mark", "news-highlight", value) : document.createTextNode(value));
  }
}

function createTermText(tag, className, text, item = null, seen = new Set(), highlights = []) {
  const node = createElement(tag, className);
  let cursor = 0;
  for (const match of findTerms(text, item)) {
    appendHighlightedText(node, text, cursor, match.index, highlights);
    const term = match.entry.knowledge.term;
    const end = match.index + match.text.length;
    if (seen.has(term)) {
      appendHighlightedText(node, text, match.index, end, highlights);
      cursor = end;
      continue;
    }
    seen.add(term);
    const link = createElement("a", "term-link", match.text);
    link.href = glossaryHref(term);
    link.dataset.term = term;
    link.title = `查看金融知识：${term}`;
    link.setAttribute("aria-label", `${match.text}，查看金融知识库：${term}`);
    link.addEventListener("click", event => handleInternalLink(event, () => openGlossaryTerm(term)));
    if (highlights.some(range => match.index >= range.start && end <= range.end)) {
      const mark = createElement("mark", "news-highlight");
      mark.append(link);
      node.append(mark);
    } else node.append(link);
    cursor = end;
  }
  appendHighlightedText(node, text, cursor, text.length, highlights);
  return node;
}

function focusGlossaryTerm(term) {
  requestAnimationFrame(() => {
    const card = document.getElementById(`glossary-${term}`);
    if (!card) return;
    card.classList.add("flash-card");
    card.focus({preventScroll: true});
    card.scrollIntoView({block: "start", behavior: canAnimate() ? "smooth" : "auto"});
  });
}

function openGlossaryTerm(term) {
  byId("glossary-search").value = "";
  setView("learn", false);
  setHash(state.date, null, "learn", term, true);
  focusGlossaryTerm(term);
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
  const archive = byId("archive-dates");
  archive.replaceChildren(fragment);
  window.matchMedia("(max-width: 760px)").addEventListener("change", syncArchiveLayout);
  syncArchiveLayout();
  archive.addEventListener("scroll", updateArchiveFades, {passive: true});
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => revealArchiveDate()).observe(archive);
  } else {
    window.addEventListener("resize", () => revealArchiveDate());
  }
}

function syncArchiveLayout() {
  const archive = byId("archive-dates");
  const horizontal = window.matchMedia("(max-width: 760px)").matches;
  const focused = archive.contains(document.activeElement) ? document.activeElement : null;
  const buttons = [...archive.querySelectorAll(".date-button")];
  const sorted = [...buttons].sort((a, b) => horizontal ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date));
  if (buttons.some((button, index) => button !== sorted[index])) archive.append(...sorted);
  archive.setAttribute("aria-label", horizontal ? "简报日期，从往日至最新，可左右滑动" : "简报日期，从最新到往日，自上而下排列");
  if (focused && document.activeElement !== focused) focused.focus({preventScroll: true});
  revealArchiveDate();
}

function updateArchiveFades() {
  const archive = byId("archive-dates");
  const maxScroll = archive.scrollWidth - archive.clientWidth;
  archive.classList.toggle("has-overflow-before", maxScroll > 1 && archive.scrollLeft > 1);
  archive.classList.toggle("has-overflow-after", maxScroll > 1 && archive.scrollLeft < maxScroll - 1);
}

function revealArchiveDate(smooth = false) {
  const archive = byId("archive-dates");
  const selected = archive.querySelector('[aria-current="date"]');
  const maxScroll = archive.scrollWidth - archive.clientWidth;
  if (selected && maxScroll > 1) {
    const target = selected.offsetLeft - (archive.clientWidth - selected.offsetWidth) / 2;
    archive.scrollTo({
      left: Math.max(0, Math.min(maxScroll, target)),
      behavior: smooth && canAnimate() ? "smooth" : "instant"
    });
  }
  updateArchiveFades();
}

function selectDate(date, article = null, push = false) {
  if (!state.editions.has(date)) return;
  const changed = state.date !== date || state.allDates || state.view !== "news";
  if (article) resetFilters(false);
  state.date = date;
  state.allDates = false;
  byId("search-all-dates").checked = false;
  setView("news", false);
  setHash(date, article, "news", null, push);
  renderEdition(changed);
  if (article) focusArticle(article);
}

function setView(view, updateHash = true) {
  const changed = state.view !== view;
  state.view = view;
  byId("news-view").hidden = view !== "news";
  byId("learn-view").hidden = view !== "learn";
  for (const button of document.querySelectorAll("[data-view]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
  if (view === "learn") renderGlossary();
  if (updateHash) setHash(state.date, null, view);
  if (changed) animateRefresh(byId(`${view}-view`));
}

function renderEdition(smoothArchive = false) {
  const edition = state.editions.get(state.date);
  if (!edition) return;
  byId("header-date").textContent = state.date.replaceAll("-", ".");
  byId("header-weekday").textContent = `${dayFormatter.format(new Date(`${state.date}T12:00:00+08:00`))} · 每日金融简报`;
  byId("edition-title").textContent = `${formatDate(state.date)}，市场在关注什么？`;
  byId("edition-window").textContent = formatWindow(edition);
  byId("outlook-text").replaceChildren(...createTermText("span", "", edition.outlook).childNodes);
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
  revealArchiveDate(smoothArchive);
  renderNews(smoothArchive);
  if (smoothArchive) animateRefresh(document.querySelector(".outlook"));
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
  const seenTerms = new Set();
  const article = createElement("article", `news-card ${item.category}`);
  article.id = `article-${edition.date}-${item.id}`;
  article.dataset.article = item.id;
  const meta = createElement("div", "news-meta");
  const tags = createElement("div", "news-tags");
  tags.append(createElement("span", "sentiment", CATEGORY_LABELS[item.category] || "中立"), createElement("span", "market-tag", (item.markets || []).join(" / ")), createElement("span", "", item.topic));
  meta.append(tags, createElement("span", "news-time", item.timeLabel || formatDate(edition.date)));
  const titleRow = createElement("div", "news-title-row");
  titleRow.append(createElement("span", "article-number", String(index + 1).padStart(2, "0")), createTermText("h3", "", item.title, item, seenTerms));
  const summary = createTermText("p", "news-summary", item.summary, item, seenTerms, summaryHighlights(item));
  const analysis = createElement("div", "analysis");
  analysis.append(createElement("span", "analysis-label", "为什么重要 · 简单解读"), createTermText("p", "", item.analysis, item, seenTerms));
  article.append(meta, titleRow, summary, analysis);
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
    lesson.append(createTermText("p", "", item.knowledge.explanation, item, seenTerms));
    if (item.knowledge.example) lesson.append(createTermText("p", "example", `举个例子：${item.knowledge.example}`, item, seenTerms));
    const conceptLink = createElement("a", "lesson-glossary-link", `在金融知识库中查看「${item.knowledge.term}」 ↗`);
    conceptLink.href = glossaryHref(item.knowledge.term);
    conceptLink.addEventListener("click", event => handleInternalLink(event, () => openGlossaryTerm(item.knowledge.term)));
    lesson.append(conceptLink);
    if (item.watch) {
      const watch = createElement("p", "watch");
      watch.append(createElement("strong", "", "接下来观察"), createTermText("span", "", item.watch, item, seenTerms));
      lesson.append(watch);
    }
    if (item.caveat) lesson.append(createTermText("p", "caveat", `判断边界：${item.caveat}`, item, seenTerms));
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

function renderNews(animate = false) {
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
  if (animate) animateRefresh(byId("news-list"));
}

function renderGlossary() {
  const query = byId("glossary-search").value.trim().toLocaleLowerCase();
  const entries = glossaryEntries.filter(({knowledge, aliases}) => !query || [knowledge.term, knowledge.explanation, knowledge.example, ...aliases].join(" ").toLocaleLowerCase().includes(query));
  const fragment = document.createDocumentFragment();
  entries.forEach(({knowledge, stories}, index) => {
    const card = createElement("article", "glossary-card");
    card.id = `glossary-${knowledge.term}`;
    card.tabIndex = -1;
    card.setAttribute("aria-labelledby", `term-heading-${knowledge.term}`);
    card.append(createElement("span", "eyebrow", "A CONCEPT FROM THE NEWS"), createElement("h2", "", knowledge.term), createElement("p", "", knowledge.explanation));
    card.querySelector("h2").id = `term-heading-${knowledge.term}`;
    if (knowledge.example) card.append(createElement("p", "example", knowledge.example));
    const examples = createElement("div", "concept-stories");
    examples.append(createElement("h3", "", `在新闻中看实例 · ${stories.size} 条`));
    const list = createElement("ul", "concept-story-list");
    for (const {date, item} of [...stories.values()].sort((a, b) => b.date.localeCompare(a.date))) {
      const related = createElement("a", "related-story", `${formatDate(date, true)} · ${item.title} ↗`);
      related.href = `#${new URLSearchParams({date, article: item.id})}`;
      related.addEventListener("click", event => handleInternalLink(event, () => selectDate(date, item.id, true)));
      const row = createElement("li", "");
      row.append(related);
      list.append(row);
    }
    examples.append(list);
    card.append(examples);
    fragment.append(card);
  });
  byId("glossary-list").replaceChildren(fragment);
  byId("glossary-status").textContent = entries.length ? `共 ${entries.length} 个知识点 · 词条下可跳转全部相关新闻实例。` : "没有匹配的知识点，请换一个关键词。";
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
  if (shouldRender) renderNews(true);
}

function focusArticle(id) {
  requestAnimationFrame(() => {
    const edition = state.editions.get(state.date);
    const article = document.getElementById(`article-${edition.date}-${id}`);
    if (!article) return;
    const toggle = article.querySelector(".lesson-toggle");
    if (toggle) setLessonOpen(toggle, byId(toggle.getAttribute("aria-controls")), true);
    article.classList.add("flash-card");
    article.setAttribute("tabindex", "-1");
    article.focus({preventScroll: true});
    article.scrollIntoView({block: "start", behavior: canAnimate() ? "smooth" : "auto"});
  });
}

function bindControls() {
  document.addEventListener("pointerdown", () => {document.documentElement.dataset.input = "pointer";}, {capture: true, passive: true});
  document.addEventListener("keydown", () => {
    document.documentElement.dataset.input = "keyboard";
    stopRefreshAnimations();
  }, {capture: true});
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", stopRefreshAnimations);
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => setView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-category]")) button.addEventListener("click", () => {state.category = button.dataset.category; renderNews(true);});
  byId("search-form").addEventListener("submit", event => event.preventDefault());
  byId("news-search").addEventListener("input", event => {state.query = event.target.value; renderNews();});
  byId("market-filter").addEventListener("change", event => {state.market = event.target.value; renderNews(true);});
  byId("search-all-dates").addEventListener("change", event => {state.allDates = event.target.checked; renderNews(true);});
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
    window.scrollTo({top: 0, behavior: canAnimate() ? "smooth" : "auto"});
  });
  window.addEventListener("hashchange", () => {
    const hash = getHashState();
    if (hash.date && state.editions.has(hash.date)) state.date = hash.date;
    if (hash.article) resetFilters(false);
    renderEdition();
    if (hash.view === "learn") {
      if (hash.term) byId("glossary-search").value = "";
      setView("learn", false);
      if (hash.term) focusGlossaryTerm(hash.term);
    } else {
      setView("news", false);
      if (hash.article) focusArticle(hash.article);
    }
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
    buildGlossaryIndex();
    buildArchive();
    bindControls();
    renderEdition();
    byId("loading").hidden = true;
    if (state.manifest.nextEdition) byId("next-edition").textContent = `下一期：${formatDate(state.manifest.nextEdition)} 22:00`;
    if (state.manifest.updatedAt) {
      const updated = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false}).format(new Date(state.manifest.updatedAt));
      byId("updated-at").textContent = `最近整理：${updated} · 北京时间（UTC+8）`;
    }
    if (hash.view === "learn") {
      setView("learn", false);
      if (hash.term) focusGlossaryTerm(hash.term);
    }
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
