(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const hud = $('hud'), menu = $('menuOverlay'), pauseLayer = $('pauseOverlay'), resultLayer = $('resultOverlay');
  const blueScoreEl = $('blueScore'), redScoreEl = $('redScore'), clockEl = $('clock'), boostFill = $('boostFill'), boostPct = $('boostPct');
  const ground = 552, ceiling = 112;
  let W = 1200, H = 675, scale = 1, dpr = 1, last = 0, state = 'menu', timeLeft = 90, scoreBlue = 0, scoreRed = 0, goalPause = false, pauseGoalRemaining = 0;
  let player, bot, ball, particles = [], shots = [], stars = [], shake = 0, toastUntil = 0, toastText = '';
  let audioCtx = null, soundOn = true, touchAxis = 0, touchBoost = false;
  const keys = Object.create(null);
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  function resize(){
    const r = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
    scale = r.height / H; W = r.width / scale;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
    stars = Array.from({length:Math.round(W/8)},()=>({x:rand(0,W),y:rand(90,ground-30),r:rand(.5,1.8),a:rand(.12,.62),p:rand(0,7)}));
    if(player && bot){ player.x=clamp(player.x,40,W-40); bot.x=clamp(bot.x,40,W-40); }
  }
  function makeCar(team,x){return {team,x,y:ground-25,vx:0,vy:0,boost:100,boosting:false,grounded:true,facing:team==='blue'?1:-1,stun:0,flash:0,wheel:0,attack:0};}
  function resetRound(){
    player=makeCar('blue',W*.25); bot=makeCar('red',W*.75);
    ball={x:W*.5,y:ground-94,vx:rand(-115,115),vy:-rand(100,190),r:21,rot:0};
    shots=[]; particles=[];
  }
  function init(){resize();resetRound();window.addEventListener('resize',resize);requestAnimationFrame(frame);}

  function startMatch(){scoreBlue=0;scoreRed=0;timeLeft=90;goalPause=false;state='playing';resetRound();hud.classList.add('active');menu.classList.add('hidden');pauseLayer.classList.add('hidden');resultLayer.classList.add('hidden');$('toast').textContent='FIRST TO 5 WINS';toastUntil=performance.now()+2200;audioUnlock();}
  function pauseMatch(){if(state!=='playing')return;state='paused';if(goalPause){pauseGoalRemaining=Math.max(0,goalPause-performance.now());goalPause=true;}pauseLayer.classList.remove('hidden');}
  function resumeMatch(){if(state!=='paused')return;state='playing';pauseLayer.classList.add('hidden');last=performance.now();if(goalPause)goalPause=performance.now()+pauseGoalRemaining;}
  function finishMatch(){state='finished';resultLayer.classList.remove('hidden');$('resultEyebrow').textContent=scoreBlue===scoreRed?'OVERTIME OVER':'FINAL WHISTLE';$('resultTitle').textContent=scoreBlue===scoreRed?'DRAW!':scoreBlue>scoreRed?'VICTORY!':'DEFEAT';$('resultTitle').style.color=scoreBlue===scoreRed?'#f6d579':scoreBlue>scoreRed?'#62e3ff':'#ff8290';$('resultCopy').textContent=scoreBlue===scoreRed?'Evenly matched. One more?':scoreBlue>scoreRed?'The arena is yours. Nice driving.':'The Rockets take this one. Run it back?';}
  function playSound(freq=440,duration=.08,type='sine',volume=.035){if(!soundOn)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}catch(_){}}
  function audioUnlock(){playSound(440,.05,'triangle',.015)}
  function burst(x,y,color,n=12,power=180){for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),s=rand(power*.25,power);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.25,.68),max:.68,size:rand(2,5),color});}}
  function toast(text){toastText=text;$('toast').textContent=text;toastUntil=performance.now()+1800;}

  function jump(car){if(car.grounded&&state==='playing'){car.vy=-545;car.grounded=false;burst(car.x,ground-8,car.team==='blue'?'#65dfff':'#ff8490',5,60);playSound(180,.1,'triangle',.025)}}
  function boost(car,dt,playerControlled=false){const want=playerControlled?(keys.Shift||keys.ArrowUp||touchBoost):bot.wantsBoost;if(want&&car.boost>0){car.boosting=true;car.boost=Math.max(0,car.boost-35*dt);car.vx+=car.facing*490*dt;if(car.grounded)car.vy-=32*dt;if(Math.random()<dt*38){const c=car.team==='blue'?'#66eaff':'#ff6879';particles.push({x:car.x-car.facing*22,y:car.y+rand(-6,8),vx:-car.facing*rand(70,210),vy:rand(-35,35),life:.28,max:.28,size:rand(3,7),color:c});}}else{car.boosting=false;car.boost=Math.min(100,car.boost+15*dt)}}
  function fire(car){if(car.attack>0||state!=='playing')return;car.attack=.62;const color=car.team==='blue'?'#5be7ff':'#ff6178';shots.push({x:car.x+car.facing*26,y:car.y-9,vx:car.facing*570,team:car.team,life:1.55,color});playSound(320,.11,'sawtooth',.025);burst(car.x+car.facing*25,car.y-9,color,4,50);}

  function updateCar(car,dt,isPlayer){
    if(car.stun>0){car.stun-=dt;car.vx*=Math.pow(.12,dt);car.vy+=950*dt;car.y+=car.vy*dt;if(car.y>=ground-25){car.y=ground-25;car.vy=0;car.grounded=true}car.flash-=dt;return;}
    let ax=0;
    if(isPlayer){ax=(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0);if(Math.abs(touchAxis)>.12)ax=touchAxis;if((keys.Space||keys.KeyW||keys.ArrowUp)&&!car.jumpHeld){jump(car);car.jumpHeld=true;}if(!(keys.Space||keys.KeyW||keys.ArrowUp))car.jumpHeld=false;if((keys.KeyJ||keys.KeyZ)&&!car.fireHeld){fire(car);car.fireHeld=true;}if(!(keys.KeyJ||keys.KeyZ))car.fireHeld=false;}
    else{
      const target=ball.x+(ball.x>car.x?-48:48);ax=Math.abs(target-car.x)>15?Math.sign(target-car.x):0;
      if(car.grounded&&ball.y<ground-65&&Math.abs(ball.x-car.x)<175&&Math.random()<dt*3.1)jump(car);
      if(Math.abs(ball.x-car.x)>260&&Math.random()<dt*1.1)car.wantsBoost=true;else car.wantsBoost=Math.abs(ball.x-car.x)>150&&Math.random()<.7;
      if(Math.abs(ball.x-car.x)<115&&Math.abs(ball.y-car.y)<75&&car.attack<=0&&Math.random()<dt*1.25)fire(car);
    }
    if(ax){car.facing=ax;car.vx+=ax*(car.boosting?650:510)*dt;}
    car.vx*=Math.pow(car.grounded?.84:.975,dt*60);car.vx=clamp(car.vx,-(car.boosting?510:320),car.boosting?510:320);
    car.wheel+=Math.abs(car.vx)*dt*.045;car.x+=car.vx*dt;
    const leftGoal=82,rightGoal=W-82;car.x=clamp(car.x,leftGoal,rightGoal);
    boost(car,dt,isPlayer);
    car.vy+=1250*dt;car.y+=car.vy*dt;
    if(car.y>=ground-25){car.y=ground-25;car.vy=0;if(!car.grounded)burst(car.x,ground-6,car.team==='blue'?'#49d7f0':'#f56278',3,35);car.grounded=true;}else car.grounded=false;
    car.y=Math.max(ceiling+27,car.y);car.attack=Math.max(0,car.attack-dt);car.flash=Math.max(0,car.flash-dt);
  }

  function update(dt){
    if(state!=='playing')return;
    timeLeft-=dt;if(timeLeft<=0){timeLeft=0;finishMatch();return;}
    if(goalPause){
      for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;p.vx*=Math.pow(.95,dt*60);p.life-=dt;}particles=particles.filter(p=>p.life>0);
      if(performance.now()>=goalPause){goalPause=false;if(state==='playing')resetRound();}
      if(shake>0)shake=Math.max(0,shake-dt*20);return;
    }
    updateCar(player,dt,true);updateCar(bot,dt,false);
    ball.vy+=800*dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.rot+=ball.vx*dt/ball.r;
    ball.vx*=Math.pow(.999,dt*60);
    if(ball.y+ball.r>ground){ball.y=ground-ball.r;ball.vy=-Math.abs(ball.vy)*.73;if(Math.abs(ball.vy)<55)ball.vy=0;ball.vx*=.985;if(Math.abs(ball.vy)>100&&Math.random()<.2)burst(ball.x,ground-3,'#ecfaff',2,45)}
    if(ball.y-ball.r<ceiling){ball.y=ceiling+ball.r;ball.vy=Math.abs(ball.vy)*.83;}
    // Arena sidewalls leave a goal opening near the floor.
    if(ball.x-ball.r<24){if(ball.y>ground-151){scoreGoal('red');return;}ball.x=24+ball.r;ball.vx=Math.abs(ball.vx)*.82;}
    if(ball.x+ball.r>W-24){if(ball.y>ground-151){scoreGoal('blue');return;}ball.x=W-24-ball.r;ball.vx=-Math.abs(ball.vx)*.82;}
    collideCar(player);collideCar(bot);
    for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.x+=s.vx*dt;s.life-=dt;
      if(s.team==='blue'&&Math.abs(s.x-bot.x)<26&&Math.abs(s.y-(bot.y-6))<27){bot.stun=.38;bot.vx+=Math.sign(s.vx)*245;bot.vy=-125;bot.grounded=false;bot.flash=.4;burst(bot.x,bot.y,'#ff7385',14,155);shots.splice(i,1);continue;}
      if(s.team==='red'&&Math.abs(s.x-player.x)<26&&Math.abs(s.y-(player.y-6))<27){player.stun=.3;player.vx+=Math.sign(s.vx)*180;player.vy=-100;player.grounded=false;player.flash=.3;burst(player.x,player.y,'#64e5ff',10,130);shots.splice(i,1);continue;}
      if(Math.hypot(s.x-ball.x,s.y-ball.y)<ball.r+7){ball.vx+=Math.sign(s.vx)*230;ball.vy-=45;burst(s.x,s.y,s.color,7,90);shots.splice(i,1);continue;}
      if(s.life<=0||s.x<0||s.x>W)shots.splice(i,1);
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;p.vx*=Math.pow(.95,dt*60);p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    if(shake>0)shake=Math.max(0,shake-dt*20);
    if(performance.now()<toastUntil)$('toast').textContent=toastText;else $('toast').textContent='';
    if(scoreBlue>=5||scoreRed>=5)finishMatch();
  }
  function collideCar(car){
    const dx=ball.x-car.x,dy=ball.y-(car.y-4),nearestX=clamp(dx,-28,28),nearestY=clamp(dy,-17,17),ox=dx-nearestX,oy=dy-nearestY,d=Math.hypot(ox,oy);
    if(d<ball.r){let nx,ny;if(d<.01){nx=car.facing;ny=-.25;}else{nx=ox/d;ny=oy/d;}const push=ball.r-d;ball.x+=nx*push;ball.y+=ny*push;const hit=Math.max(0,car.vx*nx+(-car.vy)*ny);ball.vx+=nx*(190+hit*.72)+car.vx*.48;ball.vy+=ny*(180+hit*.5)-Math.max(0,-car.vy)*.22;ball.vx=clamp(ball.vx,-720,720);ball.vy=clamp(ball.vy,-760,570);if(push>8){burst(ball.x-nx*ball.r,ball.y-ny*ball.r,car.team==='blue'?'#6aeaff':'#ff7789',4,60);playSound(140+Math.random()*70,.07,'triangle',.018)}}
  }
  function scoreGoal(team){if(goalPause)return;if(team==='blue')scoreBlue++;else scoreRed++;shake=7;burst(team==='blue'?W-35:35,ground-75,team==='blue'?'#4edfff':'#ff6177',38,290);playSound(220,.45,'sawtooth',.05);playSound(550,.28,'triangle',.04);toast(team==='blue'?'TURBO SCORES!':'ROCKETS SCORE!');if(scoreBlue>=5||scoreRed>=5){goalPause=false;setTimeout(()=>{if(state==='playing')finishMatch()},650)}else{goalPause=performance.now()+720;}}

  function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
  function drawBackground(now){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#071526');g.addColorStop(.58,'#0b2138');g.addColorStop(1,'#0a1a2a');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // distant towers and atmospheric glow
    const glow=ctx.createRadialGradient(W*.5,ground-70,20,W*.5,ground-70,W*.65);glow.addColorStop(0,'#17486a55');glow.addColorStop(1,'#09162500');ctx.fillStyle=glow;ctx.fillRect(0,80,W,ground-70);
    ctx.fillStyle='#10283c';for(let i=0;i<Math.ceil(W/78);i++){const x=i*78,hh=40+(Math.sin(i*42.7)+1)*55;ctx.fillRect(x,ground-30-hh,50,hh);ctx.fillStyle='#23506a';for(let j=0;j<4;j++)ctx.fillRect(x+8+j*10,ground-36-hh,3,3);ctx.fillStyle='#10283c';}
    for(const s of stars){ctx.globalAlpha=s.a*(.72+.28*Math.sin(now*.001+s.p));ctx.fillStyle='#b8eaff';ctx.fillRect(s.x,s.y,s.r,s.r);}ctx.globalAlpha=1;
    // arena enclosure
    const wall=ctx.createLinearGradient(0,ceiling,0,ground);wall.addColorStop(0,'#142d43');wall.addColorStop(.1,'#122b40');wall.addColorStop(.94,'#10273a');wall.addColorStop(1,'#183b4e');ctx.fillStyle=wall;ctx.fillRect(0,ceiling,W,ground-ceiling);
    ctx.fillStyle='#18364d';ctx.fillRect(0,ceiling,W,9);ctx.fillStyle='#49d9fa';ctx.fillRect(0,ceiling,W,2);
    // wall vertical panels
    for(let x=14;x<W;x+=74){ctx.fillStyle='#25475c55';ctx.fillRect(x,ceiling+15,2,ground-ceiling-35);ctx.fillStyle='#82c7d844';ctx.fillRect(x+5,ceiling+15,9,2);}
    // field bands
    for(let x=26;x<W-20;x+=120){ctx.fillStyle='#48c1ed08';ctx.fillRect(x,ceiling+13,60,ground-ceiling-25)}
    ctx.strokeStyle='#6eb6d41b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W/2,ceiling+20);ctx.lineTo(W/2,ground);ctx.stroke();ctx.beginPath();ctx.arc(W/2,ground-90,64,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#55c6e8';ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(W/2,ground-90,3,0,7);ctx.fill();ctx.globalAlpha=1;
    // goal bays
    drawGoal(0,'#37d5ff');drawGoal(W,'#ff586f');
    // floor lip and foreground strip
    ctx.fillStyle='#0a1521';ctx.fillRect(0,ground,W,H-ground);ctx.fillStyle='#28485d';ctx.fillRect(0,ground,W,6);ctx.fillStyle='#49dbfa';ctx.fillRect(0,ground,W,2);
    const floor=ctx.createLinearGradient(0,ground,0,H);floor.addColorStop(0,'#122b3e');floor.addColorStop(1,'#071421');ctx.fillStyle=floor;ctx.fillRect(0,ground+7,W,H-ground-7);
    for(let x=0;x<W;x+=44){ctx.fillStyle='#26465a';ctx.fillRect(x,ground+19,22,2)}
    const v=ctx.createLinearGradient(0,ground,0,ground+27);v.addColorStop(0,'#2fd9fb');v.addColorStop(1,'#2fd9fb00');ctx.fillStyle=v;ctx.fillRect(0,ground,W,27);
  }
  function drawGoal(x,color){const left=x===0;const gx=left?15:W-15,dir=left?1:-1;ctx.save();ctx.globalAlpha=.95;ctx.fillStyle=color+'16';ctx.fillRect(left?0:W-52,ground-155,52,155);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=15;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(gx,ground-150);ctx.lineTo(gx+dir*37,ground-150);ctx.lineTo(gx+dir*37,ground-5);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle=color+'77';ctx.lineWidth=1;for(let y=ground-136;y<ground-8;y+=18){ctx.beginPath();ctx.moveTo(left?2:W-2,y);ctx.lineTo(gx+dir*30,y);ctx.stroke()}ctx.restore();}
  function drawCar(car,now){
    const blue=car.team==='blue',main=blue?'#36bdf1':'#f04461',light=blue?'#8cf1ff':'#ff9da8',dark=blue?'#0c4770':'#681d36';
    ctx.save();ctx.translate(car.x,car.y);ctx.scale(car.facing,1);
    if(car.boosting){const trail=ctx.createLinearGradient(-65,0,-12,0);trail.addColorStop(0,blue?'#28c5ff00':'#ff4c6600');trail.addColorStop(1,blue?'#51e5ffcc':'#ff6b7acc');ctx.fillStyle=trail;ctx.beginPath();ctx.moveTo(-20,-6);ctx.lineTo(-64,rand(-10,2));ctx.lineTo(-23,3);ctx.fill();}
    // shadow
    ctx.fillStyle='#02091388';ctx.beginPath();ctx.ellipse(0,27,34,7,0,0,Math.PI*2);ctx.fill();
    // wheels
    for(const wx of [-20,18]){ctx.fillStyle='#08111a';ctx.beginPath();ctx.ellipse(wx,17,9,11,0,0,7);ctx.fill();ctx.strokeStyle='#668091';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(wx,17,4,7,car.wheel,0,7);ctx.stroke();ctx.fillStyle=light;ctx.fillRect(wx-1,12,2,10);}
    // body
    ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-31,5);ctx.lineTo(-27,-9);ctx.lineTo(-14,-14);ctx.lineTo(-5,-28);ctx.lineTo(13,-27);ctx.lineTo(27,-13);ctx.lineTo(31,2);ctx.lineTo(25,11);ctx.lineTo(-25,11);ctx.closePath();ctx.fill();
    const body=ctx.createLinearGradient(0,-28,0,12);body.addColorStop(0,light);body.addColorStop(.33,main);body.addColorStop(1,dark);ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-27,4);ctx.lineTo(-23,-8);ctx.lineTo(-12,-11);ctx.lineTo(-4,-24);ctx.lineTo(11,-23);ctx.lineTo(23,-11);ctx.lineTo(27,3);ctx.lineTo(23,8);ctx.lineTo(-22,8);ctx.closePath();ctx.fill();
    // windshield
    ctx.fillStyle='#082239';ctx.beginPath();ctx.moveTo(-10,-19);ctx.lineTo(7,-20);ctx.lineTo(18,-10);ctx.lineTo(-15,-10);ctx.closePath();ctx.fill();ctx.strokeStyle=light+'99';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#e7fbff';ctx.globalAlpha=.9;ctx.fillRect(22,-6,5,4);ctx.globalAlpha=1;ctx.fillStyle=blue?'#ff9e59':'#48dfff';ctx.fillRect(-28,-4,4,5);
    // roof stripe + badge
    ctx.fillStyle=light;ctx.globalAlpha=.85;ctx.fillRect(-3,-25,4,14);ctx.globalAlpha=1;ctx.fillStyle='#ffffff';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(blue?'1':'BOT',3,5);
    if(car.flash>0){ctx.globalAlpha=car.flash*1.8;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,-7,31,22,0,0,7);ctx.fill();}
    if(car.boosting){ctx.globalAlpha=.5;ctx.strokeStyle=light;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-6,37,29,0,0,7);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
    // Name tag / health-like energy ring
    ctx.fillStyle=blue?'#71e6ff':'#ff8191';ctx.globalAlpha=.8;ctx.font='8px "DM Mono", monospace';ctx.textAlign='center';ctx.fillText(blue?'YOU':'CPU',car.x,car.y-43);ctx.globalAlpha=1;
  }
  function drawBall(now){
    ctx.save();ctx.translate(ball.x,ball.y);ctx.rotate(ball.rot);
    ctx.shadowColor='#9ceeff';ctx.shadowBlur=17;const gr=ctx.createRadialGradient(-7,-8,2,0,0,ball.r);gr.addColorStop(0,'#ffffff');gr.addColorStop(.35,'#c7f6ff');gr.addColorStop(1,'#4e9bb8');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#2c6076';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,ball.r*.63,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#68c5df';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*ball.r*.64,Math.sin(a)*ball.r*.64,4,0,7);ctx.fill();}ctx.fillStyle='#f6ffff';ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill();ctx.restore();
    // ball motion glint
    ctx.globalAlpha=.32;ctx.fillStyle='#d5fbff';ctx.beginPath();ctx.ellipse(ball.x-ball.vx*.027,ball.y+ball.r+3,ball.r*clamp(Math.abs(ball.vx)/550,.16,.75),3,0,0,7);ctx.fill();ctx.globalAlpha=1;
  }
  function draw(now){
    ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);ctx.clearRect(0,0,W,H);
    ctx.save();if(shake){ctx.translate(rand(-shake,shake),rand(-shake,shake));}
    drawBackground(now);
    if(player&&bot){for(const s of shots){ctx.save();ctx.shadowColor=s.color;ctx.shadowBlur=14;ctx.fillStyle=s.color;ctx.beginPath();ctx.ellipse(s.x,s.y,10,4,0,0,7);ctx.fill();ctx.restore();}drawCar(player,now);drawCar(bot,now);drawBall(now);}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*clamp(p.life/p.max,.3,1),0,7);ctx.fill();}ctx.globalAlpha=1;
    ctx.restore();
    // slow pulse across field bottom
    if(state==='menu'){ctx.save();ctx.globalAlpha=.16;ctx.strokeStyle='#49def8';ctx.setLineDash([6,9]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W*.5,ground);ctx.lineTo(W*.5,ground+32);ctx.stroke();ctx.restore();}
    updateHud();
  }
  function updateHud(){blueScoreEl.textContent=scoreBlue;redScoreEl.textContent=scoreRed;const sec=Math.ceil(timeLeft);clockEl.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(player){boostFill.style.width=player.boost+'%';boostPct.textContent=Math.round(player.boost)}if(state==='playing'&&performance.now()<toastUntil)$('toast').textContent=toastText;}
  function frame(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw(now);requestAnimationFrame(frame)}

  $('playButton').addEventListener('click',startMatch);$('resumeButton').addEventListener('click',resumeMatch);$('restartButton').addEventListener('click',startMatch);$('rematchButton').addEventListener('click',startMatch);$('pauseButton').addEventListener('click',pauseMatch);
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Escape'&&state==='playing')pauseMatch();else if(e.code==='Escape'&&state==='paused')resumeMatch();if(e.code==='Enter'&&state==='menu')startMatch();});window.addEventListener('keyup',e=>{keys[e.code]=false});window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);touchAxis=0;touchBoost=false});
  const joy=$('joystick'),knob=$('joyKnob');let joyPointer=null;
  joy.addEventListener('pointerdown',e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e);});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)moveJoy(e)});function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2);touchAxis=clamp(dx/(r.width*.36),-1,1);knob.style.left=`${50+touchAxis*31}%`;}
  function joyEnd(e){if(e.pointerId!==joyPointer)return;joyPointer=null;touchAxis=0;knob.style.left='50%'}joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
  function bindAction(id,down,up){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('pressed');down();});const release=e=>{el.classList.remove('pressed');up();};el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);}
  bindAction('jumpButton',()=>jump(player),()=>{});bindAction('boostButton',()=>{touchBoost=true},()=>{touchBoost=false});bindAction('blastButton',()=>fire(player),()=>{});
  document.addEventListener('contextmenu',e=>e.preventDefault());init();
})();
