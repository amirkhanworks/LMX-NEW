import { chromium } from "playwright";
import fs from "node:fs/promises";

const BASE = "https://amirkhanworks.github.io/LMX-NEW/";
const pages = {
  home: BASE,
  about: BASE + "about.html",
  engineering: BASE + "services.html"
};
const required = {
  home: [
    "The home you already have",
    "Every room, automated.",
    "Three ways to control your home.",
    "One press.",
    "Safe by design.",
    "It moves with you.",
    "The details that matter.",
    "What beta testers say.",
    "One company. Two paths.",
    "Bring your home into one system."
  ],
  about: [
    "Make intelligent living practical for every home — without asking people to replace the home they already have.",
    "We build retrofit smart-home technology that works with existing homes, and bring the same end-to-end IoT engineering discipline to connected products and systems."
  ],
  engineering: [
    "What we work with",
    "Hardware & Firmware","ESP32","KiCad","Embedded firmware",
    "Connectivity","MQTT","LoRa","Cellular LTE",
    "Systems & Data","Cloud telemetry","Sensor networks"
  ]
};
const techExpected = ["ESP32","KiCad","Embedded firmware","MQTT","LoRa","Cellular LTE","Cloud telemetry","Sensor networks"];
const prohibitedInTech = ["ESP32-S3","AWS","databases","APIs","Python","C/C++","React","Kubernetes","Azure","Google Cloud"];

await fs.mkdir("qa/live",{recursive:true});
const browser = await chromium.launch({headless:true});
const results = {generatedAt:new Date().toISOString(), pages:{}, overall:"PASS"};

function normalize(s){ return (s || "").replace(/\s+/g," ").trim(); }
function boxData(e){
  if(!e) return null;
  const b=e.getBoundingClientRect();
  const cs=getComputedStyle(e);
  return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,fontSize:cs.fontSize,lineHeight:cs.lineHeight};
}

for (const [name,url] of Object.entries(pages)) {
  results.pages[name] = {};
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const context = await browser.newContext({viewport,deviceScaleFactor:1});
    await context.addInitScript(() => {
      Object.defineProperty(window,"matchMedia",{configurable:true,value:((orig) => (q) => {
        const m=orig.call(window,q);
        if(q.includes("prefers-reduced-motion")) Object.defineProperty(m,"matches",{value:true,configurable:true});
        return m;
      })(window.matchMedia)});
    });
    const page=await context.newPage();
    const consoleErrors=[];
    page.on("console",m=>{if(m.type()==="error") consoleErrors.push(m.text())});
    const response=await page.goto(url,{waitUntil:"networkidle",timeout:60000});
    await page.waitForTimeout(1000);
    const data=await page.evaluate(({name,required,techExpected,prohibitedInTech})=>{
      const body=document.body, doc=document.documentElement;
      const txt=body ? body.innerText : "";
      const clean=normalize(txt);
      const req=(required[name]||[]).map(t=>({text:t,found:txt.includes(t)||clean.includes(normalize(t))}));
      const viewport=doc.clientWidth;
      const scrollWidth=Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
      const d={status:0,href:location.href,title:document.title,viewport,scrollWidth,horizontalOverflow:scrollWidth>viewport+1,required:req,boxes:{},consoleErrors:[]};
      if(name==="home"){
        for(const id of ["hero-title","rooms-title","zoom-title","keychain-title","safe-title","renter-title","proof-title","testimonials-title","bridge-title","cta-title"]) d.boxes[id]=boxData(document.getElementById(id));
      }
      if(name==="about"){
        d.oldVision=txt.includes("To empower people with complete control over their homes through smart and reliable technology.");
        d.oldMission=txt.includes("To make smart home automation affordable, easy to use, and accessible to everyone.");
        d.visionBox=boxData(document.querySelector(".vision-item:first-child > p:last-child"));
        d.missionBox=boxData(document.querySelector(".vision-item:last-child > p:last-child"));
        d.visionSection=boxData(document.querySelector(".vision"));
      }
      if(name==="engineering"){
        const groups=[...document.querySelectorAll(".tech-group")];
        d.techGroups=groups.map(g=>({items:[...g.querySelectorAll("li")].map(x=>normalize(x.innerText)),box:boxData(g),labelBox:boxData(g.querySelector("p.mono"))}));
        d.techItems=[...document.querySelectorAll(".tech-group__items li")].map(x=>normalize(x.innerText));
        const tech=document.querySelector(".tech");
        d.techText=tech ? tech.innerText : "";
        d.prohibitedInTech=prohibitedInTech.filter(x=>d.techText.includes(x));
        const styles=groups.map(g=>({before:{content:getComputedStyle(g,"::before").content,width:getComputedStyle(g,"::before").width,height:getComputedStyle(g,"::before").height,display:getComputedStyle(g,"::before").display,background:getComputedStyle(g,"::before").backgroundColor},after:{content:getComputedStyle(g,"::after").content,width:getComputedStyle(g,"::after").width,height:getComputedStyle(g,"::after").height,display:getComputedStyle(g,"::after").display,background:getComputedStyle(g,"::after").backgroundColor}}));
        d.groupPseudo=styles;
        d.outerBorder=getComputedStyle(document.querySelector(".tech-groups")).borderTopStyle !== "none" || getComputedStyle(document.querySelector(".tech-groups")).borderLeftStyle !== "none" || getComputedStyle(document.querySelector(".tech-groups")).borderRightStyle !== "none" || getComputedStyle(document.querySelector(".tech-groups")).borderBottomStyle !== "none";
        d.techExpectedMatch=JSON.stringify(d.techItems)===JSON.stringify(techExpected);
      }
      return d;
    },{name,required,techExpected,prohibitedInTech});
    data.status=response ? response.status() : 0;
    data.consoleErrors=consoleErrors;
    results.pages[name][String(viewport.width)+"x"+String(viewport.height)]=data;
    await page.screenshot({path:"qa/live/"+name+"-"+viewport.width+"x"+viewport.height+".png",fullPage:true});
    await context.close();
  }
}
await browser.close();

for(const viewports of Object.values(results.pages)){
  for(const d of Object.values(viewports)){
    if(d.status<200||d.status>=300||d.horizontalOverflow||d.consoleErrors.length||d.oldVision||d.oldMission||d.prohibitedInTech?.length||d.required.some(x=>!x.found)||d.techItems && !d.techExpectedMatch||d.techGroups && d.techGroups.length!==3) results.overall="FAIL";
  }
}
await fs.writeFile("qa/live/results.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
process.exitCode=results.overall==="PASS"?0:1;