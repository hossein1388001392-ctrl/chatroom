x
const express=require("express"),http=require("http"),path=require("path"),fs=require("fs"),crypto=require("crypto"),bcrypt=require("bcryptjs"),session=require("express-session"),multer=require("multer");
const {Server}=require("socket.io");
const app=express(),server=http.createServer(app),io=new Server(server);
const PORT=process.env.PORT||3000,ACCESS_CODE="123456",SECRET="change-this-secret";
const data=path.join(__dirname,"data"),uploads=path.join(__dirname,"public/uploads");
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(uploads,{recursive:true});
const uf=path.join(data,"users.json"),mf=path.join(data,"messages.json");
function read(f,d){try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return d}}
function write(f,d){fs.writeFileSync(f,JSON.stringify(d,null,2))}
function clean(u){return{id:u.id,username:u.username}}
app.use(express.json());
app.use(session({secret:SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",maxAge:604800000}}));
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"ابتدا وارد حساب شوید"});next()}
app.post("/api/access",(req,res)=>{if(String(req.body.code||"")!==ACCESS_CODE)return res.status(403).json({error:"رمز ورود اشتباه است"});req.session.access=true;res.json({ok:true})});
app.post("/api/register",async(req,res)=>{
if(!req.session.access)return res.status(403).json({error:"ابتدا رمز ورود را وارد کنید"});
let username=String(req.body.username||"").trim(),password=String(req.body.password||"");
if(username.length<3||username.length>30)return res.status(400).json({error:"نام کاربری باید ۳ تا ۳۰ کاراکتر باشد"});
if(password.length<6)return res.status(400).json({error:"رمز حساب حداقل ۶ کاراکتر باشد"});
let users=read(uf,[]);
if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:"این نام کاربری قبلاً وجود دارد"});
let u={id:crypto.randomUUID(),username,passwordHash:await bcrypt.hash(password,10)};
users.push(u);write(uf,users);req.session.userId=u.id;res.json({user:clean(u)})
});
app.post("/api/login",async(req,res)=>{
if(!req.session.access)return res.status(403).json({error:"ابتدا رمز ورود را وارد کنید"});
let users=read(uf,[]),u=users.find(x=>x.username.toLowerCase()===String(req.body.username||"").toLowerCase());
if(!u||!(await bcrypt.compare(String(req.body.password||""),u.passwordHash)))return res.status(401).json({error:"اطلاعات ورود اشتباه است"});
req.session.userId=u.id;res.json({user:clean(u)})
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>{let u=read(uf,[]).find(x=>x.id===req.session.userId);res.json({user:u?clean(u):null,access:!!req.session.access})});
app.get("/api/users",auth,(req,res)=>res.json(read(uf,[]).map(clean)));
app.get("/api/messages/:room",auth,(req,res)=>{let r=String(req.params.room).slice(0,100);res.json(read(mf,[]).filter(x=>x.room===r).slice(-100))});
const storage=multer.diskStorage({destination:uploads,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname))});
const upload=multer({storage,limits:{fileSize:50*1024*1024}});
app.post("/api/upload",auth,upload.single("file"),(req,res)=>{
if(!req.file)return res.status(400).json({error:"فایل دریافت نشد"});
res.json({url:"/uploads/"+req.file.filename,name:req.file.originalname,type:req.file.mimetype,size:req.file.size})
});
app.use(express.static(path.join(__dirname,"public")));
io.on("connection",socket=>{
socket.on("join",x=>{socket.join(String(x.room));socket.data.username=String(x.username||"کاربر")});
socket.on("message",x=>{
let room=String(x.room||"").slice(0,100),text=String(x.text||"").slice(0,2000);
if(!room||(!text&&!x.file))return;
let m={id:crypto.randomUUID(),room,username:socket.data.username||"کاربر",text,file:x.file||null,time:new Date().toISOString()};
let ms=read(mf,[]);ms.push(m);if(ms.length>5000)ms=ms.slice(-5000);write(mf,ms);io.to(room).emit("message",m)
})
});
server.listen(PORT,"0.0.0.0",()=>console.log("ChatRoom: http://127.0.0.1:"+PORT));
