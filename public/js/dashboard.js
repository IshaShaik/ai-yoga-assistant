
async function loadDashboardPage() {
  const token = localStorage.getItem("yoga_token");
  if (!token) { document.getElementById("dashboardLogin")?.classList.remove("hidden"); return; }
  try {
    const data = await commonApi("/api/progress/summary");
    document.getElementById("dashName").textContent = (JSON.parse(localStorage.getItem("yoga_user")||"{}").name||"Practitioner").split(" ")[0];
    document.getElementById("dashCompleted").textContent = data.completedPoses;
    document.getElementById("dashStreak").textContent = data.dailyStreak;
    document.getElementById("dashMinutes").textContent = data.totalPracticeMinutes;
    document.getElementById("dashAccuracy").textContent = data.averageAccuracy != null ? `${data.averageAccuracy}%` : "—";
    document.getElementById("dashFeedback").textContent = data.feedback?.tip || "Keep your practice consistent.";
  } catch(e) { document.getElementById("dashFeedback").textContent=e.message; }
}
document.addEventListener("DOMContentLoaded",loadDashboardPage);
