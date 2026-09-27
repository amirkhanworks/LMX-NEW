import { chromium } from "playwright";
import fs from "node:fs/promises";

const BASE = "https://amirkhanworks.github.io/LMX-NEW/";
const INVALID = BASE + "nonexistent-page-test";
const QA_BUST = "?qa=" + Date.now();
const pages = {
  home: BASE + "index.html" + QA_BUST,
  about: BASE + "about.html" + QA_BUST,
  engineering: BASE + "services.html" + QA_BUST,
  privacy: BASE + "privacy.html" + QA_BUST,
  notFound: INVALID + QA_BUST
};
const viewports = [
  {width:1440,height:900},
  {width:1024,height:768},
  {width:390,height:844},
  {width:375,height:812}
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
  ],
  privacy: [
    "Privacy",
    "Last updated: 26 September 2026",
    "Who we are.",
    "What we collect.",
    "Why we collect it.",
    "Who processes it for us.",
    "How long we keep it.",
    "Your rights.",
    "Grievances.",
    "Changes."
  ],
  notFound: [
    "404",
    "Wrong room.",
    "The page you are looking for is not here.",
    "Back to Home"
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
    await page.setExtraHTTPHeaders({"Cache-Control":"no-cache"});
    await page.emulateMedia({reducedMotion:"reduce"});
    const consoleErrors = [];
    const pageErrors = [];
    const badResponses = [];
    const requestFailures = [];
    page.on("console",m=>{if(m.type()==="error") consoleErrors.push(m.text())});
    page.on("pageerror",e=>pageErrors.push(String(e)));
    page.on("response",r=>{if(r.status()>=400) badResponses.push({status:r.status(),url:r.url()})});
    page.on("requestfailed",r=>requestFailures.push({url:r.url(),failure:r.failure()?.errorText||"unknown"}));
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
      const visibleText = document.body?.innerText || "";
      const bodyRaw = document.body?.textContent || "";
      const compact = s => normalize(s).replace(/\s+/g,"").toLowerCase();
      const requiredChecks = (required[name] || []).map(t => ({
        text:t, found:visibleText.includes(t) || normalize(visibleText).includes(normalize(t)) || compact(visibleText).includes(compact(t))
      }));
      const doc=document.documentElement, body=document.body;
      const scrollWidth=Math.max(doc?.scrollWidth||0,body?.scrollWidth||0);
      const out={
        href:location.href,
        title:document.title,
        qaMarker:document.body?.getAttribute("data-qa-marker")||null,
        stylesheetHrefs:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href),
        status:0,
        viewport,
        scrollWidth,
        horizontalOverflow:scrollWidth>viewport.width+1,
        requiredChecks,
        consoleErrors:[],
        pageErrors:[],
        badResponses:[],
        requestFailures:[],
        geometryClips:[]
      };

      if(name==="home"){
        out.roomTitles=[...document.querySelectorAll(".panel__title")].map(e=>normalize(e.innerText));
        out.controls=[...document.querySelectorAll(".ctrl h3")].map(e=>normalize(e.innerText));
        out.acCaveatCount=(bodyRaw.match(/Tested during our beta; coming soon for all homes\\./g)||[]).length;
        out.testimonial1Count=(bodyRaw.match(/The best part for us has been my grandparents\\./g)||[]).length;
        out.testimonial2Count=(bodyRaw.match(/I can turn my AC on before I even walk in the door/g)||[]).length;
        out.waitlistPresent=!!document.querySelector("[data-waitlist]");
        out.homeDemoCtas=[...document.querySelectorAll(".hero__actions .btn--paper,.cta__primary")].map(a=>({text:normalize(a.innerText),href:a.href,target:a.target}));
        out.homeWhatsApp=[...document.querySelectorAll(".cta__secondary")].map(a=>({text:normalize(a.innerText),href:a.href,target:a.target}));
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
        out.founders=[...document.querySelectorAll(".founder h3")].map(e=>normalize(e.innerText));
        out.founderRoles=[...document.querySelectorAll(".founder > .mono")].map(e=>normalize(e.innerText));
        out.aboutCtas=[...document.querySelectorAll("main a.btn")].map(a=>({text:normalize(a.innerText),href:a.href}));
      }


      if(name==="privacy"){
        const utility=document.querySelector(".about-hero");
        const title=document.querySelector("h1.display");
        const prose=document.querySelector(".prose");
        const footer=document.querySelector(".footer");
        const nav=document.querySelector(".nav");
        const rail=document.querySelector("[data-rail]");
        const counter=document.querySelector("[data-scroll-counter]");
        const preloader=document.querySelector("[data-preloader]");
        const utilityBox=box(utility);
        const titleBox=box(title);
        const proseBox=box(prose);
        out.privacy={
          utilityBox,titleBox,proseBox,
          footer:!!footer,
          nav:!!nav,
          railPresent:!!rail,
          counterPresent:!!counter,
          preloaderPresent:!!preloader,
          titleTransform:title?getComputedStyle(title).textTransform:null,
          titleFontSize:title?parseFloat(getComputedStyle(title).fontSize):null,
          utilityHeight:utility?utilityBox?.height:null,
          contentHeight:proseBox?.height||0,
          policyBodyScrollHeight:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)
        };
        out.privacyBadMotionClass=document.documentElement.classList.contains("reduce-motion");
        out.privacyUtilityPageHeightMatchesViewport=utilityBox?Math.abs(utilityBox.height-viewport.height)<2:false;
        out.privacyReadableColumn=proseBox?proseBox.width<=viewport.width-32:false;
        out.privacyTitleTop=titleBox?.y??null;
        out.privacyFooterTop=footer?footer.getBoundingClientRect().top:null;
        out.privacyMainButtons=document.querySelectorAll("main .btn").length;
        out.privacyMainImages=document.querySelectorAll("main img").length;
        out.privacyFooterCurrent=document.querySelector('footer a[aria-current="page"]')?.getAttribute("href")||null;
      }
      if(name==="engineering"){
        out.capabilities=[...document.querySelectorAll(".capability h3")].map(e=>normalize(e.innerText));
        out.process=[...document.querySelectorAll(".process__step h2")].map(e=>normalize(e.innerText));
        out.caseCards=[...document.querySelectorAll(".case-card__trigger")].map(e=>({ariaControls:e.getAttribute("aria-controls"),expanded:e.getAttribute("aria-expanded"),text:normalize(e.innerText)}));
        out.canineExactSelectorCount=document.querySelectorAll('button.case-card__trigger[aria-controls="canine-panel"]').length;
        out.caninePanelCount=document.querySelectorAll("#canine-panel").length;
        out.caninePublicText=visibleText.includes("In progress.")&&visibleText.includes("US client")&&visibleText.includes("Selected scope and technical details are available on request.");
        out.caseDeliveredCount=[...document.querySelectorAll(".case-card__trigger")].filter(e=>normalize(e.innerText).includes("Delivered")).length;
        out.caseInProgressCount=[...document.querySelectorAll(".case-card__trigger")].filter(e=>normalize(e.innerText).includes("In progress")).length;
        out.b2bCtas=[...document.querySelectorAll(".engage-card a.btn,.engage .cta a.btn,.nav .btn--nav")].map(a=>({text:normalize(a.innerText),href:a.href}));
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
        const engineeringTargets=[
          ...document.querySelectorAll(".process__step .display"),
          document.querySelector(".engage>h2.display")
        ].filter(Boolean);
        out.engineeringGeometryClips=engineeringTargets.map(e=>({selector:e.id||e.className,box:box(e)}).box)
          .filter(r=>r.right>viewport.width+1||r.left<-1);
      }

      return out;
    },{name,required,techExpected,prohibitedInTech,viewport});

    data.status=response?.status()||0;
    data.consoleErrors=consoleErrors;
    data.pageErrors=pageErrors;
    data.badResponses=badResponses;
    data.requestFailures=requestFailures;
    data.renderedCounterVisible=await page.locator(".counter:visible,[data-scroll-counter]:visible").count().catch(()=>0)>0;
    data.renderedRailVisible=await page.locator("[data-rail]:visible").count().catch(()=>0)>0;
    data.preloaderText=await page.locator("[data-preloader]").textContent().catch(()=> "")||"";
    data.preloaderOutlines=await page.locator("[data-preloader] .preloader__outline").count().catch(()=>0);
    data.imageBrokenCount=await page.locator("img").evaluateAll(imgs=>imgs.filter(img=>img.complete&&img.naturalWidth===0).length).catch(()=>0);
    data.navigationError=navigationError;
    results.pages[name][viewport.width+"x"+viewport.height]=data;

    await page.screenshot({
      path:"qa/live/"+name+"-"+viewport.width+"x"+viewport.height+".png",
      fullPage:true
    });
    await context.close();
  }
}
async function cleanUrl(url){
  const u=new URL(url);
  u.search="";
  u.hash="";
  return u.href;
}
function isInternalHref(href){
  if(!href||href.startsWith("#")||href.startsWith("mailto:")||href.startsWith("tel:")||href.startsWith("javascript:"))return false;
  const u=new URL(href,BASE);
  return u.origin===new URL(BASE).origin&&u.pathname.startsWith("/LMX-NEW/");
}
async function internalLinkSweep(name,url,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url,{waitUntil:"networkidle",timeout:60000});
  await page.waitForTimeout(400);
  const hrefs=await page.evaluate(()=>[...document.querySelectorAll(".corner[href],nav a[href],.nav-sheet a[href],footer a[href],main a[href]")].map(a=>a.getAttribute("href")).filter(Boolean));
  const unique=[...new Set(hrefs)];
  const broken=[];
  const deadAnchors=[];
  for(const href of unique){
    if(href.startsWith("#")){
      if(await page.locator(href).count().catch(()=>0)===0)deadAnchors.push(href);
      continue;
    }
    if(!isInternalHref(href))continue;
    const response=await page.request.get(await cleanUrl(new URL(href,page.url()).href),{timeout:30000}).catch(()=>null);
    if(!response||response.status()>=400)broken.push({href,status:response?.status()||0});
  }
  const corner=await page.locator(".corner[href]").getAttribute("href").catch(()=>null);
  const cornerOk=!!corner&&isInternalHref(corner)&&await page.request.get(await cleanUrl(new URL(corner,page.url()).href)).then(r=>r.status()<400).catch(()=>false);
  await context.close();
  return {count:unique.length,broken,deadAnchors,cornerOk};
}
async function mobileMenuSweep(url,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url,{waitUntil:"networkidle",timeout:60000});
  await page.waitForTimeout(400);
  const toggle=page.locator("[data-nav-toggle]"),sheet=page.locator("#nav-sheet");
  const out={opened:false,closed:false,linkNavigated:false};
  if(await toggle.count()!==1){await context.close();return out;}
  await toggle.click();await page.waitForTimeout(120);
  out.opened=(await toggle.getAttribute("aria-expanded"))==="true"&&await sheet.getAttribute("hidden")===null;
  await page.keyboard.press("Escape");await page.waitForTimeout(80);
  out.closed=(await toggle.getAttribute("aria-expanded"))==="false"&&await sheet.getAttribute("hidden")!==null;
  await toggle.click();
  const about=sheet.locator('a[href="./about.html"],a[href="/LMX-NEW/about.html"]').first();
  if(await about.count()){
    await about.click();await page.waitForLoadState("domcontentloaded",{timeout:30000}).catch(()=>{});await page.waitForTimeout(300);
    out.linkNavigated=await cleanUrl(page.url()).then(u=>u.includes("/about.html"));
  }else out.linkNavigated=true;
  await context.close();return out;
}
async function accordionSweep(){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(pages.engineering,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(500);
  const out={camel:false,camelClosed:false,soil:false,canine:false,canineExact:false,camelImage:false,soilImage:false};
  for(const id of ["camel-panel","soil-panel","canine-panel"]){
    const trigger=page.locator('button.case-card__trigger[aria-controls="'+id+'"]');
    if(await trigger.count()){
      await trigger.click();await page.waitForTimeout(300);
      const open=(await trigger.getAttribute("aria-expanded"))==="true"&&await page.locator("#"+id).isVisible().catch(()=>false);
      if(id==="camel-panel"){
        out.camel=open;
        out.camelImage=await page.locator("#camel-panel img").evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0)).catch(()=>false);
        await trigger.click();await page.waitForTimeout(250);out.camelClosed=(await trigger.getAttribute("aria-expanded"))==="false";
      }
      if(id==="soil-panel"){out.soil=open;out.soilImage=await page.locator("#soil-panel img").evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0)).catch(()=>false);}
      if(id==="canine-panel")out.canine=open;
    }
  }
  out.canineExact=await page.locator('button.case-card__trigger[aria-controls="canine-panel"]').count()===1&&await page.locator("#canine-panel").count()===1;
  await context.close();return out;
}
async function waitlistSweep(){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(pages.home,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(500);
  const form=page.locator("[data-waitlist]"),input=page.locator("#wl-email"),status=page.locator("#wl-status");
  const out={present:await form.count()===1,invalid:false,fallback:false};
  if(out.present){
    await input.fill("bad-email");await page.locator("[data-waitlist] button[type=submit]").click();await page.waitForTimeout(100);
    out.invalid=(await status.innerText()).includes("Please enter a valid email address.");
    await input.fill("qa.final@example.com");await page.locator("[data-waitlist] button[type=submit]").click();await page.waitForTimeout(200);
    out.fallback=(await status.innerText()).includes("Sign-ups open soon.")&&await status.locator('a[href^="https://wa.me/"]').count()===1;
  }
  await context.close();return out;
}
async function popupCtaSweep(url,selector,expectedHref,allowedPopupPrefixes){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(url,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(400);
  const link=page.locator(selector).first();
  const out={present:await link.count()===1,href:"",target:"",popup:false,popupUrl:""};
  if(out.present){
    out.href=await link.getAttribute("href")||"";out.target=await link.getAttribute("target")||"";
    const popupPromise=page.waitForEvent("popup",{timeout:15000}).catch(()=>null);
    await link.click();const popup=await popupPromise;
    if(popup){out.popup=true;await popup.waitForLoadState("domcontentloaded",{timeout:15000}).catch(()=>{});out.popupUrl=popup.url();await popup.close().catch(()=>{});}
  }
  const correct=out.href.startsWith(expectedHref);
  const popupCorrect=out.popup&&allowedPopupPrefixes.some(prefix=>out.popupUrl.startsWith(prefix));
  await context.close();return {...out,correct,popupCorrect};
}
async function aboutCtaSweep(){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});await page.goto(pages.about,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(400);
  const link=page.locator('main a.btn',{hasText:"Talk to Luminox"}).first();
  const present=await link.count()===1;
  const href=present?await link.getAttribute("href").catch(()=>null):null;
  const correct=present&&!!href&&href.startsWith("mailto:info@luminoxautomation.com");
  await context.close();return {present,correct};
}
async function scrollAndRailSweep(){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"no-preference"});
  const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(pages.home,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(900);
  const rail=page.locator("[data-rail-thumb]"),initial=await page.evaluate(()=>window.scrollY);
  await page.mouse.wheel(0,900);await page.waitForTimeout(900);const after=await page.evaluate(()=>window.scrollY);
  let end=false,home=false;
  if(await rail.count()){await rail.focus();await page.keyboard.press("End");await page.waitForTimeout(900);end=await page.evaluate(()=>window.scrollY)>after;await page.keyboard.press("Home");await page.waitForTimeout(900);home=await page.evaluate(()=>window.scrollY)<=5;}
  const desktopRailPresent=await page.locator("[data-rail]:visible").count()===1;
  await context.close();return {initial,after,wheelMoved:after>initial,desktopRailPresent,railEnd:end,railHome:home,errors:errors.length};
}
async function motionSmoke(){
  const out={};
  for(const [name,url] of [["home",pages.home],["engineering",pages.engineering]]){
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
    const page=await context.newPage();await page.emulateMedia({reducedMotion:"no-preference"});
    const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});page.on("pageerror",e=>errors.push(String(e)));
    await page.goto(url,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(900);
    const positions=[];for(let i=0;i<5;i++){await page.mouse.wheel(0,850);await page.waitForTimeout(350);positions.push(await page.evaluate(()=>window.scrollY));}
    out[name]={scrollMoved:positions.some((v,i)=>i===0?v>0:v>positions[i-1]),errors:errors.length};
    await context.close();
  }
  return out;
}
async function preloaderSweep(){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"no-preference"});
  const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});page.on("pageerror",e=>errors.push(String(e)));
  const started=Date.now();await page.goto(pages.home,{waitUntil:"networkidle",timeout:60000});
  await page.waitForFunction(()=>document.querySelector("[data-preloader]")?.style.display==="none",null,{timeout:10000}).catch(()=>{});
  const durationMs=Date.now()-started;
  const result=await page.evaluate(()=>{const pre=document.querySelector("[data-preloader]");const text=pre?.textContent||"";const cs=pre?getComputedStyle(pre):null;return {hidden:!pre||cs?.display==="none"||cs?.visibility==="hidden",coords:/19\.13° N|72\.83° E/.test(text),outlines:document.querySelectorAll("[data-preloader] .preloader__outline").length,label:!!document.querySelector("[data-preloader] .preloader__label")};});
  result.durationMs=durationMs;result.fastEnough=durationMs<7000;result.errors=errors.length;await context.close();return result;
}
async function notFoundSweep(){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});await context.addInitScript(()=>sessionStorage.setItem("lmxVisited","1"));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:"reduce"});
  const errors=[];page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});page.on("pageerror",e=>errors.push(String(e)));
  const response=await page.goto(pages.notFound,{waitUntil:"networkidle",timeout:60000});await page.waitForTimeout(500);
  const renders=(await page.locator("h1.display").innerText()).trim()==="Wrong room.";
  const back=page.locator('a.btn',{hasText:"Back to Home"});let navigated=false;
  const backHome=await back.count()===1;
  if(backHome){await back.click();await page.waitForLoadState("domcontentloaded",{timeout:30000}).catch(()=>{});await page.waitForTimeout(500);navigated=await cleanUrl(page.url())===await cleanUrl(BASE);}
  await context.close();return {status:response?.status()||0,renders,backHome,navigated,errors:errors.length};
}

