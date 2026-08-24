// Country dial-code selector for every phone number input on the site.
// Wraps each <input type="tel"> with a small country dropdown; picking a
// country prefixes its dial code into the field, and typing a number that
// starts with "+" auto-matches the dropdown to the longest matching code.
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

  function ensureStyles() {
    if (document.getElementById('phone-field-styles')) return;
    var style = document.createElement('style');
    style.id = 'phone-field-styles';
    style.textContent =
      '.phone-field{display:flex;gap:8px;width:100%;}' +
      '.phone-field__select{flex:0 0 auto;max-width:108px;font-family:inherit;font-size:13px;cursor:pointer;outline:none;}' +
      '.phone-field .phone-field__input{flex:1;min-width:0;}' +
      '.phone-field--dark .phone-field__select{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:0 6px;}' +
      '.phone-field--light-box .phone-field__select{background:rgba(255,255,255,0.9);border:1px solid rgba(0,0,0,0.15);color:#000;padding:0 6px;}';
    document.head.appendChild(style);
  }

  function buildSelect(defaultIso2) {
    var select = document.createElement('select');
    select.className = 'phone-field__select';
    select.setAttribute('aria-label', 'Country code');
    PHONE_COUNTRIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c[0];
      opt.textContent = flagEmoji(c[0]) + ' +' + c[1];
      opt.title = c[2] + ' +' + c[1];
      if (c[0] === defaultIso2) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }

  function countryByIso2(iso2) {
    for (var i = 0; i < PHONE_COUNTRIES.length; i++) {
      if (PHONE_COUNTRIES[i][0] === iso2) return PHONE_COUNTRIES[i];
    }
    return null;
  }

  function enhance(input) {
    if (input.dataset.phoneEnhanced) return;
    input.dataset.phoneEnhanced = '1';
    ensureStyles();

    var wrapper = document.createElement('div');
    wrapper.className = 'phone-field';
    if (input.classList.contains('early-access-bar__input')) {
      wrapper.className += ' phone-field--dark';
    } else if (input.classList.contains('ea__input')) {
      wrapper.className += ' phone-field--light-box';
    }

    input.parentNode.insertBefore(wrapper, input);
    input.classList.add('phone-field__input');
    var select = buildSelect('GB');
    wrapper.appendChild(select);
    wrapper.appendChild(input);

    var syncing = false;

    select.addEventListener('change', function () {
      if (syncing) return;
      var country = countryByIso2(select.value);
      if (!country) return;
      var raw = input.value.trim();
      var digits = raw.replace(/\D/g, '');
      // Strip any existing leading dial code before applying the new one.
      var existing = raw.charAt(0) === '+' ? matchCountryFromDigits(digits) : null;
      if (existing) digits = digits.slice(existing[1].length);
      input.value = '+' + country[1] + (digits ? ' ' + digits : ' ');
      input.focus();
    });

    input.addEventListener('input', function () {
      var raw = input.value.trim();
      if (raw.charAt(0) !== '+') return;
      var digits = raw.replace(/\D/g, '');
      var match = matchCountryFromDigits(digits);
      if (match && select.value !== match[0]) {
        syncing = true;
        select.value = match[0];
        syncing = false;
      }
    });
  }

  function initPhoneCountrySelectors() {
    document.querySelectorAll('input[type="tel"]').forEach(enhance);
  }

  window.initPhoneCountrySelectors = initPhoneCountrySelectors;
})();
