/* Dedicated mobile presentation. Shared data flows are supplied by shared/. */
(function () {
  'use strict';
  const originalRender = render;
  const originalCategoryControls = categoryControlsHTML;
  let menuOpen = false;
  let catalogRequest = 0;
  let searchFocus = null;

  const paths = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    recipes: '<path d="M4 3v6q0 3 3 3t3-3V3M7 3v18M18 3q-4 4-4 9h5M19 3v18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2M12 17h2"/>',
    cart: '<path d="M2 3h3l3 13h11l3-10H6"/><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>',
    profile: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
    grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    play: '<path d="m8 4 12 8-12 8z"/>',
    settings: '<path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    logout: '<path d="M9 3H4v18h5M10 12h11m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    leaf: '<path d="M20 3C9 2 3 8 5 15s14 5 15-12ZM4 21 16 7M8 17v-5M12 13h5"/>'
  };
  function icon(name) {
    return '<svg class="m-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.recipes) + '</svg>';
  }
  function routeButton(route, name, symbol, cls = '') {
    return '<button type="button" class="' + cls + '" data-m-route="' + route + '">' + icon(symbol) + '<span>' + name + '</span></button>';
  }
  function brand() {
    return '<span class="m-wordmark">Pot &amp; Thyme</span><img src="/assets/thyme-sprig.png" alt="" width="26" height="36">';
  }
  function header() {
    return '<header class="m-header"><button type="button" class="m-icon-button" data-m-menu aria-label="Άνοιγμα μενού" aria-controls="mobile-menu" aria-expanded="false">' + icon('menu') + '</button><button type="button" class="m-brand" data-m-route="home" aria-label="Pot & Thyme — Αρχική">' + brand() + '</button><button type="button" class="m-icon-button" data-m-search-focus aria-label="Αναζήτηση συνταγών">' + icon('search') + '</button><button type="button" class="m-icon-button m-account" data-m-route="profile" aria-label="Προφίλ">' + icon('profile') + '</button></header>';
  }
  function search() {
    return '<form class="m-search" role="search"><label class="m-sr-only" for="mobile-search">Αναζήτηση συνταγών, υλικών ή κουζίνας</label>' + icon('search') + '<input id="mobile-search" type="search" value="' + E(S.search) + '" placeholder="Αναζήτησε συνταγές, υλικά ή κουζίνες…" autocomplete="off" enterkeyhint="search"><button type="submit" class="m-sr-only">Αναζήτηση</button></form>';
  }
  function categoryIcon(label) {
    if (/Πρωιν/.test(label)) return 'sun';
    if (/Βραδιν/.test(label)) return 'moon';
    if (/Σνακ|Λαδ|Όσπρ/.test(label)) return 'leaf';
    return 'recipes';
  }
  function categories() {
    // Use the same database taxonomy as the catalogue; no mock categories.
    const meals = recipeCategories();
    return '<nav class="m-categories" aria-label="Κατηγορίες συνταγών"><button type="button" class="m-category active" data-m-meal="" aria-label="Όλες οι κατηγορίες">' + icon('grid') + '<span>Όλα</span></button>' + meals.map(meal => '<button type="button" class="m-category" data-m-meal="' + E(meal) + '">' + icon(categoryIcon(meal)) + '<span>' + E(meal) + '</span></button>').join('') + '</nav>';
  }
  categoryControlsHTML = function () {
    const html = originalCategoryControls();
    return html.replace('<select id="meal-filter">', '<select id="meal-filter"><option value=""' + (!S.tab ? ' selected' : '') + '>Όλες οι κατηγορίες</option>');
  };
  function quickActions() {
    return '<section class="m-section"><h2>Γρήγορες ενέργειες</h2><div class="m-quick-grid">' +
      routeButton('fridge', 'Τι μαγειρεύω;', 'play', 'm-quick m-orange') +
      routeButton('shop', 'Λίστα αγορών', 'cart', 'm-quick m-olive') +
      routeButton('plan', 'Το πλάνο μου', 'calendar', 'm-quick') +
      routeButton('new', 'Νέα συνταγή', 'plus', 'm-quick') + '</div></section>';
  }
  function photoURL(row) {
    if (row.photo_url === null) return '';
    const candidate = recipeImage(row) || recipeImage(S.detailCache?.[row.id]) || '';
    try { const url = new URL(candidate, location.origin); if (candidate && (url.protocol === 'https:' || url.origin === location.origin)) return url.href; } catch (_) {}
    return '';
  }
  function recipeCard(row) {
    const photo = photoURL(row);
    const time = (+row.prep_minutes || 0) + (+row.cook_minutes || 0);
    return '<article class="m-recipe-card"><button type="button" class="m-recipe-open" data-open="' + E(row.id) + '" aria-label="Προβολή: ' + E(row.title) + '"><div class="m-recipe-media' + (photo ? '' : ' m-no-photo') + '">' +
      (photo ? '<img src="' + E(photo) + '" alt="' + E(row.title) + '" loading="lazy" width="300" height="220">' : '<img src="/assets/thyme-branch.png" alt="" width="60" height="84"><span>' + E(row.subcategory || row.meal || 'Συνταγή') + '</span>') +
      '</div><h3>' + E(row.title) + '</h3></button><div class="m-recipe-meta"><span>' + icon('clock') + (time ? E(time) + '′' : 'Συνταγή') + '</span><button type="button" class="m-card-add" data-add="' + E(row.id) + '" aria-label="Προσθήκη στο πλάνο: ' + E(row.title) + '">' + icon('plus') + '</button></div></article>';
  }
  function recipeSection(title, rows, id) {
    if (!rows.length) return '';
    return '<section class="m-section" id="' + id + '"><div class="m-section-head"><h2>' + title + '</h2><button type="button" data-m-route="recipes">Προβολή όλων ' + icon('arrow') + '</button></div><div class="m-recipe-scroll">' + rows.map(recipeCard).join('') + '</div></section>';
  }
  function shortcuts() {
    const remaining = (S.shopping || []).filter(item => !item.checked).length;
    return '<div class="m-shortcuts"><button type="button" class="m-shortcut m-olive" data-m-route="shop">' + icon('cart') + '<span><b>Λίστα αγορών</b><small>' + (remaining ? remaining + ' υλικά στη λίστα' : 'Η λίστα σου είναι άδεια') + '</small></span>' + icon('arrow') + '</button><button type="button" class="m-shortcut m-warm" data-m-route="new">' + icon('plus') + '<span><b>Η συνταγή σου</b><small>Μοιράσου τη μαζί μας</small></span>' + icon('arrow') + '</button></div>';
  }
  function weeklyPlan() {
    const days = planWeekDays();
    const keys = new Set(days.map(day => day.key));
    const today = days.find(day => day.today).key;
    const filled = new Set((S.plan || []).map(item => String(item.plan_date || today).slice(0, 10)).filter(key => keys.has(key))).size;
    return '<section class="m-week-panel" aria-labelledby="mobile-week-title"><div class="m-week-summary">' + icon('calendar') + '<div><h2 id="mobile-week-title">Πλάνο εβδομάδας</h2><p>' + filled + ' / 7 ημέρες με συνταγή</p><progress value="' + filled + '" max="7" aria-label="Ημέρες με επιλεγμένη συνταγή"></progress></div><img src="/assets/thyme-sprig.png" alt="" width="34" height="46"><button type="button" class="m-icon-button" data-m-route="plan" aria-label="Άνοιγμα εβδομαδιαίου πλάνου">' + icon('arrow') + '</button></div>' + planHTML() + '</section>';
  }
  homeViewHTML = function () {
    const pool = homePoolRows();
    const ids = new Set(pool.map(row => String(row.id)));
    let picks = (S.homeRecipes || []).filter(row => ids.has(String(row.id)));
    if (picks.length !== Math.min(4, pool.length)) S.homeRecipes = picks = shuffleRows(pool).slice(0, 4);
    const recent = (S.recentCommunity || []).filter(row => row.id && row.title);
    return '<main class="workspace-inner m-home">' + search() + categories() + quickActions() +
      recipeSection('Πρόσφατες από την κοινότητα', recent, 'mobile-community') +
      recipeSection('Ιδέες για σήμερα', picks, 'mobile-picks') +
      (!pool.length ? '<p class="m-home-empty">Οι συνταγές θα εμφανιστούν εδώ μόλις φορτωθούν.</p>' : '') +
      shortcuts() + weeklyPlan() + (S.status ? '<div class="status" role="status">' + E(S.status) + '</div>' : '') + '</main>';
  };
  function bottomNav() {
    const active = S.privacyOpen ? 'profile' : S.view;
    return '<nav class="m-bottom-nav" aria-label="Βασική πλοήγηση">' +
      [['home','Αρχική','home'],['recipes','Συνταγές','recipes'],['plan','Πλάνο','calendar'],['profile','Προφίλ','profile']].map(([route, label, symbol]) => '<button type="button" data-m-route="' + route + '" class="' + (active === route ? 'active' : '') + '"' + (active === route ? ' aria-current="page"' : '') + '>' + icon(symbol) + '<span>' + label + '</span></button>').join('') + '</nav>';
  }
  function drawer() {
    const admin = S.isAdmin ? routeButton('moderation', 'Έγκριση συνταγών', 'check', 'm-menu-link') : '';
    return '<div class="m-drawer-root"><div class="m-drawer-shade" data-m-dismiss></div><section class="m-drawer" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Μενού εφαρμογής"><div class="m-drawer-head"><div class="m-brand">' + brand() + '</div><button type="button" class="m-icon-button" data-m-dismiss aria-label="Κλείσιμο μενού">' + icon('close') + '</button></div><nav aria-label="Όλες οι ενότητες">' +
      routeButton('home','Αρχική','home','m-menu-link') + routeButton('discover','Ανακάλυψε','search','m-menu-link') + routeButton('recipes','Οι συνταγές','recipes','m-menu-link') + routeButton('plan','Πλάνο εβδομάδας','calendar','m-menu-link') + routeButton('shop','Λίστα αγορών','cart','m-menu-link') + routeButton('fridge','Τι έχω στο ψυγείο;','play','m-menu-link') + routeButton('new','Νέα συνταγή','plus','m-menu-link') + admin + '<div class="m-menu-divider"></div>' + routeButton('profile','Λογαριασμός & Ρυθμίσεις','settings','m-menu-link') + routeButton('logout','Αποσύνδεση','logout','m-menu-link') + '</nav><div class="m-drawer-footer"><img src="/assets/thyme-branch.png" alt="" width="50" height="70"><span>Καλό φαγητό<br>καλύτερο αύριο</span></div></section></div>';
  }
  function setMenu(open) {
    menuOpen = open;
    document.querySelector('.m-drawer-root')?.remove();
    document.body.classList.toggle('m-menu-open', open);
    const app = $('#app');
    if (app) app.inert = open;
    $('[data-m-menu]')?.setAttribute('aria-expanded', String(open));
    if (open) {
      document.body.insertAdjacentHTML('beforeend', drawer());
      document.querySelectorAll('.m-menu-link').forEach(button => {
        if (button.dataset.mRoute === S.view) button.setAttribute('aria-current', 'page');
      });
      $('.m-drawer button')?.focus();
    } else $('[data-m-menu]')?.focus({ preventScroll: true });
  }
  async function refreshCatalog() {
    const request = ++catalogRequest;
    // A filter chosen while another request runs must not be dropped by the base guard.
    while (S.catalogLoading) await new Promise(resolve => setTimeout(resolve, 40));
    if (request !== catalogRequest || !S.session) return;
    const queryKey = cacheKey();
    try { await fetchCatalog(true); } catch (error) { S.status = error.message; }
    if (request === catalogRequest && queryKey === cacheKey() && S.view === 'recipes') render();
  }
  function navigate(route) {
    clearTimeout(S.searchTimer);
    searchFocus = null;
    if (menuOpen) setMenu(false);
    if (route === 'profile') { S.privacyOpen = true; render(); $('.privacy-modal .close')?.focus(); return; }
    if (route === 'logout') { disconnectRealtime(); saveSession(null); S.house = null; S.recipes = []; S.privacyOpen = false; S.__bootResolved = true; render(); return; }
    if (route === 'new') {
      S.view = 'recipes'; S.sideNav = 'recipes';
      S.creating = true; render(); refreshCreateSubcats(); $('#ct')?.focus(); return;
    }
    S.privacyOpen = false;
    S.view = route === 'discover' || route === 'moderation' ? 'recipes' : route;
    S.sideNav = route === 'discover' ? 'discover' : S.view;
    if (route === 'home') { S.search = ''; S.cat = ''; S.homeRecipes = null; }
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route === 'discover') $('#mobile-search')?.focus();
    if (route === 'moderation') document.querySelector('.moderation')?.scrollIntoView({ block: 'start' });
    if (route === 'home') {
      loadHomePool().then(() => { if (S.session && S.view === 'home') render(); }).catch(() => {});
      loadRecentCommunity().then(() => { if (S.session && S.view === 'home') render(); }).catch(() => {});
    }
  }
  function mobileSearch() {
    if (!S.session) return;
    const input = $('#mobile-search');
    if (!input) return;
    S.search = input.value;
    searchFocus = { start: input.selectionStart, end: input.selectionEnd };
    S.view = 'recipes'; S.sideNav = 'discover';
    // Search all categories from Home; preserve explicit filters within the catalogue.
    if (document.querySelector('.m-home')) { S.tab = ''; S.cat = ''; }
    S.cursor = 0;
    refreshCatalog();
  }
  function enhance() {
    document.querySelector('.m-drawer-root')?.remove();
    const app = $('#app');
    if (!S.session) {
      menuOpen = false; document.body.classList.remove('m-menu-open');
      if (app) app.inert = false;
      return;
    }
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    workspace.querySelector('.topbar')?.remove();
    workspace.insertAdjacentHTML('afterbegin', header());
    workspace.querySelectorAll('.nav').forEach(nav => nav.remove());
    if (S.house) {
      workspace.insertAdjacentHTML('beforeend', bottomNav());
      if (S.view !== 'home') {
        const title = { recipes:'Οι συνταγές',plan:'Πλάνο εβδομάδας',shop:'Λίστα αγορών',fridge:'Τι μαγειρεύω;' }[S.view] || 'Pot & Thyme';
        const toolbar = '<div class="m-page-heading"><h1>' + title + '</h1>' + (S.view === 'recipes' ? '<button type="button" class="m-icon-button m-orange" data-m-route="new" aria-label="Νέα συνταγή">' + icon('plus') + '</button>' : '') + '</div>' + (S.view === 'recipes' ? search() : '');
        workspace.querySelector('.m-header').insertAdjacentHTML('afterend', toolbar);
      }
    }
    // Replace only the filter listeners, so rapid filter changes wait for the catalogue request.
    ['meal-filter', 'cat'].forEach(id => {
      const previous = document.getElementById(id);
      if (!previous) return;
      const select = previous.cloneNode(true);
      previous.replaceWith(select);
      select.addEventListener('change', () => {
        if (id === 'meal-filter') { S.tab = select.value; S.cat = ''; }
        else S.cat = select.value;
        S.recipes = []; S.cursor = 0;
        render(); refreshCatalog();
      });
    });
    workspace.classList.toggle('m-has-modal', !!(S.sel || S.creating || S.privacyOpen || S.adminEdit));
    document.querySelectorAll('.week-day-label').forEach(label => {
      if (label.title) label.textContent = label.title;
    });
    document.querySelectorAll('.m-recipe-media > img').forEach(img => img.addEventListener('error', () => {
      img.parentElement.classList.add('m-no-photo');
      img.hidden = true;
    }, { once: true }));
    if (menuOpen) setMenu(true);
    if (searchFocus && S.view === 'recipes') {
      const input = $('#mobile-search');
      if (input) { input.focus({ preventScroll:true }); try { input.setSelectionRange(searchFocus.start, searchFocus.end); } catch (_) {} }
      searchFocus = null;
    }
  }
  render = function () {
    const input = document.activeElement;
    if (input?.id === 'mobile-search') searchFocus = { start:input.selectionStart, end:input.selectionEnd };
    originalRender.apply(this, arguments); enhance();
  };
  document.addEventListener('click', event => {
    if (!S.session) return;
    const button = event.target.closest('[data-m-route],[data-m-menu],[data-m-dismiss],[data-m-search-focus],[data-m-meal]');
    if (!button) return;
    if (button.hasAttribute('data-m-menu')) return setMenu(true);
    if (button.hasAttribute('data-m-dismiss')) return setMenu(false);
    if (button.hasAttribute('data-m-search-focus')) {
      if (!$('#mobile-search')) navigate('discover');
      $('#mobile-search')?.focus(); return;
    }
    if (button.hasAttribute('data-m-meal')) {
      S.tab = button.dataset.mMeal; S.cat = ''; S.search = ''; S.cursor = 0; S.recipes = [];
      navigate('recipes'); refreshCatalog(); return;
    }
    navigate(button.dataset.mRoute);
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'mobile-search') return;
    S.search = event.target.value;
    ++catalogRequest;
    clearTimeout(S.searchTimer); S.searchTimer = setTimeout(mobileSearch, 300);
  });
  document.addEventListener('submit', event => {
    if (!event.target.matches('.m-search')) return;
    event.preventDefault(); clearTimeout(S.searchTimer); mobileSearch();
  });
  document.addEventListener('keydown', event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...document.querySelectorAll('.m-drawer button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  render();
})();