results.interaction={};
for(const name of ["home","about","engineering","privacy"]){
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    results.interaction["internal-"+name+"-"+viewport.width]=await internalLinkSweep(name,pages[name],viewport);
  }
}
results.interaction.mobileMenu={};
for(const name of Object.keys(pages)){
  for(const viewport of [{width:390,height:844},{width:375,height:812}]){
    results.interaction.mobileMenu[name+"-"+viewport.width]=await mobileMenuSweep(pages[name],viewport);
  }
}
results.interaction.accordions=await accordionSweep();
results.interaction.waitlist=await waitlistSweep();
results.interaction.homeDemo=await popupCtaSweep(pages.home,".hero__actions .btn--paper","https://form.typeform.com/to/",["https://form.typeform.com/"]);
results.interaction.homeWhatsApp=await popupCtaSweep(pages.home,".cta__secondary","https://wa.me/",["https://wa.me/","https://api.whatsapp.com/"]);
results.interaction.engineeringDiscuss=await popupCtaSweep(pages.engineering,".nav .btn--nav","https://wa.me/",["https://wa.me/","https://api.whatsapp.com/"]);
results.interaction.aboutCta=await aboutCtaSweep();
results.interaction.scrollRail=await scrollAndRailSweep();
results.interaction.motion=await motionSmoke();
results.interaction.preloader=await preloaderSweep();
results.interaction.notFound=await notFoundSweep();

