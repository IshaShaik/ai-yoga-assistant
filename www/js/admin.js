async function loadAdminFeedback(){
  const token=localStorage.getItem("yoga_token");
  const error=document.getElementById("adminError");
  if(!token){showAdminError("Please log in with your administrator account.");return;}
  try{
    const data=await commonApi("/api/feedback/admin");
    error.classList.add("hidden");
    document.getElementById("reviewCount").textContent=data.count||0;
    document.getElementById("averageRating").textContent=data.count?data.average:"—";
    document.getElementById("fiveStarCount").textContent=(data.breakdown||[]).find(x=>x._id===5)?.count||0;
    document.getElementById("ratingBreakdown").innerHTML=(data.breakdown||[]).map(x=>`<span class="break-item">${x._id} ★ <b>${x.count}</b></span>`).join("")||'<span class="break-item">No ratings yet</span>';
    const table=document.getElementById("feedbackTable");
    if(!data.feedback?.length){table.innerHTML='<div class="empty">No user feedback has been submitted yet.</div>';return;}
    const head='<div class="feedback-row head"><div>User</div><div>Pose / session</div><div>Rating</div><div>Feedback</div><div>Date</div></div>';
    table.innerHTML=head+data.feedback.map(item=>{const stars="★".repeat(item.rating)+"☆".repeat(5-item.rating);const date=new Date(item.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});return `<div class="feedback-row"><div data-label="User"><div class="user-name">${esc(item.userName)}</div><div class="user-email">${esc(item.userEmail)}</div></div><div data-label="Pose"><div class="pose">${esc(item.poseName||"Yoga Session")}</div></div><div data-label="Rating" class="rating">${stars}</div><div data-label="Feedback" class="comment">${item.comment?`“${esc(item.comment)}”`:'<span style="color:#9aafbc">No written comment</span>'}</div><div data-label="Date" class="date">${date}</div></div>`}).join("");
  }catch(e){showAdminError(e.message||"Unable to load feedback.")}
}
function showAdminError(msg){const e=document.getElementById("adminError");e.textContent=msg;e.classList.remove("hidden")}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
document.addEventListener("DOMContentLoaded",()=>{loadAdminFeedback();document.getElementById("refreshFeedback")?.addEventListener("click",loadAdminFeedback);});
