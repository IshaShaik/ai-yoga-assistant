document.addEventListener("DOMContentLoaded",()=>{
  const cards=[...document.querySelectorAll(".experience-stage .float-card")];
  cards.forEach((card,i)=>card.style.transitionDelay=`${Math.min(i*90,450)}ms`);
  const tiltTargets=document.querySelectorAll(".quick-card,.offer-price");
  tiltTargets.forEach(el=>el.addEventListener("pointermove",e=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    el.style.transform=`translateY(-4px) perspective(600px) rotateX(${y*-2}deg) rotateY(${x*2}deg)`;
  }));
  tiltTargets.forEach(el=>el.addEventListener("pointerleave",()=>el.style.transform=""));
});


// Hero image: restore the original "Try Free Pose" interaction.
(function setupHeroFreePose(){
  const trigger = document.getElementById("heroPoseTrigger");
  if (!trigger) return;
  const start = () => { window.location.href = "/pages/poses.html?free=1"; };
  trigger.addEventListener("click", start);
  trigger.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); start(); } });
})();
