const socket = io();

let mode = "reg";
let user = null;
let room = "general";
let rec = null;
let chunks = [];
let onlineUsers = [];
let lastSeen = {};
let unread = {};
let replyTo = null;

const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const r = await fetch(url, options);
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) throw Error(d.error || "خطا");
  return d;
}

function setText(id, text) {
  if ($(id)) $(id).textContent = text;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function privateRoom(a, b) {
  return "dm:" + [String(a), String(b)].sort().join(":");
}

socket.on("onlineUsers", list => {
  onlineUsers = Array.isArray(list) ? list : [];
  users();
});

socket.on("lastSeen", data => {
  lastSeen = data || {};
  users();
});

function statusText(id){
  if(onlineUsers.includes(String(id))){
    return "🟢 آنلاین";
  }

  if(lastSeen[id]){
    let t=Math.floor((Date.now()-lastSeen[id])/60000);

    if(t<1) return "⚪ همین الان";

    return "⚪ "+t+" دقیقه پیش";
  }

  return "⚪ آفلاین";
}

async function access() {
  try {
    await api("/api/access", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        code: $("code") ? $("code").value : ""
      })
    });

    if ($("gate")) $("gate").classList.add("hide");
    if ($("auth")) $("auth").classList.remove("hide");
  } catch (e) {
    setText("err", e.message);
  }
}

function switchMode() {
  mode = mode === "reg" ? "login" : "reg";

  if ($("authTitle"))
    $("authTitle").textContent = mode === "reg" ? "ساخت حساب" : "ورود";

  if ($("authButton"))
    $("authButton").textContent = mode === "reg" ? "ثبت نام" : "ورود";

  if ($("modeButton"))
    $("modeButton").textContent =
      mode === "reg" ? "حساب دارم" : "ساخت حساب جدید";
}

async function auth() {
  try {
    const d = await api(
      mode === "reg" ? "/api/register" : "/api/login",
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          username: $("user") ? $("user").value.trim() : "",
          password: $("pass") ? $("pass").value : ""
        })
      }
    );

    enter(d.user);
  } catch (e) {
    setText("aerr", e.message);
  }
}

function enter(u) {
  user = u;

  if ($("gate")) $("gate").classList.add("hide");
  if ($("auth")) $("auth").classList.add("hide");
  if ($("chat")) $("chat").classList.remove("hide");

  setText("me", "@" + u.username);

if(u.role==="owner"){
  if($("adminBtn")){
    $("adminBtn").classList.remove("hide");
  }
}

  room = "general";

  showHome();
  users();
}

async function users() {
  if (!user) return;

  let list = [];
  let last = {};

  try {
    const us = await api("/api/users");
    list = Array.isArray(us)
      ? us.filter(x => String(x.id) !== String(user.id))
      : [];

    last = await api("/api/last-messages");
  } catch {}

  const contacts = $("contacts");
  if (!contacts) return;

  if (list.length === 0) {
    list = [
      {id:"test1", username:"علی"},
      {id:"test2", username:"محمد"},
      {id:"test3", username:"دوست من"}
    ];
  }

  function preview(id){
    let r = privateRoom(user.id,id);
    if(last[r]){
      return last[r].text || "📎 فایل";
    }
    return "شروع گفتگو";
  }

  contacts.innerHTML = `
    <div class="sectionTitle">گفتگوها</div>

    <div class="chatitem generalItem" onclick="openGeneral()">
      <div class="avatar">🌐</div>
      <div class="chatinfo">
        <div class="chatname">عمومی</div>
        <div class="lastmsg">گفتگوی عمومی</div>
      </div>
    </div>

    ${list.map(x=>`
      <div class="chatitem"
      onclick='openPrivate(${JSON.stringify(String(x.id))},${JSON.stringify(String(x.username))})'>
        <div class="avatar">👤</div>
        <div class="chatinfo">
          <div class="chatname">
${onlineUsers.includes(String(x.username)) ? "🟢 " : "⚪ "}
${escapeHtml(x.username)}
</div>
          <div class="lastmsg">${statusText(x.id)}<br>${escapeHtml(preview(x.id))}</div>
        </div>
      </div>
    `).join("")}
  `;

  const side=$("chatlist");
  if(side){
    side.innerHTML=list.map(x=>`
      <div class="chatitem smallItem"
      onclick='openPrivate(${JSON.stringify(String(x.id))},${JSON.stringify(String(x.username))})'>
        <div class="avatar">👤</div>
        <div class="chatinfo">
          <div class="chatname">
${onlineUsers.includes(String(x.username)) ? "🟢 " : "⚪ "}
${escapeHtml(x.username)}
</div>
        </div>
      </div>
    `).join("");
  }
}
function openGeneral() {
  room = "general";

  if ($("contacts")) $("contacts").style.display = "none";
  if ($("messages")) $("messages").style.display = "block";

  setText("title", "عمومی");

  load();
}

