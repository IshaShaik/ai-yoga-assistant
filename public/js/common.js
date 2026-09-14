
const $common = (id) => document.getElementById(id);
async function commonApi(url, options = {}) {
  const token = localStorage.getItem("yoga_token");
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
function updateCommonAuth() {
  const btn = $common("authBtn");
  const user = JSON.parse(localStorage.getItem("yoga_user") || "null");
  if (btn) btn.textContent = user ? `Hi, ${user.name.split(" ")[0]}` : "Login / Sign up";
  if (user?.isAdmin) {
    const nav = $common("siteNav");
    if (nav && !nav.querySelector('[data-admin-link]')) {
      const a = document.createElement("a");
      a.href = "/pages/admin.html"; a.textContent = "Admin Feedback"; a.dataset.adminLink = "true";
      nav.appendChild(a);
    }
  }
}
// The old markup wired this button with an inline
// onclick="window.location.href='/pages/poses.html'" attribute. On
// pages/poses.html itself, poses.js ALSO attaches its own click listener
// (opening the login modal in-place) to the same button — so both handlers
// fired on every click: the inline one kicked off a full-page navigation to
// poses.html while the modal was still being opened, and the reload wiped
// it out a split second later. That's the "login page flashes and
// immediately closes" bug. The fix is to have exactly one handler per page:
// this one (attached in JS, not HTML) for every page except poses.html,
// where poses.js already owns the button.
function setupAuthButton() {
  const btn = $common("authBtn");
  if (!btn) return;
  if (location.pathname === "/pages/poses.html") return;
  btn.addEventListener("click", () => {
    const user = JSON.parse(localStorage.getItem("yoga_user") || "null");
    // Logged-in users land on the dashboard; logged-out users go straight
    // to the login modal on the poses page via ?auth=login (read by
    // poses.js's boot()), so the login form is open and stays open — no
    // extra click needed, and nothing here can race a navigation the way
    // the old inline handler did.
    window.location.href = user ? "/pages/dashboard.html" : "/pages/poses.html?auth=login";
  });
}

function setupMobileNav() {
  const toggle = $common("mobileNavToggle");
  const nav = $common("siteNav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", ()=> {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("open")));
}
function revealOnScroll() {
  const items = document.querySelectorAll(".reveal,.reveal-left,.reveal-right,.scale-reveal,.float-card");
  if (!items.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach(el=>el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver((entries, observer)=>{
    entries.forEach(entry=>{
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {threshold:.14});
  items.forEach(el=>io.observe(el));
}
document.addEventListener("DOMContentLoaded", ()=>{ updateCommonAuth(); setupAuthButton(); setupMobileNav(); revealOnScroll(); });


// Site-wide hands-free voice controller. Pose-specific commands are delegated
// to poses.js when that page is open; navigation commands work everywhere.
(function setupGlobalVoiceController(){
  let recognition = null;
  let listening = false;
  const btn = () => document.getElementById("voiceCmdBtn");
  const normalize = text => String(text || "").toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  const isOn = t => /\b(unmute|turn on|enable|activate)\b/.test(t);
  function command(raw){
    const text=normalize(raw); if(!text) return;
    // Let the pose page use its existing command logic for session controls.
    if (typeof window.handleVoiceCommand === "function") { window.handleVoiceCommand(text); return; }
    if (/^(home|go home|open home|show home|home page)$/.test(text)) return location.href="/index.html";
    if (/\b(open|show|go to)\s+progress\b|^progress( page)?$/.test(text)) return location.href="/pages/progress.html";
    if (/\b(open|show|go to)\s+dashboard\b|^dashboard( page)?$/.test(text)) return location.href="/pages/dashboard.html";
    if (/\b(open|show|go to)\s+benefits\b|^benefits( page)?$/.test(text)) return location.href="/pages/benefits.html";
    if (/\b(open|show|go to)\s+(poses|post|pose library)\b/.test(text)) return location.href="/pages/poses.html";
    if (/\b(open|show|go to)\s+(price|pricing|plan|premium)\b|^(price|pricing)( page)?$/.test(text)) return location.href="/pages/poses.html?pricing=1";
    if (/\b(start|begin)\s+(yoga|free yoga|free session)\b|^try free$/.test(text)) return location.href="/pages/poses.html?free=1";
  }
  function setListening(value){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const b=btn();
    if(!SR){ if(b)b.title="Voice commands are not supported in this browser"; return; }
    if(!recognition){
      recognition=new SR(); recognition.continuous=true; recognition.interimResults=false; recognition.lang="en-IN";
      recognition.onresult=e=>{ const r=e.results[e.results.length-1]; command(r?.[0]?.transcript||""); };
      recognition.onerror=e=>{ console.warn("Voice controller:",e.error); if(e.error==='not-allowed'||e.error==='service-not-allowed') setListening(false); };
      recognition.onend=()=>{ if(listening){ try{recognition.start();}catch{} } };
    }
    listening=value;
    localStorage.setItem("yoga_mic_on", value ? "1" : "0");
    if(value){ try{recognition.start();}catch{}; b?.classList.add("listening"); if(b)b.title="Voice commands: ON — speak a command"; }
    else { try{recognition.stop();}catch{}; b?.classList.remove("listening"); if(b)b.title="Voice commands: OFF — click the mic to listen"; }
  }
  document.addEventListener("DOMContentLoaded",()=>{
    const b=btn(); if(!b)return; b.addEventListener("click",()=>setListening(!listening));
    // Mic preference carries across page navigation: if it was ON on the
    // previous page, turn it back on here automatically.
    if (localStorage.getItem("yoga_mic_on") === "1") setListening(true);
  });
})();
