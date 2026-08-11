
const socket=io();let mode="reg",user=null,room="general",rec=null,chunks=[];
const $=x=>document.getElementById(x);
async function api(u,o={}){let r=await fetch(u,o),d=await r.json();if(!r.ok)throw Error(d.error||"خطا");return d}
async function access(){try{await api("/api/access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:$("code").value})});$("gate").classList.add("hide");$("auth").classList.remove("hide")}catch(e){$("err").textContent=e.message}}
async function auth(){try{let d=await api(mode==="reg"?"/api/register":"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("user").value,password:$("pass").value})});enter(d.user)}catch(e){$("aerr").textContent=e.message}}
function enter(u){
user=u;
$("auth").classList.add("hide");
$("chat").classList.remove("hide");
$("me").textContent="@"+u.username;
users();
$("messages").innerHTML="";
$("messages").style.display="none";
$("chatlist").style.display="block";
$("title").textContent="گفتگوها";
}
async function users(){
let us=await api("/api/users");
let list=us.filter(x=>x.id!==user.id);

if(list.length===0){
list=[
{id:"test1",username:"علی"},
{id:"test2",username:"محمد"},
{id:"test3",username:"دوست من"}
];
}

if($("chatlist")){
$("chatlist").style.display="block";
$("messages").style.display="none";
$("chatlist").innerHTML=list.map(x=>`
<div class="chatitem" onclick="openChat('${x.id}','${x.username}')">
<div class="avatar">👤</div>
<div class="chatinfo">
<div class="chatname">${x.username}</div>
<div class="lastmsg">شروع گفتگو</div>
</div>
</div>
`).join("");
}
}

async function load(){socket.emit("join",{room,username:user.username});$("title").textContent=room==="general"?"عمومی":"گفتگوی خصوصی";$("messages").innerHTML="";(await api("/api/messages/"+encodeURIComponent(room))).forEach(show)}
function show(m){
let d=document.createElement("div");
d.className="bubble "+(m.username===user.username?"mine":"");
d.dataset.id=m.id;

let time=new Date(m.time||Date.now()).toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"});

let x=`<small>${m.username}</small><br>${esc(m.text)}<div class="time">${time}</div>`;

if(m.file?.type?.startsWith("image/")) x+=`<br><img src="${m.file.url}">`;
else if(m.file?.type?.startsWith("video/")) x+=`<br><video src="${m.file.url}" controls></video>`;
else if(m.file) x+=`<br><audio src="${m.file.url}" controls></audio>`;

x+=`<button class="more" onclick="menuMsg('${m.id}')">⋮</button>
<div id="menu-${m.id}" class="menu">
<button onclick="delMsg('${m.id}')">حذف</button>
</div>`;

d.innerHTML=x;

$("messages").appendChild(d);
$("messages").scrollTop=$("messages").scrollHeight;
}

function esc(x){return String(x||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
socket.on("message",m=>{if(m.room===room)show(m)})
function send(){let t=$("text").value.trim();if(t){socket.emit("message",{room,text:t});$("text").value=""}}
async function sendFile(){let f=$("file").files[0];if(!f)return;let fd=new FormData();fd.append("file",f);try{let d=await api("/api/upload",{method:"POST",body:fd});socket.emit("message",{room,file:d});$("file").value=""}catch(e){alert(e.message)}}
async function voice(){if(rec?.state==="recording"){rec.stop();return}let s=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(s);rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{s.getTracks().forEach(t=>t.stop());let fd=new FormData();fd.append("file",new Blob(chunks,{type:"audio/webm"}),"voice.webm");let d=await api("/api/upload",{method:"POST",body:fd});socket.emit("message",{room,file:d})};rec.start()}
async function logout(){await api("/api/logout",{method:"POST"});location.reload()}
(async()=>{let m=await api("/api/me");if(m.access){$("gate").classList.add("hide");if(m.user){enter(m.user);users();}else $("auth").classList.remove("hide")}})()
function support(){
  let msg = prompt("پیام خود را برای پشتیبانی بنویسید:");
  if(msg){
    socket.emit("message",{
      room:"support",
      text:"🛠️ پیام پشتیبانی: "+msg
    });
    alert("پیام شما ارسال شد");
  }
}


function delMsg(id){
 if(confirm("حذف پیام؟")){
  socket.emit("deleteMessage",id);
 }
}

socket.on("deleted",id=>{
 let e=document.querySelector(`[data-id="${id}"]`);
 if(e) e.remove();
});

function menuMsg(id){
let m=document.getElementById("menu-"+id);
if(m)m.style.display=m.style.display==="block"?"none":"block";
}

function home(){
$("messages").style.display="none";
$("chatlist").style.display="block";
$("title").textContent="گفتگوها";
users();
}





function openChat(id,name){
 let ids=[user.id,String(id)].sort();
room="dm:"+ids.join(":");

 $("chatlist").style.display="none";
 $("contacts").style.display="none";
 $("messages").style.display="block";

 $("title").textContent=name;

 load();
}
