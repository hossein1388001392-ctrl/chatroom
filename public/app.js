const socket = io();

let mode = "reg";
let user = null;
let room = "general";
let rec = null;
let chunks = [];

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

  room = "general";

  showHome();
  users();
}

async function users() {
  if (!user) return;

  let list = [];

  try {
    const us = await api("/api/users");
    list = Array.isArray(us)
      ? us.filter(x => String(x.id) !== String(user.id))
      : [];
  } catch {}

  const contacts = $("contacts");

  if (!contacts) return;

  contacts.style.display = "block";

  if (list.length === 0) {
    list = [
      {id:"test1", username:"علی"},
      {id:"test2", username:"محمد"},
      {id:"test3", username:"دوست من"}
    ];
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

    ${list.map(x => {
      const rid = privateRoom(user.id, x.id);
      return `
        <div class="chatitem" onclick='openPrivate(${JSON.stringify(String(x.id))},${JSON.stringify(String(x.username))})'>
          <div class="avatar">👤</div>
          <div class="chatinfo">
            <div class="chatname">${escapeHtml(x.username)}</div>
            <div class="lastmsg">شروع گفتگو</div>
          </div>
        </div>
      `;
    }).join("")}
  `;

  const side = $("chatlist");
  if (side) {
    side.innerHTML = list.map(x => `
      <div class="chatitem smallItem"
           onclick='openPrivate(${JSON.stringify(String(x.id))},${JSON.stringify(String(x.username))})'>
        <div class="avatar">👤</div>
        <div class="chatinfo">
          <div class="chatname">${escapeHtml(x.username)}</div>
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

    <div class="time">${time}</div>
  `;

  box.appendChild(d);
}

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
    text
  });

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
    scrollMessages();
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
