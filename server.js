import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `.env` is the preferred production configuration. `mem.env` keeps this
// demonstration runnable locally when no separate `.env` file exists.
dotenv.config();
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.join(__dirname, "mem.env") });
}
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Nikita2265";
const sessions = new Set();
const dataFile = path.join(__dirname, "data.json");

const slots = [
  {id:"s1",date:"2026-09-03",time:"10:00",doctor:"Д-р Олена Коваленко",service:"Консультація"},
  {id:"s2",date:"2026-09-03",time:"13:30",doctor:"Д-р Андрій Мельник",service:"Професійна чистка"},
  {id:"s3",date:"2026-09-03",time:"16:00",doctor:"Д-р Олена Коваленко",service:"Лікування карієсу"},
  {id:"s4",date:"2026-09-04",time:"09:30",doctor:"Д-р Андрій Мельник",service:"Консультація"},
  {id:"s5",date:"2026-09-04",time:"12:00",doctor:"Д-р Олена Коваленко",service:"Професійна чистка"}
];
const bookings = new Map();

async function readData(){ try { return JSON.parse(await fs.readFile(dataFile,"utf8")); } catch { return {patients:[],leads:[],appointments:[],conversations:[]}; } }
async function writeData(d){ await fs.writeFile(dataFile, JSON.stringify(d,null,2)); }

function airtableReady(){ return Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID); }
async function airtableCreate(table, fields){
  if(!airtableReady()) return false;
  const url=`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
  const r=await fetch(url,{method:"POST",headers:{"Authorization":`Bearer ${process.env.AIRTABLE_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({fields})});
  if(!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
  return true;
}
async function sync(table, fields){
  try { await airtableCreate(table, fields); } catch(e){ console.error("CRM sync:",e.message); }
}

