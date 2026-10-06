// Escalate to DE celebration: each import plays one animation at random across the Escalation page.
(() => {
  const ROBOT_SVG = `<svg class="esc-mascot-art" viewBox="0 0 160 200" aria-hidden="true" focusable="false">
  <ellipse cx="80" cy="192" rx="44" ry="6" fill="#0003"/>
  <g class="esc-step-a"><rect x="58" y="160" width="14" height="26" rx="6" fill="#1f3b5c"/><path d="M52 184h24a4 4 0 0 1 0 8H52a4 4 0 0 1 0-8z" fill="#222"/></g>
  <g class="esc-step-b"><rect x="88" y="160" width="14" height="26" rx="6" fill="#1f3b5c"/><path d="M84 184h24a4 4 0 0 1 0 8H84a4 4 0 0 1 0-8z" fill="#222"/></g>
  <g class="esc-body">
    <rect x="40" y="52" width="80" height="116" rx="38" fill="#2f9ad6" stroke="#1d5f86" stroke-width="3"/>
    <rect x="48" y="118" width="64" height="44" rx="16" fill="#f4f7fb"/>
    <text x="80" y="146" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#b42318">DE</text>
    <circle cx="66" cy="86" r="13" fill="#fff" stroke="#1d5f86" stroke-width="3"/><circle cx="94" cy="86" r="13" fill="#fff" stroke="#1d5f86" stroke-width="3"/>
    <g class="esc-blink"><circle cx="69" cy="88" r="5.5" fill="#1b1b24"/><circle cx="97" cy="88" r="5.5" fill="#1b1b24"/><circle cx="71" cy="86" r="1.8" fill="#fff"/><circle cx="99" cy="86" r="1.8" fill="#fff"/></g>
    <ellipse cx="80" cy="108" rx="9" ry="7" fill="#7a1a12"/><ellipse cx="80" cy="111" rx="5" ry="3" fill="#ff8a7a"/>
    <path d="M40 58q40-26 80 0" fill="none" stroke="#8b96a3" stroke-width="7" stroke-linecap="round"/>
    <rect x="72" y="20" width="16" height="10" rx="3" fill="#8b96a3"/>
    <path class="esc-siren" d="M70 22q0-20 10-20t10 20z" fill="#e8281a" stroke="#8f1209" stroke-width="2"/>
    <g class="esc-siren"><rect x="22" y="58" width="24" height="34" rx="10" fill="#e8281a" stroke="#8f1209" stroke-width="2"/></g>
    <g class="esc-siren esc-siren-alt"><rect x="114" y="58" width="24" height="34" rx="10" fill="#e8281a" stroke="#8f1209" stroke-width="2"/></g>
    <g class="esc-glow"><circle cx="80" cy="10" r="16" fill="#ff3b2f"/><circle cx="34" cy="74" r="20" fill="#ff3b2f"/></g>
    <g class="esc-glow esc-siren-alt"><circle cx="126" cy="74" r="20" fill="#ff3b2f"/></g>
    <g class="esc-arm"><path d="M118 120l18-14" stroke="#2f9ad6" stroke-width="10" stroke-linecap="round"/><circle cx="138" cy="104" r="6" fill="#222"/>
      <path d="M132 106l-4-10 22-12 8 30-22-4z" fill="#f2f2f2" stroke="#8b96a3" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="154" cy="99" rx="5" ry="16" transform="rotate(-20 154 99)" fill="#e8281a"/>
    </g>
    <path d="M42 122l-12 14" stroke="#2f9ad6" stroke-width="10" stroke-linecap="round"/><circle cx="28" cy="138" r="6" fill="#222"/>
  </g>
</svg>`;
  function runRobot() {
    const mascot = document.createElement("div");
    mascot.className = "esc-mascot";
    mascot.setAttribute("aria-hidden", "true");
    mascot.innerHTML = `<div class="esc-mascot-bubble">Escalating to DE!</div>${ROBOT_SVG}`;
    mascot.addEventListener("animationend", event => { if (event.target === mascot) mascot.remove(); });
    document.body.append(mascot);
  }

  const NS="http://www.w3.org/2000/svg";
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const lerp=(a,b,p)=>a+(b-a)*p;
  const seg=(t,a,b)=>clamp((t-a)/(b-a));
  const E={inOut:p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2,out:p=>1-Math.pow(1-p,3),in:p=>p*p*p,
    outBack:p=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2)}};
  const deg=r=>r*180/Math.PI;

  // Art
  const XWING=`<svg viewBox="0 0 140 60">
<path d="M44 28 L72 5 L88 5 L66 28Z" fill="#d5d8dc" stroke="#4a4f57" stroke-width="1.5"/>
<path d="M58 15 L66 8 L76 8 L67 15Z" fill="#c8102e"/>
<rect x="70" y="2" width="34" height="3.5" rx="1.5" fill="#6b7280"/>
<path d="M44 32 L72 55 L88 55 L66 32Z" fill="#bfc4ca" stroke="#4a4f57" stroke-width="1.5"/>
<path d="M58 45 L66 52 L76 52 L67 45Z" fill="#c8102e"/>
<rect x="70" y="54.5" width="34" height="3.5" rx="1.5" fill="#6b7280"/>
<circle class="fx-thrust" cx="13" cy="30" r="7" fill="#ff9d3b"/>
<rect x="16" y="22" width="30" height="16" rx="4" fill="#9ca3af" stroke="#4a4f57" stroke-width="1.5"/>
<path d="M30 25 L118 27 L138 30 L118 33 L30 35Z" fill="#eef0f2" stroke="#4a4f57" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M84 27.5 q8 -7 20 0z" fill="#334155"/>
<rect x="96" y="28.5" width="16" height="3" fill="#c8102e"/></svg>`;
  const TIE=`<svg viewBox="0 0 90 70">
<rect x="16" y="32" width="58" height="6" fill="#6b7280"/>
<polygon points="10,2 18,12 18,58 10,68 2,58 2,12" fill="#3f4651" stroke="#1f2329" stroke-width="2"/>
<path d="M10 4 V66 M3 24 H17 M3 46 H17" stroke="#6b7280" stroke-width="1.2"/>
<polygon points="80,2 88,12 88,58 80,68 72,58 72,12" fill="#3f4651" stroke="#1f2329" stroke-width="2"/>
<path d="M80 4 V66 M73 24 H87 M73 46 H87" stroke="#6b7280" stroke-width="1.2"/>
<circle cx="45" cy="35" r="14" fill="#9ca3af" stroke="#1f2329" stroke-width="2"/>
<circle cx="45" cy="35" r="7.5" fill="#1f2937"/>
<path d="M45 27.5 V42.5 M37.5 35 H52.5 M40 30 L50 40 M50 30 L40 40" stroke="#6b7280" stroke-width="1"/></svg>`;
  const HERO=`<svg viewBox="0 0 200 80">
<g class="fx-speed" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"><path d="M-46 24 H-6"/><path d="M-70 40 H-14"/><path d="M-40 56 H-4"/></g>
<path class="fx-cape" d="M124 30 C96 20 60 16 18 24 C34 30 26 38 12 44 C30 46 24 54 16 58 C60 52 96 48 124 44Z" fill="#d6262b" stroke="#9b1419" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M70 36 L28 32" stroke="#2048b8" stroke-width="12" stroke-linecap="round"/>
<path d="M70 44 L30 46" stroke="#1a3d9e" stroke-width="12" stroke-linecap="round"/>
<path d="M30 32 L16 31" stroke="#d6262b" stroke-width="13" stroke-linecap="round"/>
<path d="M32 46 L18 47" stroke="#b81f24" stroke-width="13" stroke-linecap="round"/>
<ellipse cx="72" cy="40" rx="10" ry="10" fill="#d6262b"/>
<ellipse cx="100" cy="40" rx="30" ry="13" fill="#2457cf"/>
<rect x="76" y="28" width="4" height="24" rx="2" fill="#f6c431"/>
<circle cx="104" cy="40" r="9" fill="#f6c431" stroke="#d6262b" stroke-width="2"/>
<text x="104" y="43.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="9" fill="#d6262b">DE</text>
<path d="M100 51 L78 54" stroke="#1a3d9e" stroke-width="8" stroke-linecap="round"/>
<path d="M122 32 L168 26" stroke="#2457cf" stroke-width="9" stroke-linecap="round"/>
<circle cx="172" cy="26" r="6" fill="#f2c6a0" stroke="#c79a76"/>
<circle cx="140" cy="37" r="11" fill="#f2c6a0"/>
<path d="M129 35 C130 23 146 21 152 31 C146 28 138 29 134 37Z" fill="#1b1b24"/>
<path d="M150 31 q4 2 2 6" fill="none" stroke="#1b1b24" stroke-width="2"/>
<circle cx="146" cy="36" r="1.6" fill="#1b1b24"/></svg>`;
  const SPIDER=`<svg viewBox="0 0 80 120"><g>
<path d="M40 5 L44 40" stroke="#c8102e" stroke-width="7" stroke-linecap="round"/>
<circle cx="40" cy="5" r="4.5" fill="#c8102e"/>
<path d="M50 46 L66 60" stroke="#c8102e" stroke-width="7" stroke-linecap="round"/><circle cx="67" cy="61" r="4" fill="#c8102e"/>
<g class="fx-legs"><path d="M38 76 L28 96 L36 113" stroke="#1d4fb8" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M48 76 L62 92 L50 111" stroke="#1d4fb8" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="36" cy="114" r="5.5" fill="#c8102e"/><circle cx="50" cy="112" r="5.5" fill="#c8102e"/></g>
<rect x="33" y="38" width="22" height="42" rx="10" fill="#c8102e"/>
<path d="M33 62 h22 v8 a10 10 0 0 1 -10 10 h-2 a10 10 0 0 1 -10 -10z" fill="#1d4fb8"/>
<circle cx="44" cy="51" r="2.6" fill="#111"/><path d="M38 47 L50 55 M50 47 L38 55 M44 45 V57" stroke="#111" stroke-width="1.1"/>
<ellipse cx="30" cy="33" rx="11" ry="12.5" fill="#c8102e" stroke="#8f0b20" stroke-width="1"/>
<path d="M30 21 V45 M19.5 33 H40.5 M22 25 L38 41 M38 25 L22 41" stroke="#7a0a1b" stroke-width=".7" opacity=".7"/>
<path d="M21 31 q4 -6 8 0 q-4 4 -8 0z" fill="#fff" stroke="#111" stroke-width="1.5"/>
<path d="M31 31 q4 -6 8 0 q-4 4 -8 0z" fill="#fff" stroke="#111" stroke-width="1.5"/></g></svg>`;
  const UFO=`<svg viewBox="0 0 140 90">
<g class="fx-alien-arm"><path d="M80 27 L90 14" stroke="#4ade80" stroke-width="3.5" stroke-linecap="round"/><circle cx="91" cy="13" r="3" fill="#4ade80"/></g>
<ellipse cx="70" cy="25" rx="10" ry="11" fill="#4ade80" stroke="#15803d" stroke-width="1.5"/>
<ellipse cx="66" cy="24" rx="3" ry="4.5" fill="#111" transform="rotate(-15 66 24)"/>
<ellipse cx="74" cy="24" rx="3" ry="4.5" fill="#111" transform="rotate(15 74 24)"/>
<path d="M70 14 L68 6" stroke="#15803d" stroke-width="1.5"/><circle cx="68" cy="6" r="2" fill="#facc15"/>
<path d="M44 37 A26 26 0 0 1 96 37Z" fill="#bae6fd" fill-opacity=".5" stroke="#38bdf8" stroke-width="2"/>
<ellipse cx="70" cy="45" rx="66" ry="14" fill="#a8b3c1" stroke="#475569" stroke-width="2"/>
<ellipse cx="70" cy="40" rx="48" ry="7" fill="#cbd5e1"/>
<ellipse cx="70" cy="56" rx="26" ry="6" fill="#64748b"/>
<g class="fx-lights"><circle cx="18" cy="47" r="3.5"/><circle cx="38" cy="51" r="3.5"/><circle cx="59" cy="53" r="3.5"/><circle cx="81" cy="53" r="3.5"/><circle cx="102" cy="51" r="3.5"/><circle cx="122" cy="47" r="3.5"/></g></svg>`;
  const DOC=`<svg viewBox="0 0 46 58"><path d="M2 2 H32 L44 14 V56 H2Z" fill="#fff" stroke="#475569" stroke-width="2"/><path d="M32 2 V14 H44" fill="#e2e8f0" stroke="#475569" stroke-width="2"/><path d="M8 22 H36 M8 30 H38 M8 38 H30" stroke="#94a3b8" stroke-width="2"/><rect x="18" y="42" width="22" height="11" rx="2" fill="#fff" stroke="#b42318" stroke-width="2"/><text x="29" y="51" text-anchor="middle" font-size="9" font-weight="800" fill="#b42318" font-family="Arial">DE</text></svg>`;
  const BOOM=(()=>{let o="",i="";for(let k=0;k<16;k++){const a=k/16*Math.PI*2,r=k%2?22:48,r2=k%2?12:28;o+=`${Math.cos(a)*r},${Math.sin(a)*r} `;i+=`${Math.cos(a)*r2},${Math.sin(a)*r2} `}
    return `<svg viewBox="-50 -50 100 100"><polygon points="${o}" fill="#ff8a1f"/><polygon points="${i}" fill="#fff3b0"/></svg>`})();

  // Engine: actors are absolutely positioned and moved each frame by the variant's frame(t, dt).
  function actor(c,html,w,h,ax,ay,cls=""){
    const el=document.createElement("div");el.className="fx-actor "+cls;
    Object.assign(el.style,{width:w+"px",height:h+"px",transformOrigin:`${ax}px ${ay}px`});
    el.innerHTML=html;c.layer.append(el);
    el.set=(x,y,r=0,sx=1,sy=sx,o=1)=>{el.style.transform=`translate(${x-ax}px,${y-ay}px) rotate(${r}deg) scale(${sx},${sy})`;el.style.opacity=o};
    el.set(-9999,-9999);return el;
  }
  function bubble(c,text){
    const el=document.createElement("div");el.className="fx-bubble";el.innerHTML="<span></span>";el.firstChild.textContent=text;c.layer.append(el);
    el.text=s=>{el.firstChild.textContent=s};
    el.set=(x,y,o=1)=>{el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;el.style.opacity=o};return el;
  }
  function rope(c){
    let svg=c.layer.querySelector(".fx-ropes");
    if(!svg){svg=document.createElementNS(NS,"svg");svg.setAttribute("class","fx-ropes");svg.setAttribute("width",c.W);svg.setAttribute("height",c.H);c.layer.prepend(svg)}
    const g=document.createElementNS(NS,"g");g.innerHTML=`<line stroke="#475569" stroke-width="4" stroke-linecap="round"/><line stroke="#f8fafc" stroke-width="2" stroke-linecap="round"/>`;svg.append(g);
    return {set(x1,y1,x2,y2,on=true){g.style.display=on?"":"none";for(const l of g.children){l.setAttribute("x1",x1);l.setAttribute("y1",y1);l.setAttribute("x2",x2);l.setAttribute("y2",y2)}}};
  }
  function lasers(c){
    const list=[];
    return {list,fire(x,y,ang,speed,t,tag){const el=actor(c,"",46,5,40,2.5,"fx-laser");const b={el,x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,ang:deg(ang),born:t,tag};list.push(b);el.set(x,y,b.ang);return b},
      update(t,dt){for(let i=list.length-1;i>=0;i--){const b=list[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.el.set(b.x,b.y,b.ang);if(t-b.born>1.4||b.dead){b.el.remove();list.splice(i,1)}}}};
  }
  // short-lived particles: puffs, rings, sparks, explosions
  function particle(c,kind,x,y,t0,life,opts={}){
    const s=opts.size||20;
    const el=kind==="boom"?actor(c,BOOM,s,s,s/2,s/2):actor(c,"",s,s,s/2,s/2,"fx-"+kind);
    c.spawn((t,dt)=>{const p=(t-t0)/life;if(p>=1){el.remove();return false}
      const x2=x+(opts.vx||0)*(t-t0),y2=y+(opts.vy||0)*(t-t0);
      const sc=lerp(opts.from??.3,opts.to??1.6,E.out(p));el.set(x2,y2,(opts.spin||0)*p,sc,sc,(opts.alpha??1)*(1-p));return true});
  }
  function play(v){
    const layer=document.createElement("div");layer.className="esc-fx";layer.setAttribute("aria-hidden","true");
    document.body.append(layer);
    const spawned=[],c={W:innerWidth,H:innerHeight,layer,spawn:fn=>spawned.push(fn)},a=v.setup(c);
    let t0,last;
    function step(now){t0??=now;const t=(now-t0)/1000,dt=Math.min(.05,last==null?0:(now-last)/1000);last=now;
      a.frame(Math.min(t,a.dur),dt);for(let i=spawned.length-1;i>=0;i--)if(!spawned[i](t,dt))spawned.splice(i,1);
      if(t<a.dur&&layer.isConnected)requestAnimationFrame(step);else layer.remove()}
    requestAnimationFrame(step);
  }

  /* ---------- variants ---------- */

  const VARIANTS=[
  {id:"xwing-chase",setup(c){
    const {W,H}=c,dur=5.6,tie=actor(c,TIE,90,70,45,35),xw=actor(c,XWING,168,72,84,36),b=bubble(c,"Escalating to DE!"),L=lasers(c);
    const vx=(W+540)/dur,tx=t=>lerp(-120,W+420,t/dur),ty=t=>H*.42+Math.sin(t*3.1)*28;
    const wx=t=>tx(t)-300,wy=t=>H*.42+Math.sin((t-.45)*3.1)*28,wa=t=>Math.atan2(28*3.1*Math.cos((t-.45)*3.1),vx);
    let next=.45,side=0;
    return{dur,frame(t,dt){tie.set(tx(t),ty(t),Math.sin(t*3.1)*8);xw.set(wx(t),wy(t),deg(wa(t)));
      if(t>=next&&t<dur-.8){next+=.38;L.fire(wx(t)+44,wy(t)+(side++%2?31:-31),wa(t),1300,t)}
      L.update(t,dt);b.set(tx(t)+30,ty(t)-40)}};
  }},
  {id:"xwing-hit",setup(c){
    const {W,H}=c,dur=6.2,tie=actor(c,TIE,90,70,45,35),xw=actor(c,XWING,168,72,84,36),b=bubble(c,"Stay on target…"),L=lasers(c);
    const y0=H*.42,tx=t=>lerp(-120,W*1.15+300,t/dur),bob=t=>Math.sin(t*2.6)*12,wx=t=>tx(t)-290;
    const shots=[[.5,-34],[1.0,34],[1.5,-34],[2.1,0]];let si=0,hit=null,puff=0;
    return{dur,frame(t,dt){const y=y0+bob(t);xw.set(wx(t),y,0,1,hit&&t>hit.t+.35&&t<hit.t+1.15?Math.cos((t-hit.t-.35)/.8*Math.PI*2):1);
      if(si<shots.length&&t>=shots[si][0]){const o=shots[si][1];L.fire(wx(t)+44,y+(o?o:0),0,1500,t,o?0:"hit");si++}
      if(!hit){tie.set(tx(t),y-6+Math.sin(t*5)*4,Math.sin(t*5)*6);
        const h=L.list.find(l=>l.tag==="hit"&&l.x>=tx(t)-30);
        if(h){h.dead=true;hit={t,x:tx(t),y:y-6,vx:(W*1.15+420)/dur*.45};particle(c,"boom",hit.x,hit.y,t,.6,{size:110,from:.2,to:1.4,spin:40});b.text("Escalated to DE!")}}
      else{const s=t-hit.t,x=hit.x+hit.vx*s,yy=hit.y-160*s+380*s*s;tie.set(x,yy,s*620,1-s*.15,1-s*.15,clamp(2.6-s));
        if(t>=puff){puff=t+.06;particle(c,"smoke",x,yy,t,.9,{size:22,from:.4,to:1.6,alpha:.55})}}
      L.update(t,dt);b.set(wx(t)+10,y-46)}};
  }},
  {id:"hero-swoop",setup(c){
    const {W,H}=c,dur=4.6,h=actor(c,HERO,250,100,125,50),b=bubble(c,"Escalating to DE!");
    const P=[[-240,H*.88],[W*.55,H*.98],[W+260,-180]];
    const at=p=>[(1-p)**2*P[0][0]+2*(1-p)*p*P[1][0]+p*p*P[2][0],(1-p)**2*P[0][1]+2*(1-p)*p*P[1][1]+p*p*P[2][1]];
    let spark=0;
    return{dur,frame(t){const p=E.inOut(t/dur)*.9+t/dur*.1,[x,y]=at(p),[x2,y2]=at(Math.min(1,p+.01));h.set(x,y,deg(Math.atan2(y2-y,x2-x)));
      if(t>=spark&&t<dur-.3){spark=t+.05;particle(c,"spark",x-60*Math.cos(Math.atan2(y2-y,x2-x)),y-60*Math.sin(Math.atan2(y2-y,x2-x))+(Math.random()-.5)*20,t,.7,{size:8,from:1,to:.2})}
      b.set(x+20,y-52,clamp(t*3)*clamp((dur-.9-t)*3))}};
  }},
  {id:"hero-hover",setup(c){
    const {W,H}=c,dur=5.6,stx=W*.42,y0=H*.4,streak=actor(c,"",600,22,600,11,"fx-streak"),h=actor(c,HERO,250,100,125,50),b=bubble(c,"This looks like a job for DE!");
    return{dur,frame(t){let x,r=0,so=0;
      if(t<1.2){x=lerp(-230,stx,E.out(t/1.2));r=-4*(1-t/1.2)}
      else if(t<3.6){x=stx+Math.sin((t-1.2)*3)*4}
      else if(t<4.1){const p=seg(t,3.6,4.1);x=stx-28*E.out(p);r=-4*p}
      else{const p=seg(t,4.1,5.0);x=stx-28+(W+400-stx)*E.in(p);so=p<1?1:0;r=-4}
      const y=y0+(t>1.2&&t<4.1?Math.sin((t-1.2)*4.2)*8:0);
      h.set(x,y,r);streak.set(x-40,y,r,1,1,so*.9);b.set(x+40,y-48,seg(t,1.2,1.45)*clamp((4.1-t)*5))}};
  }},
  {id:"web-flip",setup(c){
    const {W,H}=c,L=clamp(H*.6,200,420),th=50*Math.PI/180,T=1.05,step=2*L*Math.sin(th),ax0=-120+L*Math.sin(th);
    const m=Math.max(2,Math.round(W*.42/step)),t1=m*T,fly=1.5,dur=t1+fly,ay=-6,r=rope(c),h=actor(c,SPIDER,104,156,52,78),b=bubble(c,"Thwip! Off to DE!");
    const relX=ax0+(m-1)*step+L*Math.sin(th),relY=ay+L*Math.cos(th),vx=(W+180-relX)/fly;
    return{dur,frame(t){let x,y,rot;
      if(t<t1){const i=Math.floor(t/T),p=clamp((t-i*T)/T),a=th*Math.cos(Math.PI*p),ax=ax0+i*step;
        const hx=ax-L*Math.sin(a),hy=ay+L*Math.cos(a);rot=deg(a);x=hx-73*Math.sin(a);y=hy+73*Math.cos(a);r.set(ax,ay,hx,hy)}
      else{const s=t-t1;r.set(0,0,0,0,false);rot=-deg(th)+720*E.out(s/fly);x=relX+vx*s;y=relY+73-650*s+760*s*s}
      h.set(x,y,rot);b.set(x+90,y-70)}};
  }},
  {id:"ufo-cruise",setup(c){
    const {W,H}=c,dur=5.6,u=actor(c,UFO,182,117,91,58),b=bubble(c,"Take me to DE!");
    return{dur,frame(t){const x=lerp(-160,W+160,t/dur),y=H*.32+Math.sin(t*2.5)*22;u.set(x,y,Math.sin(t*3.3)*8);b.set(x+40,y-58)}};
  }},
  {id:"ufo-beam",setup(c){
    const {W,H}=c,dur=5.8,hx=W*.5,hy=H*.24,bh=H-hy-10,beam=actor(c,`<svg viewBox="0 0 200 100" preserveAspectRatio="none"><defs><linearGradient id="bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bef264" stop-opacity=".85"/><stop offset="1" stop-color="#bef264" stop-opacity=".12"/></linearGradient></defs><polygon points="78,0 122,0 200,100 0,100" fill="url(#bm)"/></svg>`,200,bh,100,0);
    const doc=actor(c,DOC,46,58,23,29),u=actor(c,UFO,182,117,91,58),b=bubble(c,"Beaming your case to DE!");
    return{dur,frame(t){let x,y,r=0,s=1;
      if(t<1.3){const p=E.out(t/1.3);x=lerp(-160,hx,p);y=lerp(hy-60,hy,p)+Math.sin(t*6)*4;r=10*(1-p)}
      else if(t<4.4){x=hx+Math.sin(t*3)*3;y=hy+Math.sin(t*2.6)*5;r=Math.sin(t*4)*2}
      else{const p=E.in(seg(t,4.4,5.3));x=lerp(hx,W+300,p);y=lerp(hy,-220,p);r=-14*p;s=1-p*.5}
      u.set(x,y,r,s);
      const bo=t<1.4?0:t<1.7?seg(t,1.4,1.7):t<3.9?1:1-seg(t,3.9,4.2);beam.set(x,y+10,0,1,bo,bo?1:0);
      const dp=seg(t,1.8,3.7);doc.set(lerp(hx,x,dp),lerp(H-50,y+10,E.inOut(dp)),dp*200,lerp(1.1,.25,dp),lerp(1.1,.25,dp),t<1.6?seg(t,1.2,1.6):dp<1?1:0);
      b.set(x+50,y-58,seg(t,1.3,1.6)*clamp((4.5-t)*6))}};
  }},
  ];

  function run() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll(".esc-mascot, .esc-fx").forEach(el => el.remove());
    const pick = Math.floor(Math.random() * (VARIANTS.length + 1));
    if (pick === VARIANTS.length) runRobot(); else play(VARIANTS[pick]);
  }
  window.EscalationMascot = { run, variants: ["robot", ...VARIANTS.map(v => v.id)], play: id => id === "robot" ? runRobot() : play(VARIANTS.find(v => v.id === id)) };
  document.addEventListener("escalationImported", run);
})();
