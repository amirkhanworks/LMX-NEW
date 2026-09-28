import { chromium } from "playwright";
import fs from "node:fs";

const URL="https://amirkhanworks.github.io/LMX-NEW/";
const viewports=[
  {width:1440,height:900},
  {width:1280,height:800},
  {width:1024,height:768},
  {width:768,height:1024},
  {width:390,height:844},
  {width:360,height:800},
];

fs.mkdirSync("qa/live/no-rewiring",{recursive:true});

const browser=await chromium.launch({headless:true});
const results=[];

for(const viewport of viewports){
  const page=await browser.newPage({viewport});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
  await page.goto(URL,{waitUntil:"networkidle",timeout:60000});
  await page.waitForFunction(()=>document.querySelector("[data-preloader]")?.style.display==="none" || getComputedStyle(document.querySelector("[data-preloader]")).visibility==="hidden",{timeout:15000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelector(".no-rewiring")?.getBoundingClientRect().height>0,{timeout:15000});
  await page.locator(".no-rewiring").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);

  const data=await page.evaluate(()=>{
    const section=document.querySelector(".no-rewiring");
    const title=document.querySelector("#spread-title");
    const eyebrow=document.querySelector(".no-rewiring__eyebrow");
    const note=document.querySelector(".no-rewiring__note");
    const visual=document.querySelector(".retrofit-visual");
    const benefits=[...document.querySelectorAll(".no-rewiring__benefit")];
    const cta=document.querySelector(".no-rewiring__cta");
    const nav=document.querySelector(".nav");
    const body=document.body;
    const rect=e=>e?e.getBoundingClientRect().toJSON():null;
    return {
      section:rect(section),
      title:rect(title),
      eyebrow:eyebrow?.innerText||"",
      titleText:title?.innerText||"",
      titleParts:[...document.querySelectorAll(".no-rewiring__title span")].map(e=>e.innerText.trim()),
      note:note?.innerText||"",
      visual:rect(visual),
      benefits:benefits.map(e=>({title:e.querySelector("h3")?.innerText||"",text:e.querySelector("p")?.innerText||"",icon:!!e.querySelector("svg")})),
      cta:{text:cta?.innerText||"",href:cta?.href||""},
      nav:rect(nav),
      scrollWidth:Math.max(document.documentElement.scrollWidth,body.scrollWidth),
      viewportWidth:window.innerWidth,
      scrollY:window.scrollY
    };
  });

  await page.screenshot({path:`qa/live/no-rewiring/no-rewiring-${viewport.width}.png`,fullPage:false});
  results.push({viewport,...data,errors});
  await page.close();
}

await browser.close();

const failures=results.filter(r=>
  r.errors.length ||
  r.scrollWidth>r.viewportWidth+1 ||
  r.titleText.trim().replace(/\s+/g," ").toLowerCase()!=="no rewiring." ||
  r.titleParts.map(x=>x.toLowerCase()).join("|")!=="no|rewiring." ||
  r.eyebrow.trim()!=="Our retrofit solution" ||
  r.note.trim()!=="Installs behind your existing switchboard." ||
  !r.visual ||
  r.benefits.length!==4 ||
  !r.benefits.every(b=>b.icon&&b.title&&b.text) ||
  !r.cta.text.includes("Book a Home Demo") ||
  !r.cta.href.startsWith("https://form.typeform.com/to/") ||
  (r.viewport.width>=992 && r.section.height>r.viewport.height*.9)
);

const output={overall:failures.length?"FAIL":"PASS",results,failures:failures.map(r=>r.viewport)};
fs.writeFileSync("qa/live/no-rewiring/results.json",JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
if(failures.length)process.exitCode=1;
