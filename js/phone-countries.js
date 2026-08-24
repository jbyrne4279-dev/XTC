// Country dial-code selector for every phone number input on the site.
// Merges a country picker into the same bordered box as the phone input
// (one rectangle, not two), and opens a searchable dropdown of countries
// instead of a native <select>. Typing a number that starts with "+" also
// auto-matches the picker to the longest matching dial code.
(function () {
  var PHONE_COUNTRIES = [
    ["GB","44","United Kingdom"],["US","1","United States"],["CA","1","Canada"],
    ["IE","353","Ireland"],["AU","61","Australia"],["NZ","64","New Zealand"],
    ["FR","33","France"],["DE","49","Germany"],["ES","34","Spain"],["IT","39","Italy"],
    ["PT","351","Portugal"],["NL","31","Netherlands"],["BE","32","Belgium"],
    ["CH","41","Switzerland"],["AT","43","Austria"],["SE","46","Sweden"],
    ["NO","47","Norway"],["DK","45","Denmark"],["FI","358","Finland"],["PL","48","Poland"],
    ["CZ","420","Czech Republic"],["SK","421","Slovakia"],["HU","36","Hungary"],
    ["RO","40","Romania"],["BG","359","Bulgaria"],["GR","30","Greece"],
    ["HR","385","Croatia"],["SI","386","Slovenia"],["EE","372","Estonia"],
    ["LV","371","Latvia"],["LT","370","Lithuania"],["LU","352","Luxembourg"],
    ["MT","356","Malta"],["CY","357","Cyprus"],["IS","354","Iceland"],
    ["UA","380","Ukraine"],["RU","7","Russia"],["TR","90","Turkey"],["IL","972","Israel"],
    ["AE","971","United Arab Emirates"],["SA","966","Saudi Arabia"],["QA","974","Qatar"],
    ["KW","965","Kuwait"],["BH","973","Bahrain"],["OM","968","Oman"],["JO","962","Jordan"],
    ["LB","961","Lebanon"],["EG","20","Egypt"],["ZA","27","South Africa"],
    ["NG","234","Nigeria"],["KE","254","Kenya"],["GH","233","Ghana"],["MA","212","Morocco"],
    ["DZ","213","Algeria"],["TN","216","Tunisia"],["IN","91","India"],["PK","92","Pakistan"],
    ["BD","880","Bangladesh"],["LK","94","Sri Lanka"],["NP","977","Nepal"],["CN","86","China"],
    ["JP","81","Japan"],["KR","82","South Korea"],["HK","852","Hong Kong"],
    ["TW","886","Taiwan"],["SG","65","Singapore"],["MY","60","Malaysia"],["TH","66","Thailand"],
    ["VN","84","Vietnam"],["PH","63","Philippines"],["ID","62","Indonesia"],
    ["BR","55","Brazil"],["MX","52","Mexico"],["AR","54","Argentina"],["CL","56","Chile"],
    ["CO","57","Colombia"],["PE","51","Peru"],["VE","58","Venezuela"],["EC","593","Ecuador"],
    ["UY","598","Uruguay"],["JM","1876","Jamaica"],["TT","1868","Trinidad and Tobago"]
  ];
  // Longest dial code first, so "+1876" (Jamaica) matches before "+1" (US/Canada).
  var BY_LONGEST_DIAL = PHONE_COUNTRIES.slice().sort(function (a, b) { return b[1].length - a[1].length; });

  function flagEmoji(iso2) {
    return String.fromCodePoint.apply(null, iso2.split('').map(function (c) {
      return 127397 + c.charCodeAt(0);
    }));
  }

  function matchCountryFromDigits(digits) {
    for (var i = 0; i < BY_LONGEST_DIAL.length; i++) {
      var dial = BY_LONGEST_DIAL[i][1];
      if (digits.indexOf(dial) === 0) return BY_LONGEST_DIAL[i];
    }
    return null;
  }

  function countryByIso2(iso2) {
    for (var i = 0; i < PHONE_COUNTRIES.length; i++) {
      if (PHONE_COUNTRIES[i][0] === iso2) return PHONE_COUNTRIES[i];
    }
    return null;
  }

  function ensureStyles() {
    if (document.getElementById('phone-field-styles')) return;
    var style = document.createElement('style');
    style.id = 'phone-field-styles';
    style.textContent =
      '.phone-field{position:relative;display:flex;align-items:stretch;width:100%;box-sizing:border-box;}' +
      '.phone-field__toggle{display:flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font:inherit;color:inherit;padding:0 10px;white-space:nowrap;flex-shrink:0;}' +
      '.phone-field__toggle:focus{outline:none;}' +
      '.phone-field__chev{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:0.6;flex-shrink:0;}' +
      '.phone-field__divider{width:1px;align-self:stretch;margin:8px 0;background:currentColor;opacity:0.18;flex-shrink:0;}' +
      '.phone-field .phone-field__input{flex:1;min-width:0;border:none;background:transparent;box-shadow:none;}' +
      '.phone-field .phone-field__input:focus{border:none;background:transparent;outline:none;}' +
      '.phone-field--dark{border:1px solid rgba(255,255,255,0.2);color:#fff;transition:border-color 0.2s;}' +
      '.phone-field--dark.phone-field--focus{border-color:rgba(255,255,255,0.5);}' +
      '.phone-field--dark .phone-field__input{color:#fff;}' +
      '.phone-field--dark .phone-field__input::placeholder{color:rgba(255,255,255,0.3);}' +
      '.phone-field--light-box{border:1px solid rgba(0,0,0,0.15);background:rgba(255,255,255,0.9);color:#000;transition:border-color 0.2s,background 0.2s;}' +
      '.phone-field--light-box.phone-field--focus{border-color:rgba(0,0,0,0.6);background:#fff;}' +
      '.phone-field--generic{border:1px solid rgba(0,0,0,0.12);background:rgba(0,0,0,0.03);border-radius:2px;color:#000;transition:border-color 0.2s;}' +
      '.phone-field--generic.phone-field--focus{border-color:rgba(0,0,0,0.4);}' +
      '.phone-field__panel{position:absolute;top:calc(100% + 6px);left:0;width:260px;max-width:80vw;z-index:60;border-radius:4px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.35);display:none;}' +
      '.phone-field__panel--open{display:block;}' +
      '.phone-field__search{width:100%;box-sizing:border-box;border:none;border-bottom:1px solid rgba(128,128,128,0.25);padding:10px 12px;font:inherit;font-size:16px;outline:none;background:transparent;color:inherit;}' +
      '.phone-field__list{list-style:none;margin:0;padding:4px;max-height:220px;overflow-y:auto;}' +
      '.phone-field__opt{display:flex;align-items:center;gap:8px;padding:8px 10px;font-size:13px;cursor:pointer;border-radius:3px;}' +
      '.phone-field__opt-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.phone-field__opt-dial{opacity:0.55;font-size:12px;}' +
      '.phone-field__empty{padding:14px 12px;font-size:12px;opacity:0.5;text-align:center;}' +
      '.phone-field--dark .phone-field__panel{background:#161616;color:#fff;}' +
      '.phone-field--dark .phone-field__opt:hover,.phone-field--dark .phone-field__opt--active{background:rgba(255,255,255,0.08);}' +
      '.phone-field--light-box .phone-field__panel,.phone-field--generic .phone-field__panel{background:#fff;color:#000;border:1px solid rgba(0,0,0,0.1);}' +
      '.phone-field--light-box .phone-field__opt:hover,.phone-field--light-box .phone-field__opt--active,' +
      '.phone-field--generic .phone-field__opt:hover,.phone-field--generic .phone-field__opt--active{background:rgba(0,0,0,0.06);}';
    document.head.appendChild(style);
  }

  function themeClassFor(input) {
    if (input.classList.contains('early-access-bar__input')) return 'phone-field--dark';
    if (input.classList.contains('ea__input')) return 'phone-field--light-box';
    return 'phone-field--generic';
  }

  function applyInputBoxStyle(input, themeClass) {
    // The wrapper now owns the visible box; strip the input's own
    // border/background so only one rectangle shows, and match its
    // original padding so the merged box keeps the same proportions.
    var pad = { 'phone-field--dark': '16px 18px', 'phone-field--light-box': '11px 14px', 'phone-field--generic': '14px 16px' }[themeClass] || '12px 14px';
    input.style.border = 'none';
    input.style.background = 'transparent';
    input.style.padding = pad.split(' ')[0] + ' ' + pad.split(' ')[1] + ' ' + pad.split(' ')[0] + ' 8px';
    input.style.boxSizing = 'border-box';
    input.style.width = '100%';
  }

  function enhance(input) {
    if (input.dataset.phoneEnhanced) return;
    input.dataset.phoneEnhanced = '1';
    ensureStyles();

    // The picker already shows the dial code — drop it from the placeholder
    // example too (e.g. "+44 7700 000000" -> "7700 000000").
    if (input.placeholder) {
      input.placeholder = input.placeholder.replace(/^\+\d+\s*/, '');
    }

    var themeClass = themeClassFor(input);
    var wrapper = document.createElement('div');
    wrapper.className = 'phone-field ' + themeClass;

    input.parentNode.insertBefore(wrapper, input);
    input.classList.add('phone-field__input');
    applyInputBoxStyle(input, themeClass);

    // The visible field only ever shows the local number (the picker already
    // shows the code), but anything reading input.value — form submission,
    // validation — should still get the full E.164-style number. Override
    // the accessor rather than the displayed text so both stay true.
    var nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    function getRaw() { return nativeDesc.get.call(input); }
    function setRaw(v) { nativeDesc.set.call(input, v); }

    var selected = countryByIso2('GB');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'phone-field__toggle';
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', 'false');
    var flagSpan = document.createElement('span');
    var dialSpan = document.createElement('span');
    var chevSpan = document.createElement('span');
    chevSpan.className = 'phone-field__chev';
    toggle.appendChild(flagSpan);
    toggle.appendChild(dialSpan);
    toggle.appendChild(chevSpan);

    var divider = document.createElement('span');
    divider.className = 'phone-field__divider';

    var panel = document.createElement('div');
    panel.className = 'phone-field__panel';
    var search = document.createElement('input');
    search.type = 'text';
    search.className = 'phone-field__search';
    search.placeholder = 'Search country…';
    search.setAttribute('aria-label', 'Search country');
    var list = document.createElement('ul');
    list.className = 'phone-field__list';
    list.setAttribute('role', 'listbox');
    panel.appendChild(search);
    panel.appendChild(list);

    wrapper.appendChild(toggle);
    wrapper.appendChild(divider);
    wrapper.appendChild(input);
    wrapper.appendChild(panel);

    function renderToggle() {
      flagSpan.textContent = flagEmoji(selected[0]);
      dialSpan.textContent = '+' + selected[1];
    }
    renderToggle();

    function renderList(filterText) {
      var q = (filterText || '').trim().toLowerCase();
      list.innerHTML = '';
      var matches = PHONE_COUNTRIES.filter(function (c) {
        if (!q) return true;
        return c[2].toLowerCase().indexOf(q) !== -1 || c[1].indexOf(q.replace(/^\+/, '')) !== -1;
      });
      if (!matches.length) {
        var empty = document.createElement('li');
        empty.className = 'phone-field__empty';
        empty.textContent = 'No countries found';
        list.appendChild(empty);
        return;
      }
      matches.forEach(function (c) {
        var li = document.createElement('li');
        li.className = 'phone-field__opt' + (c[0] === selected[0] ? ' phone-field__opt--active' : '');
        li.setAttribute('role', 'option');
        li.innerHTML =
          '<span>' + flagEmoji(c[0]) + '</span>' +
          '<span class="phone-field__opt-name">' + c[2] + '</span>' +
          '<span class="phone-field__opt-dial">+' + c[1] + '</span>';
        li.addEventListener('click', function () { pick(c); });
        list.appendChild(li);
      });
    }

    function openPanel() {
      panel.classList.add('phone-field__panel--open');
      toggle.setAttribute('aria-expanded', 'true');
      search.value = '';
      renderList('');
      setTimeout(function () { search.focus(); }, 0);
    }
    function closePanel() {
      panel.classList.remove('phone-field__panel--open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function togglePanel() {
      if (panel.classList.contains('phone-field__panel--open')) closePanel();
      else openPanel();
    }

    // The country is already shown by the picker — the input only ever
    // holds the local number, so strip a leading "+<code>" the user typed
    // or pasted rather than duplicating it in both places. Only strips a
    // code we can actually recognise (using its known digit length) —
    // never guesses where an unrecognised code ends and the number begins.
    function stripLeadingCode(raw) {
      if (raw.charAt(0) !== '+') return raw;
      var digits = raw.replace(/\D/g, '');
      var match = matchCountryFromDigits(digits);
      if (!match) return raw;
      // Walk the original string (not a digits-only copy) so any spacing
      // the user typed into the local number itself is preserved.
      var need = match[1].length, i = 1; // skip the leading "+"
      while (i < raw.length && need > 0) {
        if (/\d/.test(raw[i])) need--;
        i++;
      }
      return raw.slice(i).replace(/^[\s-]+/, '');
    }

    function pick(country) {
      selected = country;
      renderToggle();
      closePanel();
      setRaw(stripLeadingCode(getRaw().trim()));
      input.focus();
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });
    search.addEventListener('input', function () { renderList(search.value); });
    search.addEventListener('click', function (e) { e.stopPropagation(); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePanel(); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) closePanel();
    });

    input.addEventListener('focus', function () { wrapper.classList.add('phone-field--focus'); });
    input.addEventListener('blur', function () { wrapper.classList.remove('phone-field--focus'); });

    input.addEventListener('input', function () {
      var raw = getRaw();
      if (raw.trim().charAt(0) !== '+') return;
      var digits = raw.replace(/\D/g, '');
      var match = matchCountryFromDigits(digits);
      if (match) {
        if (selected[0] !== match[0]) { selected = match; renderToggle(); }
        // Collapse the typed/pasted code into the picker instead of
        // leaving it duplicated in the number field.
        setRaw(stripLeadingCode(raw.trim()));
      }
    });

    // Anything reading input.value (form submission, validation) gets the
    // full "+<code> <local number>" — only the on-screen field itself stays
    // free of the duplicated code.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () {
        var local = getRaw().trim();
        return local ? '+' + selected[1] + ' ' + local : '';
      },
      set: function (v) { setRaw(v); }
    });
  }

  function initPhoneCountrySelectors() {
    document.querySelectorAll('input[type="tel"]').forEach(enhance);
  }

  window.initPhoneCountrySelectors = initPhoneCountrySelectors;
})();
