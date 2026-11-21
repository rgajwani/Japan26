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
  function renderDays(sel, base) {
    base = base || 'day';
    // The Map tab opens on whichever day is being looked at.
    var mt = d.querySelector('.tabs a[data-tab="map"]'); if (mt) mt.setAttribute('href', '#map/' + sel);
    var today = todayTokyo().date;
    d.getElementById('days').innerHTML = T.days.map(function (x) {
      var cls = ['day-chip', x.city]; if (x.date === sel) cls.push('sel'); if (x.date === today) cls.push('today');
      return '<a class="' + cls.join(' ') + '" href="#' + base + '/' + x.date + '" aria-label="' + esc(longDate(x.date) + ', ' + x.title) + '"' + (x.date === sel ? ' aria-current="date"' : '') + '>' +
        '<span class="dow">' + (x.date === today ? 'Today' : dow(x.date)) + '</span><span class="dn">' + dnum(x.date) + '</span><span class="city"></span></a>';
    }).join('');
    var s = d.querySelector('.day-chip.sel');
    if (s) s.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function setTab(name) {
    [].forEach.call(d.querySelectorAll('.tabs a'), function (a) { a.classList.toggle('on', a.dataset.tab === name); });
    d.getElementById('days').hidden = name !== 'day' && name !== 'map';
    view.classList.toggle('map-page', name === 'map');
    d.body.classList.toggle('on-map', name === 'map');
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
    h += '<h3 id="hotels">Hotels</h3>' + hotelCards();
    h += '<h3>Everything booked</h3>';
    var last = '';
    T.bookings.forEach(function (b) {
      if (b.date !== last) { h += '<div class="bk-day"><a href="#day/' + b.date + '">' + esc(longDate(b.date)) + '</a></div>'; last = b.date; }
      h += '<div class="bk' + (b.pending ? ' pending' : '') + '"><div class="t">' + esc(b.t) + '</div><div><div class="w">' + esc(b.what) + '</div>' +
        '<div class="d">' + esc(b.details) + (b.conf ? ' · <span class="mono">' + esc(b.conf) + '</span>' : '') + '</div>' + actions({ tel: b.tel, conf: b.conf }) + '</div></div>';
    });
    view.innerHTML = h; scrollTo(0, 0);
  }

  function hotelCards() {
    var tonight = hotelFor(todayTokyo().date);
    return T.hotels.map(function (x, i) {
      return '<div class="card"><div class="k">' + esc(x.dates) + '</div><h3 style="margin:4px 0 6px">' + esc(x.name) + (x === tonight ? '<span class="hotel-tag">Tonight</span>' : '') + '</h3>' +
        '<div class="note-sm">' + esc(x.address) + '</div>' +
        '<div class="note-sm">Confirmation ' + x.conf.map(function (c) { return '<span class="mono">' + esc(c) + '</span>'; }).join(' and ') + ' · ' + esc(x.confNote) + '</div>' +
        '<div class="jp-card"><div class="k">For the taxi driver</div><div class="jp-name" lang="ja">' + esc(x.jaName) + '</div><div class="jp-addr" lang="ja">' + esc(x.jaAddress) + '</div></div>' +
        '<div class="actions"><button class="btn primary" data-taxi="' + i + '">Show the driver</button>' +
        '<a class="btn" href="' + telHref(x.tel) + '">Call</a><a class="btn" href="' + mapHref(x.map) + '" target="_blank" rel="noopener">Map</a>' +
        '<button class="btn" data-copy="' + esc(x.conf.join(', ')) + '">Copy conf.</button></div></div>';
    }).join('');
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

  // ---------- meals: per-meal plan and all options ----------
  var FMT = { together: ['Together', 'b-together'], split: ['Split', 'b-split'], either: ['Together or split', 'b-together'] };
  var BOOK = { online: 'Book online', call: 'Call', walkin: 'Walk in', hotel: 'In the hotel', reach: 'Reach' };
  function mealCity(date, time) { return date < '2026-11-25' || (date === '2026-11-25' && /AM/.test(time)) ? 'Tokyo' : 'Kyoto'; }
  function optBadges(o) {
    var b = [];
    if (o.her) b.push('<span class="badge b-her">Her list</span>');
    if (FMT[o.fmt]) b.push('<span class="badge ' + FMT[o.fmt][1] + '">' + FMT[o.fmt][0] + '</span>');
    if (BOOK[o.book]) b.push('<span class="badge ' + (o.book === 'reach' ? 'b-reach' : 'b-book') + '">' + BOOK[o.book] + '</span>');
    return b.join('');
  }
  function optCard(o, rank, where) {
    var acts = '<a class="btn sm" href="' + mapHref(o.jp || o.name) + '" target="_blank" rel="noopener">Map</a>';
    if (o.jp) acts += '<button class="btn sm" data-place="1" data-ja="' + esc(o.jp) + '" data-addr="" data-en="' + esc(o.name) + '">Taxi card</button>' +
      '<button class="btn sm" data-copy="' + esc(o.jp) + '">Copy Japanese</button>';
    if (o.link) acts += '<a class="btn sm" href="' + esc(o.link.url) + '" target="_blank" rel="noopener">' + esc(o.link.label) + '</a>';
    return '<details class="opt"><summary>' + (rank ? '<span class="rank">' + rank + '</span>' : '') +
      '<span class="opt-h"><span class="opt-n">' + esc(o.name) + '</span><span class="badges">' + optBadges(o) + '</span>' +
      (o.facts ? '<span class="opt-f">' + esc(o.facts) + '</span>' : '') + (where ? '<span class="opt-w">' + where + '</span>' : '') + '</span>' +
      '<span class="chev" aria-hidden="true">▼</span></summary><div class="opt-b">' +
      (o.body ? '<p>' + esc(o.body) + '</p>' : '') + (o.contact ? '<p class="note-sm"><b>Book:</b> ' + esc(o.contact) + '</p>' : '') +
      (o.jp ? '<p class="jp-line" lang="ja">' + esc(o.jp) + '</p>' : '') + '<div class="actions">' + acts + '</div></div></details>';
  }
  function mealBlock(md, ml, open) {
    var h = '<details class="mmeal"' + (open ? ' open' : '') + '><summary><span class="m-time">' + esc(ml.time) + '</span><span class="m-lab">' + esc(ml.label) +
      (ml.keep ? ' <span class="badge b-keep">Keep</span>' : '') + (ml.fix ? ' <span class="badge b-reach">Fix</span>' : '') + '</span><span class="chev" aria-hidden="true">▼</span></summary><div class="m-body">';
    if (ml.her) h += '<p class="box plan"><b>Her plan</b> ' + esc(ml.her) + '</p>';
    if (ml.fix) h += '<p class="box fix"><b>Fix</b> ' + esc(ml.fix) + '</p>';
    if (ml.pick) h += '<p class="box pick"><b>My pick</b> ' + esc(ml.pick) + '</p>';
    if (ml.options) {
      if (ml.sequence) h += '<p class="note-sm">In walking order:</p>';
      h += ml.options.map(function (o, i) { return optCard(o, i + 1); }).join('');
    }
    (ml.groups || []).forEach(function (g) {
      h += '<h4 class="m-group">' + esc(g.title) + '</h4>' + g.options.map(function (o, i) { return optCard(o, i + 1); }).join('');
    });
    if (ml.note) h += '<p class="note-sm m-note2">' + esc(ml.note) + '</p>';
    return h + '</div></details>';
  }
  function mealsView(mode, focus) {
    setTab('meals');
    var M = T.meals;
    if (mode !== 'all') mode = 'meal';
    store('mealsMode', mode);
    var h = '<h2>Meals</h2><div class="seg" role="tablist">' +
      '<a role="tab" href="#meals' + (focus ? '/' + focus : '') + '" class="' + (mode === 'meal' ? 'on' : '') + '">Per meal</a>' +
      '<a role="tab" href="#meals/all" class="' + (mode === 'all' ? 'on' : '') + '">All options</a></div>' +
      '<details class="legend"><summary>What the tags mean</summary><p>' +
      '<span class="badge b-her">Her list</span> on her backup list · <span class="badge b-together">Together</span> all five can eat well · ' +
      '<span class="badge b-split">Split</span> she and Aria eat nearby · <span class="badge b-reach">Reach</span> hard to book; ask the concierge · ' +
      '<span class="badge b-keep">Keep</span> her plan already works for everyone. Every meat pick is seafood-free or can be ordered that way. Breakfasts stay at the hotels.</p></details>';
    if (mode === 'meal') {
      var today = focus || defaultDay();
      h += '<details class="fixes"><summary><b>Fix these first</b> <span class="cnt">' + M.fixes.length + '</span></summary><ol>' +
        M.fixes.map(function (f) { return '<li><a href="#meals/' + f.day + '">' + esc(dow(f.day) + ' ' + dnum(f.day)) + '</a><span>' + esc(f.text) + '</span></li>'; }).join('') + '</ol></details>';
      h += M.days.map(function (md) {
        var isOpen = md.date === today;
        return '<details class="mday" id="md-' + md.date + '"' + (isOpen ? ' open' : '') + '><summary><span class="md-date">' + esc(dow(md.date)) + '<b>' + dnum(md.date) + '</b></span>' +
          '<span class="md-t"><span class="md-title">' + esc(md.title) + '</span><span class="md-sub">' + esc(md.city) + ' · ' + md.meals.length + (md.meals.length === 1 ? ' meal' : ' meals') + '</span></span>' +
          '<span class="chev" aria-hidden="true">▼</span></summary><div class="md-body">' +
          md.meals.map(function (ml) { return mealBlock(md, ml, isOpen && md.meals.length <= 2); }).join('') +
          '<a class="md-link" href="#day/' + md.date + '">See the full day ›</a></div></details>';
      }).join('');
      view.innerHTML = h;
      var f = focus && d.getElementById('md-' + focus);
      if (f) setTimeout(function () { scrollTo(0, Math.max(0, f.getBoundingClientRect().top + scrollY - 12)); }, 0); else scrollTo(0, 0);
      return;
    }
    // All options: every meat-map pick plus her backup list, by city.
    var groups = { Tokyo: [], Kyoto: [] };
    M.days.forEach(function (md) {
      md.meals.forEach(function (ml) {
        var all = (ml.options || []).concat.apply(ml.options || [], (ml.groups || []).map(function (g) { return g.options; }));
        all.forEach(function (o) { groups[mealCity(md.date, ml.time)].push({ o: o, date: md.date, label: ml.label }); });
      });
    });
    var q = mealsQ.toLowerCase(), flt = mealsFilter;
    function keep(x) {
      var o = x.o;
      if (flt === 'together' && !(o.fmt === 'together' || o.fmt === 'either')) return false;
      if (flt === 'her' && !o.her) return false;
      if (flt === 'walkin' && o.book !== 'walkin') return false;
      return !q || (o.name + ' ' + (o.facts || '') + ' ' + (o.body || '') + ' ' + (o.jp || '')).toLowerCase().indexOf(q) >= 0;
    }
    function backupKeep(f) {
      if (flt === 'together' || flt === 'walkin') return false;
      return !q || (f.name + ' ' + (f.area || '') + ' ' + f.text).toLowerCase().indexOf(q) >= 0;
    }
    function section(title, inner, n, open) {
      return '<details class="mday"' + (open ? ' open' : '') + '><summary><span class="md-t"><span class="md-title">' + esc(title) + '</span><span class="md-sub">' + n + (n === 1 ? ' place' : ' places') + '</span></span><span class="chev" aria-hidden="true">▼</span></summary><div class="md-body">' + inner + '</div></details>';
    }
    var chips = [['all', 'All'], ['together', 'Together'], ['her', 'Her list'], ['walkin', 'Walk in']].map(function (c) {
      return '<button class="w-chip sm' + (flt === c[0] ? ' on' : '') + '" data-mfilter="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    h += '<input class="search" id="meals-q" type="search" placeholder="Search: wagyu, yakitori, Ginza, vegan…" autocomplete="off" value="' + esc(mealsQ) + '">' +
      '<div class="w-chips m-chips">' + chips + '</div><div id="meals-list">';
    var cityNow = defaultDay() >= '2026-11-25' ? 'Kyoto' : 'Tokyo', total = 0;
    ['Tokyo', 'Kyoto'].forEach(function (city) {
      var rows = groups[city].filter(keep);
      var back = (T.backups[city.toLowerCase()] || []).filter(backupKeep);
      total += rows.length + back.length;
      if (rows.length) h += section(city + ': meat map picks', rows.map(function (x) {
        return optCard(x.o, 0, 'Suggested for <a href="#meals/' + x.date + '">' + esc(dow(x.date) + ' ' + dnum(x.date)) + ', ' + esc(x.label) + '</a>');
      }).join(''), rows.length, city === cityNow || !!q || flt !== 'all');
      if (back.length) h += section(city + ': her backup list', back.map(function (f) {
        return '<details class="opt"><summary><span class="opt-h"><span class="opt-n">' + esc(f.name) + '</span><span class="badges"><span class="badge b-her">Her list</span></span>' +
          (f.area ? '<span class="opt-f">' + esc(f.area) + '</span>' : '') + '</span><span class="chev" aria-hidden="true">▼</span></summary><div class="opt-b"><p>' + esc(f.text) + '</p>' +
          '<div class="actions"><a class="btn sm" href="' + mapHref(f.name + ' ' + (f.area && f.area.indexOf('all over') < 0 ? f.area : '') + ' ' + city) + '" target="_blank" rel="noopener">Map</a></div></div></details>';
      }).join(''), back.length, !!q || flt === 'her');
    });
    if (!total) h += '<p class="lead">Nothing matches.</p>';
    h += '</div>';
    var hadFocus = d.activeElement && d.activeElement.id === 'meals-q';
    view.innerHTML = h;
    if (hadFocus) { var qi = d.getElementById('meals-q'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); } else scrollTo(0, 0);
  }
  var mealsQ = '', mealsFilter = 'all';

  // ---------- full-screen sheet ----------
  var sheet = d.getElementById('sheet'), sheetBody = d.getElementById('sheet-body');
  function openSheet(html, mode) {
    sheetBody.innerHTML = html; sheet.className = 'sheet' + (mode ? ' ' + mode : '');
    sheet.hidden = false; sheet.scrollTop = 0; d.body.style.overflow = 'hidden';
  }
  function closeSheet() {
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
  function mapView(iso) {
    if (!tripDay(iso)) iso = defaultDay();
    renderDays(iso, 'map'); setTab('map');
    view.innerHTML = '<div id="trip-map" class="m-map"><p class="m-msg">Loading map…</p></div>';
    sizeMap(); scrollTo(0, 0);
    loadLeaflet().then(function () { drawMap(iso); }, function () {
      var el = d.getElementById('trip-map');
      if (el) el.innerHTML = '<p class="m-msg">The map needs a connection the first time. Try again when online.</p>';
    });
  }
  function sizeMap() {
    var el = d.getElementById('trip-map'); if (!el) return;
    var tabs = d.querySelector('.tabs').offsetHeight;
    el.style.height = Math.max(240, innerHeight - el.getBoundingClientRect().top - tabs) + 'px';
    if (tripMap) tripMap.invalidateSize();
  }
  addEventListener('resize', sizeMap);
  function drawMap(sel) {
    var el = d.getElementById('trip-map'); if (!el) return;
    el.innerHTML = '';
    tripMap = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap contributors' }).addTo(tripMap);
    var list = pins().filter(function (p) { return p.date === sel; });
    var bounds = [], frame = frameCityOf(list);
    list.forEach(function (p) {
      var color = DAY_COLORS[p.di];
      var icon = L.divIcon({ className: '', html: '<div class="pin" style="background:' + color + '">' + p.n + '</div>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
      L.marker(p.ll, { icon: icon }).addTo(tripMap).bindPopup(
        '<div class="pop-d">' + esc(dow(p.date) + ' ' + dnum(p.date) + ' · ' + p.t) + '</div><div class="pop-t">' + esc(p.title) + '</div>' +
        '<a class="pop-a" href="#day/' + p.date + '/' + p.idx + '">Details ›</a>');
      if (!frame || p.city === frame) bounds.push(p.ll);
    });
    T.hotels.forEach(function (h, i) {
      if (!h.ll) return;
      var icon = L.divIcon({ className: '', html: '<div class="pin pin-h">H</div>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
      L.marker(h.ll, { icon: icon, zIndexOffset: -100 }).addTo(tripMap).bindPopup(
        '<div class="pop-d">' + esc(h.dates) + '</div><div class="pop-t">' + esc(h.name) + '</div><a class="pop-a" href="#" data-taxi="' + i + '">Taxi card ›</a>');
    });
    // Frame tonight's hotel too (or last night's, on the day we leave).
    var prev = T.days[T.days.findIndex(function (x) { return x.date === sel; }) - 1];
    var stay = hotelFor(sel) || (prev && hotelFor(prev.date));
    if (stay && stay.ll && (!frame || (stay.ll[1] > 137 ? 'tokyo' : 'kyoto') === frame)) bounds.push(stay.ll);
    if (!list.length) {
      var note = L.control({ position: 'topright' });
      note.onAdd = function () { var x = L.DomUtil.create('div', 'm-note'); x.textContent = 'No stops to map on this day.'; return x; };
      note.addTo(tripMap);
    }
    if (bounds.length > 1) tripMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    else if (bounds.length === 1) tripMap.setView(bounds[0], 15);
    else tripMap.setView([35.68, 139.74], 11);
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
    var t = e.target.closest('[data-mfilter],[data-todo],[data-copy],[data-taxi],[data-place],[data-phrase],[data-vegphrases],[data-w]');
    if (!t) return;
    if (t.dataset.mfilter) {
      mealsFilter = t.dataset.mfilter; mealsView('all');
    } else if (t.dataset.todo) {
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
  d.addEventListener('input', function (e) { if (e.target.id === 'meals-q') { mealsQ = e.target.value; mealsView('all'); } });
  d.getElementById('theme').onclick = function () {
    var cur = d.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    d.documentElement.dataset.theme = next; store('theme', next);
  };

  // ---------- routing ----------
  function route(first) {
    closeSheet();
    if (tripMap) { tripMap.remove(); tripMap = null; }
    view.classList.remove('map-page');
    var h = location.hash.slice(1);
    var m = h.match(/^day\/(\d{4}-\d{2}-\d{2})(?:\/(\d+))?$/);
    if (m) return dayView(m[1], false, m[2] !== undefined ? +m[2] : undefined);
    if (h === 'bookings') return bookingsView();
    var mm = h.match(/^map(?:\/(\d{4}-\d{2}-\d{2}))?$/);
    if (mm) return mapView(mm[1] || defaultDay());
    if (h === 'taxi') { bookingsView(); var hh = d.getElementById('hotels'); if (hh) hh.scrollIntoView(); return; }
    if (h === 'phrases') return phrasesView();
    var me = h.match(/^(?:meals|food)(?:\/(all|\d{4}-\d{2}-\d{2}))?$/);
    if (me) {
      if (me[1] === 'all') return mealsView('all');
      if (me[1]) return mealsView('meal', me[1]);
      return mealsView(h === 'meals' && store('mealsMode') === 'all' ? 'all' : 'meal');
    }
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