for(const [name,viewports] of Object.entries(results.pages)){
  for(const [vp,d] of Object.entries(viewports)){
    const width=Number(vp.split("x")[0]);
    const missing=d.requiredChecks.filter(x=>!x.found);
    const expected=name==="notFound"?d.status===404:(d.status>=200&&d.status<300);
    const unexpectedBadResponses=d.badResponses.filter(x=>!(name==="notFound"&&x.status===404&&x.url.startsWith(INVALID)));
    let bad=!expected||d.horizontalOverflow||d.consoleErrors.length||d.pageErrors.length||d.requestFailures.length||
      unexpectedBadResponses.length||missing.length||d.geometryClips.length||d.engineeringGeometryClips?.length||
      d.oldVision||d.oldMission||d.prohibitedInTech?.length||d.renderedCounterVisible||(width<560&&d.renderedRailVisible)||
      d.preloaderText.includes("19.13° N")||d.preloaderText.includes("72.83° E")||d.preloaderOutlines>0||d.imageBrokenCount>0;
    if(name==="home"){
      if(d.roomTitles?.join("|")!=="Lights|Fans|LEDs|TV|Water pump|Security & surveillance|Curtains|AC")bad=true;
      if(d.controls?.join("|")!=="App|Voice|Keychain Remote")bad=true;
      if(d.acCaveatCount!==1||d.testimonial1Count!==1||d.testimonial2Count!==1)bad=true;
      if(!d.waitlistPresent)bad=true;
      if(!d.homeDemoCtas?.some(x=>x.text==="Book a Home Demo"&&x.href.startsWith("https://form.typeform.com/to/")))bad=true;
      if(width<=390&&d.heroLineBoxes?.some(b=>b.x<-1||b.right>width+1))bad=true;
    }
    if(name==="about"){
      if(!d.visionBox||!d.missionBox||d.visionBox.right>width+1||d.missionBox.right>width+1||d.oldVision||d.oldMission)bad=true;
      if(d.founders?.join("|")!=="Fahad Khan|Saad Khan|Amir Khan")bad=true;
      if(!d.aboutCtas?.some(x=>x.text==="Talk to Luminox"&&x.href.startsWith("mailto:")))bad=true;
    }
    if(name==="engineering"){
      if(d.capabilities?.length!==6||d.process?.join("|")!=="Discover|Architect|Build|Test & deploy|Hand over")bad=true;
      if(d.techGroups?.length!==3||!d.techExpectedMatch||d.techGrid.outerBorder)bad=true;
      if(d.caseCards?.length!==3||d.canineExactSelectorCount!==1||d.caninePanelCount!==1||!d.caninePublicText)bad=true;
      if(d.caseDeliveredCount!==2||d.caseInProgressCount!==1)bad=true;
      if(d.prohibitedInTech?.length)bad=true;
      if(width>=1200&&(!d.techGroups.every(g=>Math.abs(g.labelBox.y-d.techGroups[0].labelBox.y)<1)||d.pseudo.filter(x=>x.before.startsWith("block")).length!==2))bad=true;
      if(width<560&&d.pseudo.some(x=>x.before.startsWith("block:")&&x.before.includes("1px")))bad=true;
      if(d.b2bCtas?.some(x=>x.text==="Book a Home Demo"))bad=true;
    }
    if(name==="privacy"){
      const pr=d.privacy;
      if(!pr||!pr.footer||!pr.nav||pr.railPresent||pr.counterPresent||pr.preloaderPresent||d.privacyMainButtons!==0||d.privacyMainImages!==0)bad=true;
      if(pr.titleTransform!=="none")bad=true;
      if(width>=992&&pr.titleFontSize>64)bad=true;
      if(width<992&&pr.titleFontSize>52)bad=true;
      if(width<560&&pr.titleFontSize>44)bad=true;
      if(!d.privacyReadableColumn||d.privacyUtilityPageHeightMatchesViewport)bad=true;
      if(pr.footer&&pr.footerCurrent!==null&&pr.footerCurrent!="./privacy.html")bad=true;
      if(!pr.footer&&d.privacyFooterCurrent!="./privacy.html")bad=true;
    }
    if(name==="notFound"&&(!d.notFound?.wrongRoom||!d.notFound?.backHome))bad=true;
    if(bad)results.overall="FAIL";
  }
}

