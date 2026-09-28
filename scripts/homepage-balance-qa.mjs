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

fs.mkdirSync("qa/live/homepage-balance",{recursive:true});

const browser=await chromium.launch({headless:true});
const results=[];

for(const viewport of viewports){
  const page=await browser.newPage({viewport});
  await page.addInitScript(()=>{try{sessionStorage.setItem("lmxVisited","1")}catch{}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});

  await page.goto(URL,{waitUntil:"networkidle",timeout:60000});
  await page.waitForFunction(()=>{
    const pre=document.querySelector("[data-preloader]");
    return !pre || getComputedStyle(pre).display==="none";
  },{timeout:15000});
  await page.waitForTimeout(500);

  const data=await page.evaluate(()=>{
    const rgb=c=>c.replace(/\\s+/g,"").toLowerCase();
    const sectionEls=[...document.querySelectorAll("main > section")];
    const mainBlocks=[...document.querySelectorAll("main > *")];
    const colorOf=el=>rgb(getComputedStyle(el).backgroundColor);
    const strongDark="rgb(13,29,53)";
    const strongBlue="rgb(26,92,184)";
    const lightSet=new Set(["rgb(250,250,248)","rgb(255,255,255)"]);
    const contentBlocks=mainBlocks.filter(el=>!el.classList.contains("hero"));
    let dark=0,blue=0,light=0,other=0;
    for(const el of contentBlocks){
      const h=el.getBoundingClientRect().height;
      const bgType=el.classList.contains("section-break")?"light":el.dataset.bg;
      if(bgType==="dark") dark+=h;
      else if(bgType==="color") blue+=h;
      else if(bgType==="light") light+=h;
      else other+=h;
    }
    const total=dark+blue+light+other;
    const strongRatio=total?((dark+blue)/total):0;
    const lightRatio=total?(light/total):0;
    const nav=document.querySelector(".nav");
    const bridge=document.querySelector(".bridge");
    const bridgeTitle=document.querySelector("#bridge-title");
    const breakEl=document.querySelector(".section-break");
    const heroImg=document.querySelector(".hero__img");
    const cta=document.querySelector(".cta");
    return {
      sectionMetrics:{
        totalHeight:total,
        darkHeight:dark,
        blueHeight:blue,
        lightHeight:light,
        otherHeight:other,
        strongRatio,
        lightRatio
      },
      sectionHeights:Object.fromEntries(sectionEls.map(el=>[el.className,el.getBoundingClientRect().height])),
      backgrounds:{
        bridge:colorOf(bridge),
        noRewiring:colorOf(document.querySelector(".no-rewiring")),
        how:colorOf(document.querySelector(".how")),
        keychain:colorOf(document.querySelector(".keychain")),
        safe:colorOf(document.querySelector(".safe")),
        cta:colorOf(cta)
      },
      break:{
        present:!!breakEl,
        height:breakEl?.getBoundingClientRect().height||0,
        background:breakEl?colorOf(breakEl):null
      },
      bridgeDetail:{
        section:bridge?.getBoundingClientRect().toJSON()||null,
        intro:document.querySelector(".bridge__intro")?.getBoundingClientRect().toJSON()||null,
        paths:document.querySelector(".bridge__paths")?.getBoundingClientRect().toJSON()||null,
        cards:[...document.querySelectorAll(".bridge__path")].map(el=>({className:el.className,box:el.getBoundingClientRect().toJSON()}))
      },
      nav:{
        present:!!nav,
        bottom:nav?.getBoundingClientRect().bottom||0
      },
      bridge:{
        titlePresent:!!bridgeTitle,
        titleHeight:bridgeTitle?.getBoundingClientRect().height||0,
        sectionHeight:bridge?.getBoundingClientRect().height||0
      },
      images:{
        heroSrc:heroImg?.currentSrc||heroImg?.src||null,
        heroExact:(heroImg?.currentSrc||heroImg?.src||"")===location.origin+"/LMX-NEW/assets-src/img/hero-living-room.png"
      },
      noRewiring:{
        title:document.querySelector("#spread-title")?.innerText?.trim()||"",
        cta:document.querySelector(".no-rewiring__cta")?.innerText?.trim()||"",
      },
      scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
      viewportWidth:window.innerWidth
    };
  });

  const checks={
    noConsoleErrors:errors.length===0,
    noHorizontalOverflow:data.scrollWidth<=data.viewportWidth+1,
    strongAreaNotDominant:data.sectionMetrics.strongRatio<=0.55,
    lightAreaPresent:data.sectionMetrics.lightRatio>=0.45,
    cleanBreak:data.break.present&&data.break.height>=12&&data.break.background==="rgb(250, 250, 248)",
    navyBrand:data.backgrounds.bridge==="rgb(13,29,53)"&&data.backgrounds.safe==="rgb(13,29,53)",
    keychainIsLight:data.backgrounds.keychain==="rgb(250,250,248)"||data.backgrounds.keychain==="rgb(255,255,255)",
    blueBrand:data.backgrounds.noRewiring==="rgb(26, 92, 184)"&&data.backgrounds.cta==="rgb(26, 92, 184)",
    heroUnchanged:data.images.heroExact,
    noRewiringTitle:data.noRewiring.title.replace(/\s+/g," ").trim().toLowerCase()==="no rewiring.",
    demoCtaVisible:data.noRewiring.cta.includes("Book a Home Demo")
  };
  await page.screenshot({path:`qa/live/homepage-balance/home-${viewport.width}.png`,fullPage:false});
  results.push({viewport,...data,errors,checks});
  await page.close();
}

await browser.close();

const failures=results.filter(r=>Object.values(r.checks||{}).some(v=>!v));

const output={overall:failures.length?"FAIL":"PASS",results,failures:failures.map(r=>r.viewport)};
fs.writeFileSync("qa/live/homepage-balance/results.json",JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
if(failures.length)process.exitCode=1;
