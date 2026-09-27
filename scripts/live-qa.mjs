import { chromium } from "playwright";
import fs from "node:fs/promises";

const BASE = "https://amirkhanworks.github.io/LMX-NEW/";
const pages = {
  home: BASE,
  about: BASE + "about.html",
  engineering: BASE + "services.html"
};
const viewports = [
  {width:1440,height:900},
  {width:1024,height:768},
  {width:390,height:844}
];
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

for (const [name,url] of Object.entries(pages)) {
  results.pages[name] = {};
  for (const viewport of viewports) {
    const context = await browser.newContext({viewport,deviceScaleFactor:1});
    const page = await context.newPage();
    await page.emulateMedia({reducedMotion:"reduce"});
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console",m=>{if(m.type()==="error") consoleErrors.push(m.text())});
    page.on("pageerror",e=>pageErrors.push(String(e)));
    let response = null;
    let navigationError = null;
    try {
      response = await page.goto(url,{waitUntil:"networkidle",timeout:60000});
      await page.waitForFunction(() => !document.documentElement.classList.contains("is-booting"), null, {timeout:8000}).catch(() => {});
      await page.waitForTimeout(700);
    } catch (e) {
      navigationError = String(e);
    }

    const data = await page.evaluate(({name,required,techExpected,prohibitedInTech,viewport}) => {
      const normalize = s => (s || "").replace(/\s+/g," ").trim();
      const box = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,
          scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
          fontSize:cs.fontSize,lineHeight:cs.lineHeight,display:cs.display
        };
      };
      const visibleText = document.body?.textContent || "";
      const compact = s => normalize(s).replace(/\s+/g,"").toLowerCase();
      const requiredChecks = (required[name] || []).map(t => ({
        text:t, found:visibleText.includes(t) || normalize(visibleText).includes(normalize(t)) || compact(visibleText).includes(compact(t))
      }));
      const doc=document.documentElement, body=document.body;
      const scrollWidth=Math.max(doc?.scrollWidth||0,body?.scrollWidth||0);
      const out={
        href:location.href,
        title:document.title,
        status:0,
        viewport,
        scrollWidth,
        horizontalOverflow:scrollWidth>viewport.width+1,
        requiredChecks,
        consoleErrors:[],
        pageErrors:[],
        geometryClips:[]
      };

      if(name==="home"){
        const ids=["hero-title","rooms-title","zoom-title","keychain-title","safe-title","renter-title","proof-title","testimonials-title","bridge-title","cta-title"];
        for(const id of ids){
          const el=document.getElementById(id);
          out[id]=box(el);
          if(el){
            const lines=[...el.querySelectorAll(".display__line")];
            const targets=lines.length?lines:[el];
            for(const t of targets){
              const r=t.getBoundingClientRect();
              if(r.right>viewport.width+1 || r.left<-1) out.geometryClips.push({selector:"#"+id,right:r.right,left:r.left});
            }
          }
        }
        const fs=id=>{
          const el=document.getElementById(id);
          if(!el)return null;
          const line=el.querySelector(".display__line");
          return parseFloat(getComputedStyle(line||el).fontSize);
        };
        out.hierarchy={hero:fs("hero-title"),rooms:fs("rooms-title"),bridge:fs("bridge-title"),zoom:fs("zoom-title"),keychain:fs("keychain-title"),safe:fs("safe-title"),renter:fs("renter-title"),proof:fs("proof-title"),testimonials:fs("testimonials-title"),cta:fs("cta-title")};
        out.heroLineBoxes=[...document.querySelectorAll("#hero-title .display__line")].map(e=>box(e));
        const order=["hero-title","bridge-title","spread-title","how-title","rooms-title","zoom-title","keychain-title","safe-title","renter-title","proof-title","testimonials-title","cta-title"];
        out.flowY=order.map(id=>{const el=document.getElementById(id)||document.querySelector("."+id);return [id,el?el.getBoundingClientRect().top:null]}).filter(x=>x[1]!==null);
      }

      if(name==="about"){
        out.oldVision=visibleText.includes("To empower people with complete control over their homes through smart and reliable technology.");
        out.oldMission=visibleText.includes("To make smart home automation affordable, easy to use, and accessible to everyone.");
        out.visionBox=box(document.querySelector(".vision-item:first-child > p:last-child"));
        out.missionBox=box(document.querySelector(".vision-item:last-child > p:last-child"));
      }

      if(name==="engineering"){
        const tech=document.querySelector(".tech");
        const groups=[...document.querySelectorAll(".tech-group")];
        out.techItems=[...document.querySelectorAll(".tech-group__items li")].map(x=>normalize(x.textContent));
        out.techGroups=groups.map(g=>({items:[...g.querySelectorAll("li")].map(x=>normalize(x.textContent)),box:box(g),labelBox:box(g.querySelector(".mono"))}));
        out.prohibitedInTech=prohibitedInTech.filter(x=>(tech?.textContent||"").includes(x));
        out.techExpectedMatch=JSON.stringify(out.techItems)===JSON.stringify(techExpected);
        const wrapper=document.querySelector(".tech-groups");
        const ws=wrapper?getComputedStyle(wrapper):null;
        out.techGrid={gridTemplateColumns:ws?.gridTemplateColumns||"",outerBorder:ws?(
          ws.borderTopStyle!=="none"||ws.borderRightStyle!=="none"||ws.borderBottomStyle!=="none"||ws.borderLeftStyle!=="none"):false};
        out.pseudo=groups.map(g=>({
          before:getComputedStyle(g,"::before").display+":"+getComputedStyle(g,"::before").width+":"+getComputedStyle(g,"::before").backgroundColor,
          after:getComputedStyle(g,"::after").display+":"+getComputedStyle(g,"::after").width+":"+getComputedStyle(g,"::after").backgroundColor
        }));
      }

      return out;
    },{name,required,techExpected,prohibitedInTech,viewport});

    data.status=response?.status()||0;
    data.consoleErrors=consoleErrors;
    data.pageErrors=pageErrors;
    data.navigationError=navigationError;
    results.pages[name][viewport.width+"x"+viewport.height]=data;

    await page.screenshot({
      path:"qa/live/"+name+"-"+viewport.width+"x"+viewport.height+".png",
      fullPage:true
    });
    await context.close();
  }
}
await browser.close();

