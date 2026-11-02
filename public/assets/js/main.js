(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const html = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const desktop = window.matchMedia("(min-width: 1024px)");
  const hasIO = "IntersectionObserver" in window;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- Разбивка текста на слова ---------- */
  // делим только по обычным пробелам: неразрывные склейки остаются одним словом
  const wrapWords = (el, make) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/( +)/).forEach((part) => {
            if (!part) return;
            if (/^ +$/.test(part)) { frag.append(" "); return; }
            frag.append(make(part, i++));
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    return i;
  };

  const splits = $$("[data-split]");
  if (!reduceMotion) {
    splits.forEach((el) =>
      wrapWords(el, (word, i) => {
        const w = document.createElement("span");
        w.className = "w";
        const inner = document.createElement("span");
        inner.textContent = word;
        inner.style.setProperty("--d", i * 55 + "ms");
        w.append(inner);
        return w;
      })
    );
  }

  // цитата «прописывается» по мере прокрутки
  const fillEl = $("[data-fill]");
  let fillWords = [];
  if (fillEl && !reduceMotion) {
    wrapWords(fillEl, (word) => {
      const w = document.createElement("span");
      w.className = "fw";
      w.textContent = word;
      return w;
    });
    fillWords = $$(".fw", fillEl);
  }

  /* ---------- Появление при прокрутке ---------- */
  const reveals = $$(".rv");
  // соседние элементы одной группы появляются лесенкой
  reveals.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("rv"));
    const k = siblings.indexOf(el);
    if (k > 0) el.style.setProperty("--d", Math.min(k, 6) * 80 + "ms");
  });

  const showAll = () => [...reveals, ...splits].forEach((el) => el.classList.add("is-in"));
  if (reduceMotion || !hasIO) {
    showAll();
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    [...reveals, ...splits].forEach((el) => io.observe(el));
  }

  /* ---------- Счётчики ---------- */
  const counters = $$("[data-count]");
  const runCounter = (el) => {
    const to = +el.dataset.count;
    const t0 = performance.now();
    const dur = 1600;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (hasIO && !reduceMotion) {
    counters.forEach((el) => (el.textContent = "0"));
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        runCounter(en.target);
        cio.unobserve(en.target);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------- Прокрутка: шапка, шаги, цитата, панель ---------- */
  const header = $("#header");
  const dock = $("#dock");
  const hero = $("#top");
  const request = $("#request");
  const stepsList = $(".steps");
  const steps = $$(".step");
  const stages = $$(".report__list li");
  const report = $(".report");
  let lastY = window.scrollY;
  let heroEnd = 0;
  let requestTop = Infinity;
  let docH = 1;

  const measure = () => {
    heroEnd = hero ? hero.offsetTop + hero.offsetHeight * 0.6 : 0;
    requestTop = request ? request.offsetTop - window.innerHeight * 0.6 : Infinity;
    docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    onScroll();
  };

  const setStage = (active) => {
    steps.forEach((s, i) => {
      s.classList.toggle("is-on", i === active);
      s.classList.toggle("is-past", i < active);
    });
    stages.forEach((li, i) => {
      li.classList.toggle("is-done", i < active);
      li.classList.toggle("is-now", i === active);
    });
    if (report) report.style.setProperty("--rp", ((active + 1) / stages.length).toFixed(3));
  };

  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    header.classList.toggle("is-scrolled", y > 8);
    header.style.setProperty("--p", clamp(y / docH).toFixed(4));
    // прячем шапку при прокрутке вниз, показываем при прокрутке вверх
    if (!html.classList.contains("nav-open")) {
      if (y > 400 && y > lastY + 4) header.classList.add("is-hidden");
      else if (y < lastY - 4 || y <= 400) header.classList.remove("is-hidden");
    }
    lastY = y;
    if (dock) dock.classList.toggle("is-on", y > heroEnd && y < requestTop);

    // шаги: активный — тот, что пересёк середину экрана
    if (steps.length) {
      const line = vh * 0.55;
      let active = 0;
      steps.forEach((s, i) => { if (s.getBoundingClientRect().top < line) active = i; });
      setStage(active);
      const r = stepsList.getBoundingClientRect();
      stepsList.style.setProperty("--sp", clamp((line - r.top) / r.height).toFixed(4));
    }

    if (fillWords.length) {
      const r = fillEl.getBoundingClientRect();
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.3));
      const n = Math.round(p * fillWords.length);
      fillWords.forEach((w, i) => w.classList.toggle("on", i < n));
    }
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure);
  measure();

  /* ---------- Hero: лёгкий отклик на курсор ---------- */
  const tilt = $("[data-tilt]");
  if (tilt && finePointer && !reduceMotion) {
    const floats = $$(".hero .float, .hero .spin");
    hero.addEventListener("pointermove", (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      tilt.style.transform = `translate(${x * -10}px, ${y * -8}px)`;
      floats.forEach((f) => (f.style.translate = `${x * 14}px ${y * 10}px`));
    });
    hero.addEventListener("pointerleave", () => {
      tilt.style.transform = "";
      floats.forEach((f) => (f.style.translate = ""));
    });
  }

  /* ---------- Мобильное меню ---------- */
  const burger = $("#burger");
  const nav = $("#nav");
  const setNav = (open) => {
    html.classList.toggle("nav-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    if (open) header.classList.remove("is-hidden");
  };
  burger.addEventListener("click", () => setNav(!html.classList.contains("nav-open")));
  nav.addEventListener("click", (e) => e.target.closest("a") && setNav(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && html.classList.contains("nav-open") && setNav(false));
  window.matchMedia("(min-width: 1081px)").addEventListener("change", (e) => e.matches && setNav(false));

  /* ---------- Активный пункт меню ---------- */
  const links = $$(".nav__list a");
  if (hasIO) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.map((a) => $(a.getAttribute("href"))).filter(Boolean).forEach((s) => spy.observe(s));
  }

  /* ---------- «Задачи»: раскрывающиеся панели ---------- */
  $$("[data-cases]").forEach((box) => {
    const cases = $$(".case", box);
    const set = (target) => {
      cases.forEach((c) => {
        const on = c === target;
        c.classList.toggle("is-open", on);
        $(".case__head", c).setAttribute("aria-expanded", String(on));
      });
    };
    cases.forEach((c) =>
      $(".case__head", c).addEventListener("click", () => {
        // на десктопе одна панель открыта всегда, на мобильном можно свернуть все
        if (c.classList.contains("is-open")) { if (!desktop.matches) set(null); return; }
        set(c);
      })
    );
    desktop.addEventListener("change", (e) => {
      if (e.matches && !cases.some((c) => c.classList.contains("is-open"))) set(cases[0]);
    });
  });

  /* ---------- Аккордеоны: в группе открыт только один ---------- */
  $$("[data-acc]").forEach((group) => {
    const items = $$("details", group);
    items.forEach((d) =>
      d.addEventListener("toggle", () => {
        if (d.open) items.forEach((o) => o !== d && (o.open = false));
      })
    );
  });

  /* ---------- Выбор пакета ---------- */
  const form = $("#tgForm");
  const packageHidden = $("#selectedPackage");
  const packageRadios = $$('input[name="package_choice"]');
  const selectPackage = (value) => {
    packageRadios.forEach((r) => (r.checked = r.value === value));
    if (packageHidden) packageHidden.value = value;
  };
  packageRadios.forEach((r) => r.addEventListener("change", () => (packageHidden.value = r.value)));
  $$("[data-package]").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectPackage(btn.dataset.package);
      setTimeout(() => $('input[name="name"]', form)?.focus({ preventScroll: true }), 900);
    })
  );

  /* ---------- Маска телефона +7 (XXX) XXX-XX-XX ---------- */
  const phone = $('input[name="phone"]', form);
  const phoneDigits = (v) => {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("8")) d = "7" + d.slice(1);
    if (d && !d.startsWith("7")) d = "7" + d;
    return d.slice(0, 11);
  };
  const formatPhone = (d) => {
    if (!d) return "";
    let out = "+7";
    if (d.length > 1) out += " (" + d.slice(1, 4);
    if (d.length >= 4) out += ")";
    if (d.length > 4) out += " " + d.slice(4, 7);
    if (d.length > 7) out += "-" + d.slice(7, 9);
    if (d.length > 9) out += "-" + d.slice(9, 11);
    return out;
  };
  if (phone) {
    phone.addEventListener("input", (e) => {
      phone.closest(".field").classList.remove("is-invalid");
      // при удалении не переформатируем, иначе скобка возвращается и Backspace «залипает»
      if (e.inputType?.startsWith("delete")) return;
      phone.value = formatPhone(phoneDigits(phone.value));
    });
    phone.addEventListener("focus", () => !phone.value && (phone.value = "+7"));
    phone.addEventListener("blur", () => phone.value === "+7" && (phone.value = ""));
  }

  // Рабочая форма REG.RU: assets/js/request-form.js.

  /* ---------- Документы в выезжающей панели ---------- */
  const sheet = $("#legalSheet");
  const sheetBody = $("#sheetBody");
  const sheetTabs = $$(".sheet__tab");
  // тексты — в assets/js/legal-docs.js (общий файл для панели и страниц документов)
  const docKey = (href) => href.split("/").pop().split("#")[0].replace(/\.html$/, "");

  const openDoc = (href) => {
    const key = docKey(href);
    const doc = window.LEGAL_DOCS?.[key];
    if (!doc) return false;
    sheetBody.innerHTML = doc;
    sheetBody.scrollTop = 0;
    sheetTabs.forEach((t) => t.setAttribute("aria-selected", String(docKey(t.dataset.doc) === key)));
    if (!sheet.open) {
      sheet.showModal();
      html.classList.add("sheet-open");
    }
    sheetBody.focus({ preventScroll: true });
    return true;
  };

  const closeSheet = () => {
    if (!sheet.open || sheet.classList.contains("is-closing")) return;
    sheet.classList.add("is-closing");
    setTimeout(() => {
      sheet.classList.remove("is-closing");
      sheet.close();
    }, reduceMotion ? 0 : 320);
  };

  if (sheet && typeof sheet.showModal === "function") {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-legal]");
      if (!a) return;
      // документ не найден — ссылка сработает как обычная и откроет страницу
      if (openDoc(a.getAttribute("href"))) e.preventDefault();
    });
    sheetTabs.forEach((t) => t.addEventListener("click", () => openDoc(t.dataset.doc)));
    $("#sheetClose").addEventListener("click", closeSheet);
    sheet.addEventListener("click", (e) => e.target === sheet && closeSheet());
    sheet.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
    sheet.addEventListener("close", () => html.classList.remove("sheet-open"));
  }

  /* ---------- Год в подвале ---------- */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
})();