function telegramReady(){ return Boolean(process.env.TELEGRAM_BOT_TOKEN); }
function whatsappReady(){ return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID); }
function cleanPhone(phone){ return String(phone||"").replace(/\D/g,""); }
async function sendTelegram(chatId, text){
  if(!telegramReady() || !chatId) return false;
  const r=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text})});
  if(!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
  return true;
}
async function sendWhatsApp(to, text){
  const recipient=cleanPhone(to);
  if(!whatsappReady() || !recipient) return false;
  const url=`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r=await fetch(url,{method:"POST",headers:{"Authorization":`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:recipient,type:"text",text:{body:text}})});
  if(!r.ok) throw new Error(`WhatsApp ${r.status}: ${await r.text()}`);
  return true;
}
async function notifyOwner(booking){
  const text=`🦷 Нова заявка NovaDent\nКлієнт: ${booking.name}\nТелефон: ${booking.phone}\nПослуга: ${booking.service}\nЧас: ${booking.date} ${booking.time}\nЛікар: ${booking.doctor}`;
  await Promise.allSettled([sendTelegram(process.env.TELEGRAM_OWNER_CHAT_ID,text),sendWhatsApp(process.env.WHATSAPP_OWNER_PHONE,text)]);
}
async function assistantReply(message){
  if(!process.env.OPENAI_API_KEY) return {reply:"Дякую за звернення! Я можу допомогти із записом до стоматолога. Напишіть, будь ласка, бажану послугу або день.",mode:"demo"};
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",instructions:`You are Nova, an AI receptionist for a dental clinic. Understand Ukrainian, Russian, and English. ALWAYS reply in natural Ukrainian. You are an administrator, not a doctor. Never diagnose or prescribe treatment. Help with services, prices, doctors, appointment questions and collecting contact details. Keep replies concise and friendly.`,input:message,max_output_tokens:400})});
  if(!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j=await r.json();
  return {reply:j.output_text || j.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("") || "Вибачте, не вдалося сформувати відповідь.",mode:"live"};
}

function auth(req,res,next){
  const token=req.headers.authorization?.replace(/^Bearer\s+/,"") || req.cookies?.admin;
  if(!token || !sessions.has(token)) return res.status(401).json({error:"Unauthorized"});
  next();
}
function requirePassword(req,res){
  const {password}=req.body||{};
  if(!password || password !== ADMIN_PASSWORD) return res.status(401).json({error:"Invalid password"});
  const token=crypto.randomBytes(32).toString("hex");
  sessions.add(token);
  res.json({ok:true,token});
}

app.get("/api/health",(req,res)=>res.json({ok:true,ai:Boolean(process.env.OPENAI_API_KEY),airtable:airtableReady(),telegram:telegramReady(),whatsapp:whatsappReady(),mode:process.env.OPENAI_API_KEY?"live":"demo"}));
app.get("/api/slots",(req,res)=>res.json(slots.filter(s=>!bookings.has(s.id))));
app.post("/api/admin/login",requirePassword);
app.get("/api/admin/me",auth,(req,res)=>res.json({ok:true}));

app.post("/api/chat", async (req,res)=>{
  const message=String(req.body?.message||"").trim();
  if(!message) return res.status(400).json({error:"Message is required"});
  try{ res.json(await assistantReply(message)); }catch(e){ res.status(502).json({error:e.message}); }
});

app.post("/api/book",async(req,res)=>{
  const {slotId,name,phone,service="Консультація"}=req.body||{};
  const slot=slots.find(s=>s.id===slotId);
  if(!slot) return res.status(404).json({error:"Slot not found"});
  if(bookings.has(slotId)) return res.status(409).json({error:"Slot already booked"});
  if(!name||!phone) return res.status(400).json({error:"Name and phone are required"});
  const booking={id:"b"+Date.now(),slotId,name,phone,service,doctor:slot.doctor,date:slot.date,time:slot.time,status:"Новий"};
  bookings.set(slotId,booking);
  const d=await readData();
  d.patients.push({id:booking.id,name,phone,createdAt:new Date().toISOString()});
  d.leads.push({id:booking.id,name,phone,service,status:"Новий",source:"Website",createdAt:new Date().toISOString()});
  d.appointments.push(booking);
  await writeData(d);
  await Promise.all([
    sync(process.env.AIRTABLE_LEADS_TABLE||"Leads",{Name:name,Phone:phone,Service:service,Status:"Новий",Source:"Website","Created At":new Date().toISOString()}),
    sync(process.env.AIRTABLE_PATIENTS_TABLE||"Patients",{Name:name,Phone:phone,"Created At":new Date().toISOString()}),
    sync(process.env.AIRTABLE_APPOINTMENTS_TABLE||"Appointments",{Appointment:`${slot.date} ${slot.time}`,Patient:name,Phone:phone,Service:service,Doctor:slot.doctor,Start:`${slot.date} ${slot.time}`,Status:"Новий"}),
    notifyOwner(booking)
  ]);
  res.json({ok:true,booking});
});

app.get("/api/webhooks/whatsapp",(req,res)=>{
  if(req.query["hub.verify_token"]!==process.env.WHATSAPP_VERIFY_TOKEN) return res.sendStatus(403);
  res.status(200).send(req.query["hub.challenge"]||"");
});
app.post("/api/webhooks/telegram",async(req,res)=>{
  const message=req.body?.message;
  const text=String(message?.text||"").trim();
  if(text && message?.chat?.id){ try{ const answer=await assistantReply(text); await sendTelegram(message.chat.id,answer.reply); }catch(e){ console.error("Telegram webhook:",e.message); } }
  res.sendStatus(200);
});
app.post("/api/webhooks/whatsapp",async(req,res)=>{
  const value=req.body?.entry?.[0]?.changes?.[0]?.value;
  const message=value?.messages?.[0], text=message?.text?.body, from=message?.from;
  if(text && from){ try{ const answer=await assistantReply(text); await sendWhatsApp(from,answer.reply); }catch(e){ console.error("WhatsApp webhook:",e.message); } }
  res.sendStatus(200);
});

app.get("/api/admin/data",auth,async(req,res)=>{
  const d=await readData();
  res.json({
    patients:d.patients, leads:d.leads, appointments:d.appointments,
    conversations:d.conversations,
    stats:{patients:d.patients.length,leads:d.leads.length,appointments:d.appointments.length}
  });
});
app.patch("/api/admin/appointments/:id",auth,async(req,res)=>{
  const allowedStatuses=["Новий","Підтверджено","Завершено","Скасовано"];
  const status=String(req.body?.status||"");
  if(!allowedStatuses.includes(status)) return res.status(400).json({error:"Invalid status"});
  const d=await readData();
  const appointment=d.appointments.find(x=>x.id===req.params.id);
  if(!appointment) return res.status(404).json({error:"Appointment not found"});
  appointment.status=status;
  const lead=d.leads.find(x=>x.id===appointment.id);
  if(lead) lead.status=status;
  await writeData(d);
  res.json({ok:true,appointment});
});
app.post("/api/admin/logout",auth,(req,res)=>{
  const token=req.headers.authorization?.replace(/^Bearer\s+/,""); if(token)sessions.delete(token); res.json({ok:true});
});

app.get(["/admin","/owner"],(req,res)=>res.sendFile(path.join(__dirname,"public","owner.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`NovaDent Pro running at http://localhost:${PORT}`));
