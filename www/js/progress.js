
async function loadProgressPage() {
  const ids = ["dashCompleted","dashAccuracy","dashTime","dashStreak"];
  const token = localStorage.getItem("yoga_token");
  if (!token) {
    document.getElementById("loginPrompt")?.classList.remove("hidden");
    return;
  }
  try {
    const data = await commonApi("/api/progress/summary");
    document.getElementById("dashCompleted").textContent = data.completedPoses;
    document.getElementById("dashAccuracy").textContent = data.averageAccuracy != null ? `${data.averageAccuracy}%` : "—";
    document.getElementById("dashTime").textContent = `${data.totalPracticeMinutes}m`;
    document.getElementById("dashStreak").textContent = data.dailyStreak;
    const bars = document.getElementById("progressBars");
    const max = Math.max(1,...(data.weekly||[]).map(x=>x.seconds||0));
    bars.innerHTML = (data.weekly||[]).map((x,i)=>`<div class="bar-col"><span style="height:${Math.max(8,((x.seconds||0)/max)*100)}%"></span><small>${["M","T","W","T","F","S","S"][i]}</small></div>`).join("");
    document.getElementById("progressFeedback").textContent = data.feedback?.todayMessage || "Keep showing up. Even a short session counts.";
    await loadMyFeedback();
  } catch(e) { document.getElementById("progressFeedback").textContent = e.message; }
}
document.addEventListener("DOMContentLoaded", loadProgressPage);

async function loadMyFeedback(){
  const list=document.getElementById("myFeedbackList");
  try{
    const data=await commonApi("/api/feedback/mine");
    document.getElementById("myAverageRating").textContent=data.average ?? "—";
    document.getElementById("myFeedbackCount").textContent=`${data.count||0} review${data.count===1?"":"s"}`;
    if(!data.feedback?.length){list.innerHTML='<div class="empty-feedback">Complete a yoga session and share your experience.</div>';return;}
    list.innerHTML=data.feedback.map(item=>{
      const stars="★".repeat(item.rating)+"☆".repeat(5-item.rating);
      const date=new Date(item.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
      return `<article class="feedback-item"><div class="feedback-item-top"><span class="feedback-item-stars">${stars}</span><span class="feedback-item-date">${date}</span></div><div class="feedback-item-pose">${escapeHtml(item.poseName||"Yoga Session")}</div>${item.comment?`<p class="feedback-item-comment">“${escapeHtml(item.comment)}”</p>`:""}</article>`;
    }).join("");
  }catch(e){list.innerHTML='<div class="empty-feedback">Your feedback history will appear here after your first submission.</div>'; }
}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