for(const [k,v] of Object.entries(results.interaction)){
  if(k.startsWith("internal-")&&(v.broken?.length||v.deadAnchors?.length||v.cornerOk===false))results.overall="FAIL";
}
for(const v of Object.values(results.interaction.mobileMenu)){
  if(!v.opened||!v.closed||!v.linkNavigated)results.overall="FAIL";
}
const ac=results.interaction.accordions;
if(!ac.camel||!ac.camelClosed||!ac.soil||!ac.canine||!ac.canineExact||!ac.camelImage||!ac.soilImage)results.overall="FAIL";
const wl=results.interaction.waitlist;
if(!wl.present||!wl.invalid||!wl.fallback)results.overall="FAIL";
for(const c of [results.interaction.homeDemo,results.interaction.homeWhatsApp,results.interaction.engineeringDiscuss]){
  if(!c.present||!c.correct||!c.popupCorrect)results.overall="FAIL";
}
if(!results.interaction.aboutCta.present||!results.interaction.aboutCta.correct)results.overall="FAIL";
const sr=results.interaction.scrollRail;
if(!sr.wheelMoved||!sr.desktopRailPresent||!sr.railEnd||!sr.railHome||sr.errors)results.overall="FAIL";
for(const v of Object.values(results.interaction.motion)){
  if(!v.scrollMoved||v.errors)results.overall="FAIL";
}
const pl=results.interaction.preloader;
if(!pl.hidden||pl.coords||pl.outlines||!pl.label||!pl.fastEnough||pl.errors)results.overall="FAIL";
const nf=results.interaction.notFound;
if(nf.status!==404||!nf.renders||!nf.backHome||!nf.navigated||nf.errors)results.overall="FAIL";

await fs.writeFile("qa/live/results.json",JSON.stringify(results,null,2));
await browser.close();

console.log(JSON.stringify({
  overall:results.overall,
  routeChecks:Object.fromEntries(Object.entries(results.pages).map(([name,vps])=>[
    name,
    Object.fromEntries(Object.entries(vps).map(([vp,d])=>[vp,{
      status:d.status,
      overflow:d.horizontalOverflow,
      missing:d.requiredChecks.filter(x=>!x.found).map(x=>x.text),
      consoleErrors:d.consoleErrors.length,
      pageErrors:d.pageErrors.length,
      failedRequests:d.requestFailures.length,
      badResponses:d.badResponses.length,
      counterVisible:d.renderedCounterVisible,
      railVisible:d.renderedRailVisible,
      preloaderOutlines:d.preloaderOutlines,
      imagesBroken:d.imageBrokenCount
    }]))
  ])),
  interaction:results.interaction
},null,2));
process.exitCode=results.overall==="PASS"?0:1;