for(const [name,viewports] of Object.entries(results.pages)){
  for(const [vp,d] of Object.entries(viewports)){
    const missing=d.requiredChecks.filter(x=>!x.found);
    const badStatus=d.status<200||d.status>=300;
    let bad=false;
    if(badStatus||d.horizontalOverflow||d.consoleErrors.length||d.pageErrors.length||missing.length||d.geometryClips.length||d.oldVision||d.oldMission||d.prohibitedInTech?.length) bad=true;

    if(name==="home"){
      const h=d.hierarchy||{};
      if(vp.startsWith("1440x")){
        if(!(h.hero>h.rooms && h.rooms>h.zoom && h.bridge>h.zoom && h.cta>h.zoom)) bad=true;
      } else if(vp.startsWith("1024x")){
        if(!(h.hero>=h.rooms && h.rooms>h.zoom)) bad=true;
      } else if(vp.startsWith("390x")){
        if(!(h.hero>h.zoom && h.rooms>h.zoom && h.bridge>h.zoom && h.hero>=30)) bad=true;
      }
    }

    if(name==="about"){
      if(!d.visionBox||!d.missionBox||d.visionBox.right>Number(vp.split("x")[0])+1||d.missionBox.right>Number(vp.split("x")[0])+1) bad=true;
    }

    if(name==="engineering"){
      if(d.techGroups?.length!==3||!d.techExpectedMatch||d.techGrid.outerBorder) bad=true;
      const width=Number(vp.split("x")[0]);
      if(width>=1200){
        if(!d.techGroups.every(g=>Math.abs(g.labelBox.y-d.techGroups[0].labelBox.y)<1)) bad=true;
        if(d.pseudo.filter(x=>x.before.startsWith("block")).length<2) bad=true;
      } else if(width<560){
        if(d.techGrid.gridTemplateColumns!=="350px") bad=true;
        if(d.pseudo.some(x=>x.before.startsWith("block:")&&x.before.includes("1px"))) bad=true;
      }
    }
    if(bad) results.overall="FAIL";
  }
}
await fs.writeFile("qa/live/results.json",JSON.stringify(results,null,2));
console.log(JSON.stringify({
  overall:results.overall,
  pages:Object.fromEntries(Object.entries(results.pages).map(([name,vps])=>[
    name,
    Object.fromEntries(Object.entries(vps).map(([vp,d])=>[
      vp,
      {
        status:d.status,
        overflow:d.horizontalOverflow,
        geometryClips:d.geometryClips,
        missing:d.requiredChecks.filter(x=>!x.found).map(x=>x.text),
        consoleErrors:d.consoleErrors.length,
        pageErrors:d.pageErrors.length,
        hierarchy:d.hierarchy,
        techGrid:d.techGrid,
        techItems:d.techItems,
        techGroups:d.techGroups?.map(g=>g.items)
      }
    ]))
  ]))
},null,2));
process.exitCode=results.overall==="PASS"?0:1;