function openPrivate(id, username) {
  room = privateRoom(user.id, id);
  unread[room]=0;

  if ($("contacts")) $("contacts").style.display = "none";
  if ($("messages")) $("messages").style.display = "block";

  setText("title", "گفتگو با " + username);

  load();
}

async function load() {
  if (!user) return;

  socket.emit("join", {
    room,
    username: user.username
  });

  if ($("messages")) {
    $("messages").innerHTML =
      '<div class="loading">در حال بارگذاری...</div>';
    $("messages").style.display = "block";
  }

  try {
    const data = await api(
      "/api/messages/" + encodeURIComponent(room)
    );

    if ($("messages")) {
      $("messages").innerHTML = "";
      (Array.isArray(data) ? data : []).forEach(show);
      scrollMessages();
    }
  } catch (e) {
    if ($("messages"))
      $("messages").innerHTML =
        '<div class="loading">خطا در بارگذاری پیام‌ها</div>';
  }
}

function show(m) {
  if (!m) return;

  const box = $("messages");
  if (!box) return;

  const d = document.createElement("div");

  d.className =
    "bubble " +
    (m.username === user?.username ? "mine" : "theirs");

  d.dataset.id = m.id || "";

  const time = new Date(
    m.time || Date.now()
  ).toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  let body = "";

if(m.reply){
 body += `
 <div class="replyBox">
 ↩️ پاسخ به: ${escapeHtml(m.reply.text || "")}
 </div>`;
}

  if (m.file) {
    const f = m.file;
    const url =
      typeof f === "string"
        ? f
        : f.url || f.path || f.location || "";

    if (url) {
      const lower = url.toLowerCase();

      if (
        lower.includes(".webm") ||
        lower.includes(".mp3") ||
        lower.includes(".wav") ||
        lower.includes(".ogg") ||
        lower.includes("audio")
      ) {
        body += `<audio controls src="${escapeHtml(url)}"></audio>`;
      } else if (
        lower.includes(".jpg") ||
        lower.includes(".jpeg") ||
        lower.includes(".png") ||
        lower.includes(".gif") ||
        lower.includes(".webp") ||
        lower.includes("image")
      ) {
        body += `<img class="messageImage" src="${escapeHtml(url)}">`;
      } else {
        body += `
          <a class="fileLink"
             href="${escapeHtml(url)}"
             target="_blank">
             📎 فایل
          </a>
        `;
      }
    }
  }

  if (m.text) {
    body += `<div class="messageText">${escapeHtml(m.text)}</div>`;
  }

  d.innerHTML = `
    <div class="bubbleTop">
      <small>${escapeHtml(m.username || "")}</small>
      <button class="moreBtn"
              onclick="messageMenu(this.closest('.bubble').dataset.id)">⋮</button>
    </div>

    ${body}

    <div class="reactions" id="react-${m.id}">
${m.reactions ? Object.entries(m.reactions).map(([r,a])=>r+" "+a.length).join(" ") : ""}
</div>

<div class="reactBtns">
<button onclick="react('${m.id}','❤️')">❤️</button>
<button onclick="react('${m.id}','😂')">😂</button>
<button onclick="react('${m.id}','👍')">👍</button>
<button onclick="react('${m.id}','😮')">😮</button>
</div>

<div class="time">
${time}
${m.username===user?.username ? (m.status==="read" ? " ✓✓" : " ✓") : ""}
</div>
  `;

  box.appendChild(d);
}



function react(id,react){

 socket.emit("reactMessage",{
   id,
   react
 });

}


socket.on("messageReact",data=>{

 const box=document.getElementById("react-"+data.id);

 if(box){

   box.innerHTML=Object.entries(data.reactions)
   .map(([r,a])=>r+" "+a.length)
   .join(" ");

 }

});




function editMessage(id,text){

 let n=prompt("ویرایش پیام:",text);

 if(n!==null && n.trim()){

   socket.emit("editMessage",{
     id,
     text:n.trim()
   });

 }

}


socket.on("messageEdited",data=>{

 const el=document.querySelector(
 `.bubble[data-id="${CSS.escape(String(data.id))}"]`
 );

 if(el){

   const txt=el.querySelector(".messageText");

   if(txt){
     txt.textContent=data.text+" ✏️";
   }

 }

});


function scrollMessages() {
  const box = $("messages");
  if (box) {
    setTimeout(() => {
      box.scrollTop = box.scrollHeight;
    }, 30);
  }
}

