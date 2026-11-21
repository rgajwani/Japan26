// GitHub Pages build only. The itinerary ships encrypted (AES-GCM, key from the
// passphrase via PBKDF2). This file asks for the passphrase once per phone,
// decrypts the plan in the browser, and keeps the derived key on the phone.
(function () {
  'use strict';
  var d = document, KEY = 'jt-key';
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var lock = d.createElement('div');
  lock.id = 'lock';
  lock.innerHTML =
    '<style>#lock{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px 16px}' +
    '#lock form{width:100%;max-width:360px}#lock .sun{width:56px;height:56px;border-radius:50%;background:var(--red);margin-bottom:20px}' +
    '#lock h1{font:700 30px/1.1 var(--serif);margin:0}#lock .sub{color:var(--muted);margin:6px 0 28px}' +
    '#lock label{display:block;font-size:14px;font-weight:600;margin-bottom:6px}' +
    '#lock input{width:100%;height:52px;font-size:18px;padding:0 14px;border:1.5px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink)}' +
    '#lock button{width:100%;height:52px;margin-top:12px;border:0;border-radius:12px;background:var(--ink);color:var(--bg);font-size:17px;font-weight:700}' +
    '#lock .err{color:var(--red);font-weight:600;min-height:1.5em;margin:10px 0 0}#lock .note{color:var(--muted);font-size:14px;margin-top:8px}</style>' +
    '<form id="lock-f" hidden><div class="sun"></div><h1>Japan Thanksgiving</h1><p class="sub">Nov 20 to 29, 2026</p>' +
    '<input type="text" name="username" value="family" autocomplete="username" hidden>' +
    '<label for="lock-pw">Passphrase</label><input id="lock-pw" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required>' +
    '<button id="lock-go">Open the trip</button><p class="err" id="lock-err" role="alert"></p>' +
    '<p class="note">You enter it once per phone. After that the app works offline.</p></form>';
  d.body.appendChild(lock);

  var form = d.getElementById('lock-f'), pw = d.getElementById('lock-pw'), err = d.getElementById('lock-err'), go = d.getElementById('lock-go');

  function decrypt(key, box) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }
  function done(trip) {
    window.TRIP = trip;
    lock.remove();
    window.dispatchEvent(new Event('trip-ready'));
  }
  function ask(box) {
    form.hidden = false; pw.focus();
    form.onsubmit = function (e) {
      e.preventDefault();
      go.disabled = true; err.textContent = 'Unlocking…';
      var phrase = pw.value.trim().toLowerCase().replace(/\s+/g, '');
      crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'PBKDF2', false, ['deriveKey'])
        .then(function (base) {
          return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(box.salt), iterations: box.iter, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
        })
        .then(function (key) {
          return decrypt(key, box).then(function (trip) {
            return crypto.subtle.exportKey('raw', key).then(function (raw) { put(KEY, box.salt + ':' + b64(raw)); done(trip); });
          });
        })
        .catch(function () { err.textContent = 'Wrong passphrase. Try again.'; go.disabled = false; pw.select(); });
    };
  }

  fetch('data.enc.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (box) {
    var saved = get(KEY), parts = saved ? saved.split(':') : [];
    if (parts[0] !== box.salt) return ask(box);
    crypto.subtle.importKey('raw', unb64(parts[1]), 'AES-GCM', false, ['decrypt'])
      .then(function (key) { return decrypt(key, box); })
      .then(done, function () { ask(box); });
  }).catch(function () {
    form.hidden = false; form.onsubmit = function (e) { e.preventDefault(); location.reload(); };
    err.textContent = 'Could not load the trip. Connect to the internet once, then try again.';
  });
})();
