(() => {
  const main = document.querySelector('main');
  if (location.pathname !== '/models' || !main || document.querySelector('.hfx-root')) return;

  const STORE_KEY = 'hfx:filters';
  const DEFAULTS = {
    minDownloads: '',
    minLikes: '',
    maxAgeDays: '',
    hideGated: false,
    exclude: '',
    hideUnknown: true,
  };
  const TEXT_KEYS = ['minDownloads', 'minLikes', 'maxAgeDays', 'exclude'];

  // Hugging Face's own class lists, copied from the matching controls on the models page
  // so the injected section inherits their look (and dark theme) instead of imitating it.
  const HF = {
    block: 'my-6 mr-6',
    header: 'mb-3 flex h-7 items-center',
    title: 'text-sm font-medium text-gray-500',
    // "Reset Parameters"
    reset:
      'ml-auto flex items-center whitespace-nowrap rounded-full border bg-white px-2 py-px text-sm text-gray-600 decoration-gray-300 shadow-sm hover:bg-gray-50 hover:text-gray-800 hover:underline dark:hover:bg-black dark:hover:text-gray-300',
    // "Filter by name"
    input:
      'outline-hidden w-full rounded-full border border-gray-200 text-sm placeholder-gray-400 shadow-inner focus:shadow-xl focus:ring-1 focus:ring-inset dark:bg-gray-950 h-7',
    // "Base only"
    switchLabel:
      'flex cursor-pointer select-none items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
    switchInput: 'peer pointer-events-none hidden',
    switchTrack:
      'relative inline-flex peer-checked:bg-blue-600 peer-checked:hover:bg-blue-600 dark:peer-checked:bg-blue-600 h-3 w-5 peer-checked:[&>div]:translate-x-2 peer-focus-visible:ring-3 cursor-pointer ring-gray-400 hover:bg-gray-400 peer-focus-visible:ring-offset-1 shrink-0 items-center rounded-full bg-gray-300 px-0.5 py-1 shadow-inner transition-all dark:bg-gray-600',
    switchKnob: 'size-2 shadow-xs rounded-full bg-white transition-all dark:bg-white',
    // Slider tick labels
    caption: 'text-xs text-gray-500 dark:text-gray-400',
    button: 'btn rounded-full text-sm',
  };

  function loadState() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be blocked; the filters still work for this page view.
    }
  }

  const state = loadState();
  // Model metadata by repo id, as returned by HF's own listing endpoint.
  const cache = new Map();
  let fetchedUrl = null;
  let fetchDone = false;
  let fetchFailed = false;
  let rechecks = 0;
  let lastUrl = location.href;

  function el(tag, props = {}, ...children) {
    const { attrs = {}, ...rest } = props;
    const node = Object.assign(document.createElement(tag), rest);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  function textInput(placeholder, title) {
    return el('input', { type: 'text', className: HF.input, placeholder, title, autocomplete: 'off', spellcheck: false });
  }

  function captioned(caption, input) {
    return el('label', { className: 'hfx-field' }, el('span', { className: HF.caption, textContent: caption }), input);
  }

  function toggle(label, title) {
    const input = el('input', { type: 'checkbox', className: HF.switchInput });
    const track = el(
      'div',
      { className: HF.switchTrack, tabIndex: 0, attrs: { role: 'switch', 'aria-label': label, 'aria-checked': 'false' } },
      el('div', { className: HF.switchKnob }),
    );
    track.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      input.click();
    });
    const root = el('label', { className: `${HF.switchLabel} hfx-switch`, title }, input, track, el('span', { textContent: label }));
    return {
      root,
      input,
      set(checked) {
        input.checked = checked;
        track.setAttribute('aria-checked', String(checked));
      },
    };
  }

  function block(title, headerExtra, ...body) {
    return el(
      'div',
      { className: HF.block },
      el('div', { className: HF.header }, el('div', { className: HF.title, textContent: title }), ...headerExtra),
      ...body,
    );
  }

  const SIZE_HINT = 'Accepts 500M, 8B, 1.5e9 or a plain number';
  const inputs = {
    min: textInput('Min', SIZE_HINT),
    max: textInput('Max, e.g. 8B', SIZE_HINT),
    minDownloads: textInput('e.g. 10k', 'Hide models with fewer downloads in the last 30 days'),
    minLikes: textInput('e.g. 100', 'Hide models with fewer likes'),
    maxAgeDays: textInput('e.g. 30', 'Hide models not updated within this many days'),
    exclude: textInput('gguf, lora', 'Comma-separated. Hides models whose author/name contains any of them'),
  };
  const hideUnknown = toggle('Hide unknown size', 'Repos with no reported parameter count otherwise pass any maximum');
  const hideGated = toggle('Hide gated', 'Hide models that ask you to accept terms before downloading');
  const resetButton = el('button', { type: 'button', className: HF.reset }, ' Reset');
  const status = el('div', { className: `${HF.caption} hfx-status` });

  // Sent to HF as a query parameter, so sorting, counts and pagination stay correct.
  const rangeForm = el(
    'form',
    { className: 'hfx-range' },
    inputs.min,
    el('span', { className: HF.caption, textContent: '–' }),
    inputs.max,
    el('button', { type: 'submit', className: `${HF.button} hfx-apply`, textContent: 'Apply' }),
  );

  // Applied in the browser to the cards of the current page.
  const refineGrid = el(
    'div',
    { className: 'hfx-grid' },
    captioned('Min downloads', inputs.minDownloads),
    captioned('Min likes', inputs.minLikes),
    captioned('Updated within (days)', inputs.maxAgeDays),
    captioned('Name excludes', inputs.exclude),
  );

  const root = el(
    'div',
    { className: 'hfx-root' },
    block('Parameter range', [], rangeForm, hideUnknown.root),
    block('Refine this page', [resetButton], refineGrid, hideGated.root, status),
  );

  function syncRangeFromUrl() {
    const hasFilter = new URLSearchParams(location.search).has('num_parameters');
    const { min, max } = HFX.readParamRange(location.search);
    // min:1 is how "hide unknown size" is expressed, so don't show it as a bound.
    const hidesUnknown = min === 1;
    if (document.activeElement !== inputs.min) inputs.min.value = min === null || hidesUnknown ? '' : HFX.formatSize(min);
    if (document.activeElement !== inputs.max) inputs.max.value = max === null ? '' : HFX.formatSize(max);
    hideUnknown.set(hasFilter ? hidesUnknown : state.hideUnknown);
    inputs.min.classList.remove('hfx-invalid');
    inputs.max.classList.remove('hfx-invalid');
  }

  function syncRefineFromState() {
    for (const key of TEXT_KEYS) {
      inputs[key].value = state[key];
      inputs[key].classList.remove('hfx-invalid');
    }
    hideGated.set(state.hideGated);
  }

  function applyRange() {
    let min = HFX.parseSize(inputs.min.value);
    const max = HFX.parseSize(inputs.max.value);
    const minBad = Number.isNaN(min);
    const maxBad = Number.isNaN(max) || (max !== null && min !== null && !minBad && max < min);
    inputs.min.classList.toggle('hfx-invalid', minBad);
    inputs.max.classList.toggle('hfx-invalid', maxBad);
    if (minBad || maxBad) return;

    state.hideUnknown = hideUnknown.input.checked;
    saveState();
    // Unknown sizes are reported as 0, so they only matter while there is a filter at all.
    const filtering = min !== null || max !== null;
    if (filtering && state.hideUnknown && !(min >= 1)) min = 1;
    const search = HFX.writeParamRange(location.search, { min, max });
    if (search !== location.search) location.assign(location.pathname + search);
  }

  function cardId(card) {
    const href = card.querySelector('a[href^="/"]')?.getAttribute('href');
    if (!href) return null;
    try {
      return decodeURIComponent(href.slice(1).split(/[?#]/)[0]);
    } catch {
      return null;
    }
  }

  function seedCacheFromPage() {
    try {
      const props = JSON.parse(document.querySelector('[data-target="ModelList"]')?.dataset.props ?? 'null');
      for (const model of props?.initialValues?.models ?? []) cache.set(model.id, model);
    } catch {
      // Falls back to fetching the listing.
    }
  }

  async function fetchListing() {
    const url = location.href;
    fetchedUrl = url;
    fetchDone = false;
    fetchFailed = false;
    try {
      const response = await fetch(`/models-json${location.search}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const model of data.models ?? []) cache.set(model.id, model);
    } catch (error) {
      console.warn('[Huggingface Model Filters] could not load model metadata:', error);
      if (fetchedUrl === url) fetchFailed = true;
    }
    if (fetchedUrl === url) fetchDone = true;
    applyRefine();
  }

  function applyRefine() {
    const filters = HFX.compileFilters(state);
    const now = Date.now();
    let total = 0;
    let hidden = 0;
    let missing = 0;
    for (const card of main.querySelectorAll('article')) {
      const id = cardId(card);
      if (!id) continue;
      const model = cache.get(id);
      if (!model) missing++;
      const hide = filters.active && !HFX.matches(model ?? { id }, filters, now);
      card.toggleAttribute('data-hfx-hidden', hide);
      total++;
      if (hide) hidden++;
    }

    const unresolved = filters.needsData && missing > 0;
    if (unresolved && fetchedUrl !== location.href) fetchListing();
    // The list can be swapped a moment before the URL changes; look again a few times.
    else if (unresolved && fetchDone && rechecks < 3) {
      rechecks++;
      scheduleRefresh(700);
    }

    let message = '';
    if (unresolved && fetchFailed) message = "Couldn't load model data for this page";
    else if (unresolved && !fetchDone) message = 'Loading…';
    else if (hidden > 0) message = `${hidden} of ${total} hidden on this page`;
    // Only touch the DOM on change, the observer below would see it otherwise.
    if (status.textContent !== message) status.textContent = message;
    resetButton.classList.toggle('invisible', !filters.active);
  }

  // The slider only exists on the sidebar's "Main" tab; the section lives right below it.
  function findParametersBlock() {
    return main.querySelector('input[type="range"]')?.closest('label')?.parentElement ?? null;
  }

  function place() {
    const anchor = findParametersBlock();
    if (!anchor) {
      root.remove();
      return;
    }
    if (root.previousElementSibling !== anchor) anchor.after(root);
    if (!resetButton.querySelector('svg')) {
      const icon = anchor.querySelector('button svg')?.cloneNode(true);
      if (icon) resetButton.prepend(icon);
    }
  }

  // HF's server-rendered markup carries "[" comment markers until its app has taken over.
  // Adding nodes before that would make it throw the sidebar away and render it again.
  function appOwnsDom() {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_COMMENT);
    for (let i = 0; i < 200 && walker.nextNode(); i++) {
      if (walker.currentNode.data.startsWith('[')) return false;
    }
    return true;
  }

  let mounted = false;
  const startedAt = Date.now();
  function refresh() {
    if (!mounted && (appOwnsDom() || Date.now() - startedAt > 5000)) mounted = true;
    if (mounted) place();
    else scheduleRefresh(150);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      rechecks = 0;
      syncRangeFromUrl();
    }
    applyRefine();
  }

  let refreshTimer = null;
  function scheduleRefresh(delay = 60) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  rangeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyRange();
  });

  hideUnknown.input.addEventListener('change', () => {
    hideUnknown.set(hideUnknown.input.checked);
    // Takes effect immediately when a range is already applied.
    if (new URLSearchParams(location.search).has('num_parameters')) applyRange();
    else {
      state.hideUnknown = hideUnknown.input.checked;
      saveState();
    }
  });

  function onRefineInput() {
    for (const key of TEXT_KEYS) state[key] = inputs[key].value;
    state.hideGated = hideGated.input.checked;
    hideGated.set(state.hideGated);
    for (const key of ['minDownloads', 'minLikes', 'maxAgeDays']) {
      inputs[key].classList.toggle('hfx-invalid', Number.isNaN(HFX.parseSize(state[key])));
    }
    saveState();
    scheduleRefresh();
  }
  refineGrid.addEventListener('input', onRefineInput);
  hideGated.input.addEventListener('change', onRefineInput);

  resetButton.addEventListener('click', () => {
    Object.assign(state, { ...DEFAULTS, hideUnknown: state.hideUnknown });
    saveState();
    syncRefineFromState();
    applyRefine();
  });

  // HF swaps the list in place and updates the URL when a native filter, sort or page changes,
  // and rebuilds the sidebar when its tabs are switched.
  new MutationObserver((mutations) => {
    if (mutations.some((mutation) => !root.contains(mutation.target))) scheduleRefresh();
  }).observe(main, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href'],
  });
  window.addEventListener('popstate', () => scheduleRefresh());
  window.navigation?.addEventListener('navigatesuccess', () => scheduleRefresh());

  seedCacheFromPage();
  syncRangeFromUrl();
  syncRefineFromState();
  refresh();
})();