function send() {
  if (!user) return;

  const input = $("text");
  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  socket.emit("message", {
    room,
    text,
    reply: replyTo
  });

  replyTo=null;

  input.value = "";
  input.focus();
}

async function sendFile() {
  if (!user) return;

  const input = $("file");
  const f = input?.files?.[0];

  if (!f) return;

  try {
    const fd = new FormData();
    fd.append("file", f);

    const d = await api("/api/upload", {
      method: "POST",
      body: fd
    });

    socket.emit("message", {
      room,
      file: d
    });

    input.value = "";
  } catch (e) {
    alert(e.message);
  }
}

async function voice() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("ضبط صدا در این مرورگر در دسترس نیست");
    return;
  }

  if (rec && rec.state === "recording") {
    rec.stop();
    return;
  }

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({audio:true});

    chunks = [];

    rec = new MediaRecorder(stream);

    rec.ondataavailable = e => {
      if (e.data.size) chunks.push(e.data);
    };

    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());

      try {
        const blob = new Blob(chunks, {
          type: "audio/webm"
        });

        const fd = new FormData();

        fd.append(
          "file",
          blob,
          "voice.webm"
        );

        const d = await api("/api/upload", {
          method: "POST",
          body: fd
        });

        socket.emit("message", {
          room,
          file: d
        });
      } catch (e) {
        alert(e.message);
      }

      chunks = [];
    };

    rec.start();
  } catch (e) {
    alert("اجازه دسترسی به میکروفون داده نشد");
  }
}

function messageMenu(id) {
  if (!id) return;

  if (confirm("این پیام حذف شود؟")) {
    socket.emit("deleteMessage", id);
  }
}

function home() {
  showHome();
}

function showHome() {
  room = "general";

  if ($("messages")) {
    $("messages").innerHTML = "";
    $("messages").style.display = "none";
  }

  if ($("contacts")) {
    $("contacts").style.display = "block";
  }

  setText("title", "گفتگوها");

  users();
}

function support() {
  const msg = prompt("پیام خود را برای پشتیبانی بنویسید:");

  if (!msg || !msg.trim()) return;

  socket.emit("message", {
    room: "support",
    text: msg.trim()
  });

  alert("پیام شما برای پشتیبانی ارسال شد.");
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {}

  location.reload();
}

socket.on("message", msg => {
  if (!msg) return;

  if (msg.room === room) {
    show(msg);

    if(msg.id && msg.username !== user.username){
      socket.emit("readMessage",msg.id);
    }

    scrollMessages();
  } else {

    unread[msg.room] = (unread[msg.room] || 0) + 1;

    users();
  }
});



socket.on("messageRead",id=>{
  const el=document.querySelector(`.bubble[data-id="${CSS.escape(String(id))}"]`);

  if(el){
    const t=el.querySelector(".time");
    if(t && !t.textContent.includes("✓✓")){
      t.textContent += " ✓✓";
    }
  }
});

socket.on("deleted", id => {
  document.querySelectorAll(".bubble").forEach(el=>{
    if(String(el.dataset.id)===String(id)){
      el.remove();
    }
  });
});

(async function boot() {
  try {
    const m = await api("/api/me");

    if (m.access) {
      if (m.user) {
        enter(m.user);
      } else {
        if ($("gate")) $("gate").classList.add("hide");
        if ($("auth")) $("auth").classList.remove("hide");
      }
    }
  } catch {}
})();


function openAdmin(){

 if($("admin")){
   $("chat").classList.add("hide");
   $("admin").classList.remove("hide");
 }

}


async function loadAdmin(){

 let code=$("adminCode").value.trim();

 if(!code) return alert("رمز مدیر را وارد کن");


 try{

 let users=await api("/api/admin/users",{
   method:"POST",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    adminCode:code
   })
 });


 $("adminUsers").innerHTML=users.map(u=>`

 <div class="chatitem">

 <b>${escapeHtml(u.username)}</b>

 ${u.approved ? "✅ تایید شده" : "⏳ در انتظار"}

 <button onclick="approveUser('${u.id}','${code}')">
 تایید
 </button>

 <button onclick="deleteUser('${u.id}','${code}')">
 حذف
 </button>

 </div>

 `).join("");


 }catch(e){
  alert(e.message);
 }

}


async function approveUser(id,code){

 await api("/api/admin/approve/"+id,{
 method:"POST",
 headers:{
 "Content-Type":"application/json"
 },
 body:JSON.stringify({
 adminCode:code
 })
 });

 loadAdmin();

}


async function deleteUser(id,code){

 if(!confirm("حذف شود؟")) return;

 await api("/api/admin/delete/"+id,{
 method:"POST",
 headers:{
 "Content-Type":"application/json"
 },
 body:JSON.stringify({
 adminCode:code
 })
 });

 loadAdmin();

}

