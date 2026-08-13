const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);

const PORT=process.env.PORT||3000;
const ACCESS_CODE="123456";

const data=path.join(__dirname,"data");
const uploads=path.join(__dirname,"public/uploads");

fs.mkdirSync(data,{recursive:true});
fs.mkdirSync(uploads,{recursive:true});

const usersFile=path.join(data,"users.json");
const messagesFile=path.join(data,"messages.json");

function read(file,def){
 try{return JSON.parse(fs.readFileSync(file))}
 catch{return def}
}

function write(file,data){
 fs.writeFileSync(file,JSON.stringify(data,null,2))
}

function userSafe(u){
 return {id:u.id,username:u.username}
}

app.use(express.json());

app.use(session({
 secret:"chat-secret",
 resave:false,
 saveUninitialized:false,
 cookie:{maxAge:86400000}
}));

function auth(req,res,next){
 if(!req.session.userId)
 return res.status(401).json({error:"ورود لازم است"});
 next();
}


app.post("/api/access",(req,res)=>{
 if(req.body.code!==ACCESS_CODE)
 return res.status(403).json({error:"رمز اشتباه"});
 req.session.access=true;
 res.json({ok:true});
});


app.post("/api/register",async(req,res)=>{

let users=read(usersFile,[]);

let username=req.body.username;
let password=req.body.password;

if(users.find(x=>x.username===username))
return res.status(400).json({error:"کاربر وجود دارد"});

let u={
id:crypto.randomUUID(),
username,
passwordHash:await bcrypt.hash(password,10)
};

users.push(u);
write(usersFile,users);

req.session.userId=u.id;

res.json({user:userSafe(u)});

});


app.post("/api/login",async(req,res)=>{

let users=read(usersFile,[]);

let u=users.find(
x=>x.username.toLowerCase()==String(req.body.username).toLowerCase()
);

if(!u || !(await bcrypt.compare(req.body.password,u.passwordHash)))
return res.status(401).json({error:"اطلاعات اشتباه"});

req.session.userId=u.id;

res.json({user:userSafe(u)});

});


app.get("/api/users",auth,(req,res)=>{
res.json(read(usersFile,[]).map(userSafe));
});




app.get("/api/last-messages",auth,(req,res)=>{
 let msgs=read(messagesFile,[]);
 let result={};

 msgs.forEach(m=>{
   if(!result[m.room] || result[m.room].time < m.time){
     result[m.room]=m;
   }
 });

 res.json(result);
});

app.get("/api/messages/:room",auth,(req,res)=>{

let msgs=read(messagesFile,[]);

res.json(
msgs.filter(x=>x.room===req.params.room)
);

});


const storage=multer.diskStorage({
destination:uploads,
filename:(req,file,cb)=>{
cb(null,crypto.randomUUID()+path.extname(file.originalname))
}
});

const upload=multer({storage});


app.post("/api/upload",auth,upload.single("file"),(req,res)=>{
res.json({
url:"/uploads/"+req.file.filename,
type:req.file.mimetype
});
});


app.use(express.static(path.join(__dirname,"public")));


let onlineUsers = {};
let lastSeen = {};

io.on("connection",socket=>{


socket.on("join",data=>{
socket.join(data.room);
socket.data.user=String(data.username);

onlineUsers[socket.data.user]=true;

io.emit("onlineUsers",Object.keys(onlineUsers));
io.emit("lastSeen",lastSeen);
});

socket.on("disconnect",()=>{
 if(socket.data.user){
   delete onlineUsers[socket.data.user];

   lastSeen[socket.data.user]=Date.now();

   io.emit("onlineUsers",Object.keys(onlineUsers));
   io.emit("lastSeen",lastSeen);
 }
});


socket.on("message",data=>{

let msg={
id:crypto.randomUUID(),
room:data.room,
username:socket.data.user,
text:data.text||"",
file:data.file||null,
reply:data.reply||null,
time:Date.now(),
status:"sent"
};

let msgs=read(messagesFile,[]);
msgs.push(msg);

write(messagesFile,msgs);

io.to(data.room).emit("message",msg);

});




socket.on("readMessage",id=>{

 let msgs=read(messagesFile,[]);

 let m=msgs.find(x=>x.id===id);

 if(m){
   m.status="read";
   write(messagesFile,msgs);

   io.emit("messageRead",id);
 }

});



socket.on("reactMessage",data=>{

 let msgs=read(messagesFile,[]);

 let m=msgs.find(x=>x.id===data.id);

 if(m){

   if(!m.reactions){
     m.reactions={};
   }

   if(!m.reactions[data.react]){
     m.reactions[data.react]=[];
   }

   if(!m.reactions[data.react].includes(socket.data.user)){
     m.reactions[data.react].push(socket.data.user);
   }

   write(messagesFile,msgs);

   io.emit("messageReact",{
     id:data.id,
     reactions:m.reactions
   });

 }

});


socket.on("deleteMessage",id=>{

let msgs=read(messagesFile,[]);

let index=msgs.findIndex(x=>
x.id===id &&
x.username===socket.data.user
);

if(index!==-1){

msgs.splice(index,1);

write(messagesFile,msgs);

io.emit("deleted",id);

}

});


});


server.listen(PORT,"0.0.0.0",()=>{
console.log("Server running");
});
