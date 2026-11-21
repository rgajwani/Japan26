(function () {
  'use strict';
  if (!window.TRIP) { window.addEventListener('trip-ready', start, { once: true }); return; }
  start();
  function start() {
  var T = window.TRIP, d = document, view = d.getElementById('view');
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function parts(tz) {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return { date: o.year + '-' + o.month + '-' + o.day, hm: o.hour + ':' + o.minute };
  }
  function fmtTime(tz) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date()); }
  function dateObj(iso) { var a = iso.split('-'); return new Date(Date.UTC(+a[0], a[1] - 1, +a[2])); }
  function dow(iso) { return DOW[dateObj(iso).getUTCDay()]; }
  function dnum(iso) { return +iso.slice(8); }
  function longDate(iso) { var x = dateObj(iso); return DOW[x.getUTCDay()] + ' ' + MON[x.getUTCMonth()] + ' ' + x.getUTCDate(); }
  function telHref(t) { var n = t.replace(/[^\d+]/g, ''); if (n[0] === '0') n = '+81' + n.slice(1); return 'tel:' + n; }
  function mapHref(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
  function todayTokyo() { return parts('Asia/Tokyo'); }
  function tripDay(iso) { return T.days.filter(function (x) { return x.date === iso; })[0]; }
  function defaultDay() {
    var t = todayTokyo().date, first = T.days[0].date, last = T.days[T.days.length - 1].date;
    if (t < first) return first; if (t > last) return last; return t;
  }
  function hotelFor(iso) { return T.hotels.filter(function (h) { return iso >= h.from && iso < h.to; })[0]; }
  function isDone(id) { return store('done:' + id) === '1'; }

  var toastTimer;
  function toast(msg) {
    var el = d.getElementById('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 1600);
  }

  // ---------- header ----------
  function renderClock() {
    d.getElementById('clock').innerHTML = 'Japan <b>' + esc(fmtTime('Asia/Tokyo')) + '</b> · California ' + esc(fmtTime('America/Los_Angeles'));
  }
  function renderDays(sel) {
    var today = todayTokyo().date;
    d.getElementById('days').innerHTML = T.days.map(function (x) {
      var cls = ['day-chip', x.city]; if (x.date === sel) cls.push('sel'); if (x.date === today) cls.push('today');
      return '<a class="' + cls.join(' ') + '" href="#day/' + x.date + '" aria-label="' + esc(longDate(x.date) + ', ' + x.title) + '"' + (x.date === sel ? ' aria-current="date"' : '') + '>' +
        '<span class="dow">' + (x.date === today ? 'Today' : dow(x.date)) + '</span><span class="dn">' + dnum(x.date) + '</span><span class="city"></span></a>';
    }).join('');
    var s = d.querySelector('.day-chip.sel');
    if (s) s.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function setTab(name) {
    [].forEach.call(d.querySelectorAll('.tabs a'), function (a) { a.classList.toggle('on', a.dataset.tab === name); });
    d.getElementById('days').hidden = name !== 'day';
  }

  // ---------- weather (Open-Meteo, no key; cached on the phone) ----------
  var WX = { tokyo: [35.6595, 139.7292], kyoto: [34.9905, 135.7737] };
  function wxWord(c) {
    if (c === 0) return 'clear'; if (c <= 2) return 'partly cloudy'; if (c === 3) return 'cloudy'; if (c <= 48) return 'fog';
    if (c <= 57) return 'drizzle'; if (c <= 67) return 'rain'; if (c <= 77) return 'snow'; if (c <= 82) return 'showers'; return 'storms';
  }
  function weatherFor(iso, city) {
    if (city !== 'tokyo' && city !== 'kyoto') city = iso >= '2026-11-25' ? 'kyoto' : 'tokyo';
    var raw = store('wx:' + city); if (!raw) return null;
    try { var w = JSON.parse(raw).data.daily, i = w.time.indexOf(iso); if (i < 0) return null;
      return Math.round(w.temperature_2m_max[i]) + '° / ' + Math.round(w.temperature_2m_min[i]) + '°F, ' + wxWord(w.weather_code[i]) +
        (w.precipitation_probability_max[i] >= 30 ? ', ' + w.precipitation_probability_max[i] + '% rain' : '') + ' · ' + (city === 'tokyo' ? 'Tokyo' : 'Kyoto');
    } catch (e) { return null; }
  }
  function refreshWeather() {
    Object.keys(WX).forEach(function (city) {
      try { var old = JSON.parse(store('wx:' + city) || 'null'); if (old && Date.now() - old.at < 3 * 3600e3) return; } catch (e) {}
      var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + WX[city][0] + '&longitude=' + WX[city][1] +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=Asia%2FTokyo&forecast_days=14';
      fetch(u).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.daily) { store('wx:' + city, JSON.stringify({ at: Date.now(), data: j })); var w = d.getElementById('wx'); if (w && w.dataset.date) w.textContent = weatherFor(w.dataset.date, w.dataset.city) || ''; }
      }).catch(function () {});
    });
  }

  // ---------- pieces ----------
  function tagHtml(tags) {
    var label = { booked: 'Booked', optional: 'Optional', requested: 'Requested', todo: 'To do', veg: 'Veg pick', split: 'Split' };
    return (tags || []).map(function (t) { return '<span class="tag ' + t + '">' + (label[t] || t) + '</span>'; }).join('');
  }
  function taxiChip(r, en) {
    if (!r || r.noTaxi) return '';
    if (r.hotel !== undefined) return '<button class="btn" data-taxi="' + r.hotel + '">Taxi card</button>';
    if (!r.ja) return '';
    return '<button class="btn" data-place="1" data-ja="' + esc(r.ja) + '" data-addr="' + esc(r.jaAddr || '') + '" data-en="' + esc(en || '') + '">Taxi card</button>';
  }
  function travelLine(r) {
    if (!r || !r.by) return '';
    return '<p class="travel-t">Travel time ' + (r.by === 'foot' ? 'on foot' : 'by ' + esc(r.by)) + ': ' + esc(r.time) +
      (r.alt ? '<br>' + esc(r.alt.charAt(0).toUpperCase() + r.alt.slice(1)) : '') + '</p>';
  }
  function actions(o, r) {
    var a = [], map = o.map || (r && r.map);
    if (map) a.push('<a class="btn" href="' + mapHref(map) + '" target="_blank" rel="noopener">Map</a>');
    var tx = taxiChip(r, map || o.title); if (tx) a.push(tx);
    if (o.tel) a.push('<a class="btn" href="' + telHref(o.tel) + '">Call ' + esc(o.tel) + '</a>');
    if (o.conf) a.push('<button class="btn" data-copy="' + esc(o.conf) + '">Copy <span class="mono">' + esc(o.conf) + '</span></button>');
    return (a.length ? '<div class="actions">' + a.join('') + '</div>' : '') + travelLine(r);
  }
  // Loose ends. Ticks live in this phone's storage only.
  function openCountText() {
    var left = (T.open || []).filter(function (o) { return !isDone(o.id); });
    var today = todayTokyo().date, late = left.filter(function (o) { return o.due < today; }).length;
    if (!left.length) return 'all done';
    return left.length + ' to do' + (late ? ', ' + late + ' overdue' : '');
  }
  function openLine() {
    var txt = openCountText();
    return '<a class="hotel-tonight" href="#" data-todo="1"><span><b>Still open</b> <span id="open-count" class="open-count' +
      (/overdue/.test(txt) ? ' late' : '') + '">· ' + esc(txt) + '</span></span><span class="go">Show ›</span></a>';
  }
  function todoSheet() {
    var today = todayTokyo().date;
    var items = (T.open || []).slice().sort(function (x, y) {
      return (isDone(x.id) - isDone(y.id)) || (x.due < y.due ? -1 : x.due > y.due ? 1 : 0);
    });
    openSheet('<h2 class="s-h">Still open</h2><p class="s-note">Tick an item when it is done. Ticks are saved on this phone only; other phones keep their own.</p>' +
      items.map(function (o) {
        var done = isDone(o.id), late = !done && o.due < today;
        return '<label class="todo-row' + (done ? ' done' : '') + '"><input type="checkbox" data-done="' + esc(o.id) + '"' + (done ? ' checked' : '') + '>' +
          '<span><span class="t">' + esc(o.title) + '</span><span class="d">' + esc(o.detail) + '</span>' +
          '<span class="due' + (late ? ' late' : '') + '">' + (late ? 'Overdue since ' : 'Due ') + esc(longDate(o.due)) + '</span></span></label>';
      }).join(''), 'listmode');
  }

  // ---------- views ----------
  function dayView(iso, focusNow, openIdx) {
    var day = tripDay(iso); if (!day) return dayView(defaultDay(), true);
    renderDays(iso); setTab('day');
    var now = todayTokyo(), isToday = now.date === iso, nowIdx = -1, nextIdx = -1;
    if (isToday) day.items.forEach(function (it, i) {
      if (!it.at) return;
      if (it.at <= now.hm) nowIdx = i; else if (nextIdx < 0) nextIdx = i;
    });
    var hotel = hotelFor(iso), wx = weatherFor(iso, day.city), pinNo = {}, pn = 0;
    day.items.forEach(function (it, i) { var r = (T.routes || {})[iso + '|' + it.title]; if (r && r.ll) pinNo[i] = ++pn; });
    var h = '<div class="day-head"><div class="big-date">' + dnum(iso) + '</div><div>' +
      '<div class="day-meta">' + esc(longDate(iso)) + (day.city === 'tokyo' ? ' · Tokyo' : day.city === 'kyoto' ? ' · Kyoto' : '') + '</div>' +
      '<h2>' + esc(day.title) + '</h2>' + (day.badge ? '<span class="badge">' + esc(day.badge) + '</span>' : '') +
      '<div class="wx" id="wx" data-date="' + iso + '" data-city="' + day.city + '">' + esc(wx || '') + '</div></div></div>' +
      '<p class="highlights">' + esc(day.highlights) + '</p>';
    if (hotel) h += '<a class="hotel-tonight" href="#" data-taxi="' + T.hotels.indexOf(hotel) + '"><span>Tonight: <b>' + esc(hotel.name) + '</b></span><span class="go">Taxi card ›</span></a>';
    h += '<a class="hotel-tonight" href="#" data-vegphrases="1"><span><b>Vegetarian phrases</b></span><span class="go">Show ›</span></a>';
    h += '<a class="hotel-tonight" href="#" data-map="' + iso + '"><span><b>Trip map</b></span><span class="go">Show ›</span></a>';
    h += openLine();
    h += '<ol class="timeline">' + day.items.map(function (it, i) {
      var cls = ['item']; if ((it.tags || []).indexOf('optional') >= 0) cls.push('optional'); if (i === nowIdx) cls.push('now');
      var extra = i === nowIdx ? '<span class="tag nowtag">Now</span>' : i === nextIdx ? '<span class="tag nexttag">Next</span>' : '';
      var isClock = /^\d|^About \d|^By \d|^From \d/.test(it.t);
      var body = '';
      if (it.note) body += '<p class="note-sm">' + esc(it.note) + '</p>';
      if (it.text) body += '<p>' + esc(it.text) + '</p>';
      if (it.list) body += '<ul class="sublist">' + it.list.map(function (l) {
        return '<li><b>' + esc(l.label) + '</b>' + esc(l.text) + (l.map ? '<span class="actions sub-actions"><a class="btn sm" href="' + mapHref(l.map) + '" target="_blank" rel="noopener">Map</a>' +
          taxiChip((T.subRoutes || {})[l.map], l.map).replace('class="btn"', 'class="btn sm"') + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
      if (it.why) body += '<p class="why"><b>Why:</b> ' + esc(it.why) + '</p>';
      body += actions(it, (T.routes || {})[iso + '|' + it.title]);
      return '<li class="' + cls.join(' ') + '" id="it-' + i + '"><details' + (i === nowIdx || i === nextIdx ? ' open' : '') + '><summary>' +
        '<span class="when' + (isClock ? ' clock-t' : '') + '">' + esc(it.t) + '</span>' +
        '<span>' + (pinNo[i] ? '<span class="pin-n" style="background:' + DAY_COLORS[T.days.indexOf(day)] + '">' + pinNo[i] + '</span>' : '') + '<span class="ttl">' + esc(it.title) + '</span>' +
        ((it.tags && it.tags.length) || extra ? '<span class="tags">' + extra + tagHtml(it.tags) + '</span>' : '') +
        (it.alert ? '<div class="alert">' + esc(it.alert) + '</div>' : '') + '</span>' +
        '<span class="chev" aria-hidden="true">▼</span></summary><div class="body">' + body + '</div></details></li>';
    }).join('') + '</ol>';
    if (day.notes) h += '<div class="day-notes">' + esc(day.notes) + '</div>';
    if (iso === T.days[0].date) h += '<p class="intro">' + esc(T.intro) + '</p>';
    view.innerHTML = h;
    var target = openIdx !== undefined ? openIdx : focusNow && (nowIdx >= 0 ? nowIdx : nextIdx);
    if (openIdx !== undefined) { var od = d.querySelector('#it-' + openIdx + ' details'); if (od) od.open = true; }
    if ((focusNow || openIdx !== undefined) && target >= 0) {
      var el = d.getElementById('it-' + target);
      if (el) setTimeout(function () { var y = el.getBoundingClientRect().top + scrollY - d.getElementById('days').offsetHeight - 8; scrollTo(0, Math.max(0, y)); }, 0);
    } else scrollTo(0, 0);
  }

  function bookingsView() {
    setTab('bookings');
    var h = '<h2>Bookings</h2>' + openLine();
    h += '<h3>Flights · JAL <span class="mono">' + esc(T.flightConf) + '</span> <button class="btn sm" data-copy="' + esc(T.flightConf) + '">Copy</button></h3>';
    h += T.flights.map(function (f) {
      return '<div class="card flight"><div class="fn">' + esc(f.flight) + '</div><div class="k">' + esc(f.date) + '</div>' +
        '<div class="route">' + esc(f.dep) + ' → ' + esc(f.arr) + '</div><div class="note-sm">' + esc(f.cabin) + '</div></div>';
    }).join('');
    h += '<h3>Everything booked</h3>';
    var last = '';
    T.bookings.forEach(function (b) {
      if (b.date !== last) { h += '<div class="bk-day"><a href="#day/' + b.date + '">' + esc(longDate(b.date)) + '</a></div>'; last = b.date; }
      h += '<div class="bk' + (b.pending ? ' pending' : '') + '"><div class="t">' + esc(b.t) + '</div><div><div class="w">' + esc(b.what) + '</div>' +
        '<div class="d">' + esc(b.details) + (b.conf ? ' · <span class="mono">' + esc(b.conf) + '</span>' : '') + '</div>' + actions({ tel: b.tel, conf: b.conf }) + '</div></div>';
    });
    view.innerHTML = h; scrollTo(0, 0);
  }

  function hotelsView() {
    setTab('taxi');
    var tonight = hotelFor(todayTokyo().date);
    var h = '<h2>Hotels</h2><p class="lead">Tap “Show the driver” and hand over the phone.</p>';
    h += T.hotels.map(function (x, i) {
      return '<div class="card"><div class="k">' + esc(x.dates) + '</div><h3 style="margin:4px 0 6px">' + esc(x.name) + (x === tonight ? '<span class="hotel-tag">Tonight</span>' : '') + '</h3>' +
        '<div class="note-sm">' + esc(x.address) + '</div>' +
        '<div class="note-sm">Confirmation ' + x.conf.map(function (c) { return '<span class="mono">' + esc(c) + '</span>'; }).join(' and ') + ' · ' + esc(x.confNote) + '</div>' +
        '<div class="jp-card"><div class="k">For the taxi driver</div><div class="jp-name" lang="ja">' + esc(x.jaName) + '</div><div class="jp-addr" lang="ja">' + esc(x.jaAddress) + '</div></div>' +
        '<div class="actions"><button class="btn primary" data-taxi="' + i + '">Show the driver</button>' +
        '<a class="btn" href="' + telHref(x.tel) + '">Call</a><a class="btn" href="' + mapHref(x.map) + '" target="_blank" rel="noopener">Map</a>' +
        '<button class="btn" data-copy="' + esc(x.conf.join(', ')) + '">Copy conf.</button></div></div>';
    }).join('');
    view.innerHTML = h; scrollTo(0, 0);
  }

  function phrasesView() {
    setTab('phrases');
    view.innerHTML = '<h2>Phrase card</h2><p class="lead">Tap a phrase to show it to the server. Swipe or use the bar at the bottom to switch.</p><div style="margin-top:14px">' +
      '<button class="phrase" data-phrase="-1"><div class="en">Our diet, on one screen</div><div class="ja" lang="ja">' + esc(T.phrases[0].ja) + ' …</div><div class="ro">Vegetarian · no meat or fish · no fish stock · no egg dishes</div></button>' +
      T.phrases.map(function (p, i) {
        return '<button class="phrase" data-phrase="' + i + '"><div class="en">' + esc(p.en) + '</div><div class="ja" lang="ja">' + esc(p.ja) + '</div><div class="ro">' + esc(p.ro) + '</div></button>';
      }).join('') + '</div>';
    scrollTo(0, 0);
  }

  function foodView(q) {
    setTab('food');
    q = (q || '').toLowerCase();
    function list(arr, city) {
      var rows = arr.filter(function (f) { return !q || (f.name + ' ' + (f.area || '') + ' ' + f.text).toLowerCase().indexOf(q) >= 0; });
      if (!rows.length) return '';
      return '<h3>' + city + '</h3>' + rows.map(function (f) {
        return '<div class="food"><div class="n">' + esc(f.name) + '</div>' + (f.area ? '<div class="a">' + esc(f.area) + '</div>' : '') +
          '<p>' + esc(f.text) + '</p><a class="btn sm" href="' + mapHref(f.name + ' ' + (f.area && f.area.indexOf('all over') < 0 ? f.area : '') + ' ' + city) + '" target="_blank" rel="noopener">Map</a></div>';
      }).join('');
    }
    var listHtml = list(T.backups.tokyo, 'Tokyo') + list(T.backups.kyoto, 'Kyoto');
    if (!d.getElementById('food-q')) {
      view.innerHTML = '<h2>Backup restaurants</h2><p class="lead">' + esc(T.backups.intro) + '</p>' +
        '<input class="search" id="food-q" type="search" placeholder="Search: ramen, vegan, Ginza…" autocomplete="off"><div id="food-list"></div>';
      scrollTo(0, 0);
    }
    d.getElementById('food-list').innerHTML = listHtml || '<p class="lead">Nothing matches.</p>';
  }

  // ---------- full-screen sheet ----------
  var sheet = d.getElementById('sheet'), sheetBody = d.getElementById('sheet-body');
  function openSheet(html, mode) {
    sheetBody.innerHTML = html; sheet.className = 'sheet' + (mode ? ' ' + mode : '');
    sheet.hidden = false; sheet.scrollTop = 0; d.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    if (tripMap) { tripMap.remove(); tripMap = null; }
    sheet.hidden = true; d.body.style.overflow = '';
  }

  // ---------- trip map (Leaflet + OpenStreetMap; loaded on first use) ----------
  var tripMap = null, leafletLoading = null;
  var DAY_COLORS = ['#7a6f62', '#8a5a00', '#b3261e', '#1f4e8c', '#6a3d9a', '#0f766e', '#c2410c', '#2f6b3a', '#a21caf', '#334155'];
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise(function (ok, fail) {
      var css = d.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet.css'; d.head.appendChild(css);
      var js = d.createElement('script'); js.src = 'vendor/leaflet.js'; js.onload = ok; js.onerror = function () { leafletLoading = null; fail(); }; d.head.appendChild(js);
    });
    return leafletLoading;
  }
  function pins() {
    var out = [];
    T.days.forEach(function (day, di) {
      var n = 0;
      day.items.forEach(function (it, i) {
        var r = (T.routes || {})[day.date + '|' + it.title];
        if (!r || !r.ll) return;
        n++;
        out.push({ date: day.date, di: di, idx: i, n: n, ll: r.ll, t: it.t, title: it.title,
          city: r.ll[1] > 137 ? 'tokyo' : 'kyoto' });
      });
    });
    return out;
  }
  function openMap(sel) {
    var days = T.days.filter(function (x) { return pins().some(function (p) { return p.date === x.date; }); });
    if (!sel || (sel !== 'tokyo' && sel !== 'kyoto' && !days.some(function (x) { return x.date === sel; }))) sel = tripDay(defaultDay()) && days.some(function (x) { return x.date === defaultDay(); }) ? defaultDay() : 'tokyo';
    var chips = '<button class="w-chip' + (sel === 'tokyo' ? ' on' : '') + '" data-mapsel="tokyo">All Tokyo</button>' +
      '<button class="w-chip' + (sel === 'kyoto' ? ' on' : '') + '" data-mapsel="kyoto">All Kyoto</button>' +
      days.map(function (x) {
        return '<button class="w-chip' + (sel === x.date ? ' on' : '') + '" data-mapsel="' + x.date + '"><span class="dot" style="background:' + DAY_COLORS[T.days.indexOf(x)] + '"></span>' + dow(x.date) + ' ' + dnum(x.date) + '</button>';
      }).join('');
    var html = '<div class="m-bar"><div class="w-chips">' + chips + '</div></div><div id="trip-map" class="m-map"><p class="m-msg">Loading map…</p></div>';
    if (tripMap) { tripMap.remove(); tripMap = null; }
    if (sheet.hidden || !sheet.classList.contains('mapmode')) openSheet(html, 'mapmode'); else sheetBody.innerHTML = html;
    var on = sheetBody.querySelector('.w-chip.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    loadLeaflet().then(function () { drawMap(sel); }, function () {
      d.getElementById('trip-map').innerHTML = '<p class="m-msg">The map needs a connection the first time. Try again when online.</p>';
    });
  }
  function drawMap(sel) {
    var el = d.getElementById('trip-map'); if (!el) return;
    el.innerHTML = '';
    tripMap = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap contributors' }).addTo(tripMap);
    var all = pins(), list;
    if (sel === 'tokyo' || sel === 'kyoto') list = all.filter(function (p) { return p.city === sel; });
    else {
      list = all.filter(function (p) { return p.date === sel; });
      // A travel day spans both cities: frame the city with more stops.
    }
    var bounds = [];
    list.forEach(function (p) {
      var color = DAY_COLORS[p.di];
      var icon = L.divIcon({ className: '', html: '<div class="pin" style="background:' + color + '">' + p.n + '</div>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
      L.marker(p.ll, { icon: icon }).addTo(tripMap).bindPopup(
        '<div class="pop-d">' + esc(dow(p.date) + ' ' + dnum(p.date) + ' · ' + p.t) + '</div><div class="pop-t">' + esc(p.title) + '</div>' +
        '<a class="pop-a" href="#day/' + p.date + '/' + p.idx + '">Details ›</a>');
      if (sel === 'tokyo' || sel === 'kyoto' || !frameCityOf(list) || p.city === frameCityOf(list)) bounds.push(p.ll);
    });
    T.hotels.forEach(function (h, i) {
      if (!h.ll) return;
      var icon = L.divIcon({ className: '', html: '<div class="pin pin-h">H</div>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
      L.marker(h.ll, { icon: icon, zIndexOffset: -100 }).addTo(tripMap).bindPopup(
        '<div class="pop-d">' + esc(h.dates) + '</div><div class="pop-t">' + esc(h.name) + '</div><a class="pop-a" href="#" data-taxi="' + i + '">Taxi card ›</a>');
    });
    if (bounds.length > 1) tripMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    else if (bounds.length === 1) tripMap.setView(bounds[0], 15);
    else tripMap.setView(sel === 'kyoto' ? [35.0, 135.76] : [35.68, 139.74], 12);
    setTimeout(function () { if (tripMap) tripMap.invalidateSize(); }, 50);
  }
  function frameCityOf(list) {
    if (!list.length) return null;
    var tk = list.filter(function (p) { return p.city === 'tokyo'; }).length;
    if (tk === 0 || tk === list.length) return null;
    return tk * 2 >= list.length ? 'tokyo' : 'kyoto';
  }
  d.getElementById('sheet-close').onclick = closeSheet;

  // ---------- waiter view: one phrase huge, chips to switch ----------
  // Index -1 is "Our diet": the four key lines on one screen.
  var DIET = [0, 1, 2, 4], wIdx = 0;
  function waiter(i) {
    if (i === undefined) i = +(store('phrase') || -1);
    var n = T.phrases.length; if (i < -1) i = n - 1; if (i >= n) i = -1;
    wIdx = i; store('phrase', String(i));
    var main;
    if (i === -1) {
      main = '<div class="w-stack">' + DIET.map(function (k) {
        var p = T.phrases[k];
        return '<div class="w-line"><div class="w-ja-s" lang="ja">' + esc(p.ja) + '</div><div class="w-en-s">' + esc(p.en) + '</div></div>';
      }).join('') + '</div>';
    } else {
      var p = T.phrases[i];
      main = '<div class="w-ja" lang="ja">' + esc(p.ja) + '</div><div class="w-en">' + esc(p.en) + '</div><div class="w-ro">' + esc(p.ro) + '</div>';
    }
    var chips = '<button class="w-chip' + (i === -1 ? ' on' : '') + '" data-w="-1">Our diet</button>' + T.phrases.map(function (p, k) {
      return '<button class="w-chip' + (k === i ? ' on' : '') + '" data-w="' + k + '">' + esc(p.short || p.en) + '</button>';
    }).join('');
    var html = '<div class="w-main" id="w-main">' + main + '</div>' +
      '<div class="w-bar"><button class="w-arrow" data-w="' + (i - 1) + '" aria-label="Previous phrase">‹</button>' +
      '<div class="w-chips" id="w-chips">' + chips + '</div>' +
      '<button class="w-arrow" data-w="' + (i + 1) + '" aria-label="Next phrase">›</button></div>';
    if (sheet.hidden || !sheet.classList.contains('waiter')) openSheet(html, 'waiter');
    else {
      var keep = d.getElementById('w-chips').scrollLeft;
      sheetBody.innerHTML = html; d.getElementById('w-chips').scrollLeft = keep;
    }
    var on = sheetBody.querySelector('.w-chip.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  // Swipe left or right on the phrase to step through.
  var sx = null, sy = null;
  sheet.addEventListener('touchstart', function (e) { if (!sheet.classList.contains('waiter') || !e.target.closest('#w-main')) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) waiter(wIdx + (dx < 0 ? 1 : -1));
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSheet();
    if (!sheet.hidden && sheet.classList.contains('waiter')) {
      if (e.key === 'ArrowRight') waiter(wIdx + 1);
      if (e.key === 'ArrowLeft') waiter(wIdx - 1);
    }
  });

  // ---------- events ----------
  d.addEventListener('click', function (e) {
    var t = e.target.closest('[data-todo],[data-copy],[data-taxi],[data-place],[data-phrase],[data-vegphrases],[data-w],[data-map],[data-mapsel]');
    if (!t) return;
    if (t.dataset.todo) {
      e.preventDefault(); todoSheet();
    } else if (t.dataset.copy) {
      e.preventDefault();
      var v = t.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Copied ' + v); }, function () { toast(v); });
    } else if (t.dataset.taxi) {
      e.preventDefault();
      var x = T.hotels[+t.dataset.taxi];
      openSheet('<div class="s-label">Please take us here.</div><div class="s-please" lang="ja">ここまでお願いします。</div><div class="s-ja" lang="ja">' + esc(x.jaName) + '</div><div class="s-ja2" lang="ja">' + esc(x.jaAddress) + '</div>' +
        '<div class="s-en">' + esc(x.name) + ' · ' + esc(x.tel) + '</div>');
    } else if (t.dataset.place) {
      e.preventDefault();
      openSheet('<div class="s-label">Please take us here.</div><div class="s-please" lang="ja">ここまでお願いします。</div><div class="s-ja" lang="ja">' + esc(t.dataset.ja) + '</div>' +
        (t.dataset.addr ? '<div class="s-ja2" lang="ja">' + esc(t.dataset.addr) + '</div>' : '') + '<div class="s-en">' + esc(t.dataset.en) + '</div>');
    } else if (t.dataset.map) {
      e.preventDefault(); openMap(t.dataset.map);
    } else if (t.dataset.mapsel) {
      openMap(t.dataset.mapsel);
    } else if (t.dataset.vegphrases) {
      e.preventDefault(); waiter();
    } else if (t.dataset.phrase) {
      waiter(+t.dataset.phrase);
    } else if (t.dataset.w !== undefined) {
      waiter(+t.dataset.w);
    }
  });
  d.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.done) {
      store('done:' + e.target.dataset.done, e.target.checked ? '1' : null);
      e.target.closest('.todo-row').classList.toggle('done', e.target.checked);
      var oc = d.getElementById('open-count');
      if (oc) { var txt = openCountText(); oc.textContent = '· ' + txt; oc.classList.toggle('late', /overdue/.test(txt)); }
    }
  });
  d.addEventListener('input', function (e) { if (e.target.id === 'food-q') foodView(e.target.value); });
  d.getElementById('theme').onclick = function () {
    var cur = d.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    d.documentElement.dataset.theme = next; store('theme', next);
  };

  // ---------- routing ----------
  function route(first) {
    closeSheet();
    var h = location.hash.slice(1);
    var m = h.match(/^day\/(\d{4}-\d{2}-\d{2})(?:\/(\d+))?$/);
    if (m) return dayView(m[1], false, m[2] !== undefined ? +m[2] : undefined);
    if (h === 'bookings') return bookingsView();
    if (h === 'taxi') return hotelsView();
    if (h === 'phrases') return phrasesView();
    if (h === 'food') return foodView();
    return dayView(defaultDay(), true);
  }
  addEventListener('hashchange', function () { route(false); });
  d.querySelector('.tabs a[data-tab="day"]').addEventListener('click', function (e) {
    if (location.hash === '#today' || location.hash === '') { e.preventDefault(); route(); }
  });

  renderClock(); setInterval(renderClock, 30e3);
  route(true);
  refreshWeather();
  // Refresh "now" when the app comes back to the foreground.
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible') { renderClock(); if (!location.hash || location.hash === '#today') route(); }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
