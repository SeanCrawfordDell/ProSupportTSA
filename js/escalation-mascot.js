// Siren mascot that runs across the Escalation page after Escalate to DE imports a case note.
(() => {
  const svg = `<svg class="esc-mascot-art" viewBox="0 0 160 200" aria-hidden="true" focusable="false">
  <ellipse cx="80" cy="192" rx="44" ry="6" fill="#0003"/>
  <g class="esc-step-a"><rect x="58" y="160" width="14" height="26" rx="6" fill="#1f3b5c"/><path d="M52 184h24a4 4 0 0 1 0 8H52a4 4 0 0 1 0-8z" fill="#222"/></g>
  <g class="esc-step-b"><rect x="88" y="160" width="14" height="26" rx="6" fill="#1f3b5c"/><path d="M84 184h24a4 4 0 0 1 0 8H84a4 4 0 0 1 0-8z" fill="#222"/></g>
  <g class="esc-body">
    <rect x="40" y="52" width="80" height="116" rx="38" fill="#2f9ad6" stroke="#1d5f86" stroke-width="3"/>
    <rect x="48" y="118" width="64" height="44" rx="16" fill="#f4f7fb"/>
    <text x="80" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#b42318">DE</text>
    <circle cx="66" cy="86" r="13" fill="#fff" stroke="#1d5f86" stroke-width="3"/><circle cx="94" cy="86" r="13" fill="#fff" stroke="#1d5f86" stroke-width="3"/>
    <g class="esc-blink"><circle cx="69" cy="88" r="5.5" fill="#1b1b24"/><circle cx="97" cy="88" r="5.5" fill="#1b1b24"/><circle cx="71" cy="86" r="1.8" fill="#fff"/><circle cx="99" cy="86" r="1.8" fill="#fff"/></g>
    <ellipse cx="80" cy="108" rx="9" ry="7" fill="#7a1a12"/><ellipse cx="80" cy="111" rx="5" ry="3" fill="#ff8a7a"/>
    <path d="M40 58q40-26 80 0" fill="none" stroke="#8b96a3" stroke-width="7" stroke-linecap="round"/>
    <rect x="72" y="20" width="16" height="10" rx="3" fill="#8b96a3"/>
    <path class="esc-siren" d="M70 22q0-20 10-20t10 20z" fill="#e8281a" stroke="#8f1209" stroke-width="2"/>
    <g class="esc-siren"><rect x="22" y="58" width="24" height="34" rx="10" fill="#e8281a" stroke="#8f1209" stroke-width="2"/></g>
    <g class="esc-siren esc-siren-alt"><rect x="114" y="58" width="24" height="34" rx="10" fill="#e8281a" stroke="#8f1209" stroke-width="2"/></g>
    <g class="esc-glow"><circle cx="80" cy="10" r="16" fill="#ff3b2f"/><circle cx="34" cy="74" r="20" fill="#ff3b2f"/></g>
    <g class="esc-glow esc-siren-alt"><circle cx="126" cy="74" r="20" fill="#ff3b2f"/></g>
    <g class="esc-arm"><path d="M118 120l18-14" stroke="#2f9ad6" stroke-width="10" stroke-linecap="round"/><circle cx="138" cy="104" r="6" fill="#222"/>
      <path d="M132 106l-4-10 22-12 8 30-22-4z" fill="#f2f2f2" stroke="#8b96a3" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="154" cy="99" rx="5" ry="16" transform="rotate(-20 154 99)" fill="#e8281a"/>
    </g>
    <path d="M42 122l-12 14" stroke="#2f9ad6" stroke-width="10" stroke-linecap="round"/><circle cx="28" cy="138" r="6" fill="#222"/>
  </g>
</svg>`;
  function run() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelector(".esc-mascot")?.remove();
    const mascot = document.createElement("div");
    mascot.className = "esc-mascot";
    mascot.setAttribute("aria-hidden", "true");
    mascot.innerHTML = `<div class="esc-mascot-bubble">Escalating to DE!</div>${svg}`;
    mascot.addEventListener("animationend", event => { if (event.target === mascot) mascot.remove(); });
    document.body.append(mascot);
  }
  window.EscalationMascot = { run };
  document.addEventListener("escalationImported", run);
})();
