import { SalonGame } from './salon.js';
const $ = id => document.getElementById(id);
const STYLES = [
  {id:'rosy',name:'Rosy glow',color:'#d794a0',accent:'#f5d4d5',pattern:'solid',finish:'Glossy rose',description:'Your everyday romance, in a soft petal pink.'},
  {id:'french',name:'French linen',color:'#e9c3b4',accent:'#fffaf0',pattern:'french',finish:'Classic French',description:'Sheer warmth with a perfectly crisp ivory tip.'},
  {id:'cherry',name:'Cherry crush',color:'#9e3643',accent:'#e8958f',pattern:'solid',finish:'Deep cherry gloss',description:'A little drama. A rich red that does the talking.'},
  {id:'lavender',name:'Lavender haze',color:'#b5a3d1',accent:'#fff5cf',pattern:'floral',finish:'Lilac + tiny florals',description:'Dreamy lilac, dressed with little white flowers.'},
  {id:'jade',name:'Jade muse',color:'#7eaa90',accent:'#d3e0b4',pattern:'marble',finish:'Jade marble',description:'Soft green swirls, like a tiny treasure from nature.'},
  {id:'chrome',name:'Moonlit chrome',color:'#c0c6d8',accent:'#f4e6cd',pattern:'chrome',finish:'Pearl chrome',description:'A pearly little glow that catches every ray of light.'}
];
const BARE = {id:'bare',name:'Bare & beautiful',color:'#e3b8ad',accent:'#ead7bf',pattern:'solid',finish:'Natural finish',description:'A clean canvas for your next favorite set.'};
const findStyle = id => STYLES.find(s => s.id === id) || BARE;
const STORAGE = 'nail-room-visit-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch {}
let collected = new Set(Array.isArray(saved.collected) ? saved.collected.filter(id => STYLES.some(s => s.id === id)) : []);
let active = collected.has(saved.active) ? saved.active : 'bare';
let shape = ['almond','square','stiletto'].includes(saved.shape) ? saved.shape : 'almond';
let length = ['short','medium','long'].includes(saved.length) ? saved.length : 'medium';
let comparisons = Array.isArray(saved.comparisons) ? saved.comparisons.filter(c => c && (c.id === 'bare' || collected.has(c.id)) && ['almond','square','stiletto'].includes(c.shape) && ['short','medium','long'].includes(c.length)).slice(0,2) : [];
let hasEntered = false, soundEnabled = false, audioContext, toastTimer, lastManicure = null;
function persist() { try {localStorage.setItem(STORAGE,JSON.stringify({collected:[...collected],active,shape,length,comparisons}));} catch {} }
function tone(freq=680,delay=0,duration=.15,volume=.06) {
  if(!soundEnabled) return;
  try {audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); const o=audioContext.createOscillator(),g=audioContext.createGain(); const t=audioContext.currentTime+delay;o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+duration+.02);} catch {}
}
function chime(){tone(660);tone(880,.09);tone(1100,.18,.23,.035);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true},3200)}
let svgCounter = 0;
function handSVG(style,nailShape=shape,nailLength=length) {
  const p='h'+(++svgCounter), skin='#d9a27e';
  const fill=style.pattern==='chrome'?`url(#${p}chrome)`:`url(#${p}polish)`;
  let details='';
  const nail=(x,y,w=28,h=43,rotation=0)=>{
    const extra={short:0,medium:10,long:22}[nailLength]; const nh=h+extra; const top=y-extra;
    let path;
    if(nailShape==='square') path=`M${x+3},${top+7} Q${x+3},${top} ${x+9},${top} H${x+w-9} Q${x+w-3},${top} ${x+w-3},${top+7} L${x+w-2},${top+nh-8} Q${x+w/2},${top+nh+2} ${x+2},${top+nh-8} Z`;
    else if(nailShape==='stiletto') path=`M${x+w/2},${top-6} C${x+w-1},${top+15} ${x+w+2},${top+nh-10} ${x+w-3},${top+nh-6} Q${x+w/2},${top+nh+3} ${x+3},${top+nh-6} C${x-2},${top+nh-10} ${x+1},${top+15} ${x+w/2},${top-6} Z`;
    else path=`M${x+w/2},${top} C${x+w+5},${top+7} ${x+w+1},${top+nh-5} ${x+w-4},${top+nh-3} Q${x+w/2},${top+nh+4} ${x+4},${top+nh-3} C${x-1},${top+nh-5} ${x-5},${top+7} ${x+w/2},${top} Z`;
    const n=`${p}n${x}`;
    let pattern='';
    if(style.pattern==='french') pattern=`<path d="M${x-5},${top-8} H${x+w+5} V${top+12} Q${x+w/2},${top+19} ${x-5},${top+12}Z" fill="#fffaf0"/>`;
    if(style.pattern==='floral') {
      const cx=x+w*.57,cy=top+nh*.47;
      pattern=Array.from({length:5},(_,i)=>`<ellipse cx="${cx}" cy="${cy-4}" rx="2.5" ry="4.3" fill="#fffbe7" transform="rotate(${i*72} ${cx} ${cy})"/>`).join('')+`<circle cx="${cx}" cy="${cy}" r="2.2" fill="#d0ad67"/>`;
    }
    if(style.pattern==='marble') pattern=`<path d="M${x-4} ${top+9} Q${x+w+10} ${top+16} ${x+9} ${top+30} T${x+w+7} ${top+nh}" fill="none" stroke="#e4ebce" stroke-width="3" opacity=".85"/><path d="M${x-4} ${top+16} Q${x+w+11} ${top+23} ${x+12} ${top+36} T${x+w+11} ${top+nh}" fill="none" stroke="#518c71" stroke-width="1"/><path d="M${x+10} ${top} Q${x+4} ${top+25} ${x+w} ${top+40}" fill="none" stroke="#d7c38b" stroke-width=".7"/>`;
    return `<g transform="rotate(${rotation} ${x+w/2} ${y+h})"><defs><clipPath id="${n}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="${fill}" stroke="#b6867440" stroke-width=".8"/><g clip-path="url(#${n})">${pattern}<path d="M${x+7},${top+13} Q${x+3},${top+25} ${x+6},${top+nh-13}" fill="none" stroke="#fffef9" opacity=".55" stroke-width="2.5" stroke-linecap="round"/></g></g>`;
  };
  const fingers=[{x:83,y:102,w:36,h:125},{x:122,y:58,w:37,h:155},{x:163,y:39,w:38,h:167},{x:205,y:73,w:34,h:145}];
  details += fingers.map(f=>`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${f.w/2}" fill="url(#${p}skin)"/><path d="M${f.x+8} ${f.y+86}q10-3 20 0" fill="none" stroke="#bb846545" stroke-width="1.3"/>`).join('');
  details+=`<path d="M87 180 C78 190 76 198 72 213 L48 177 C37 161 21 165 24 186 L49 253 C58 276 74 287 96 300 L98 349 L223 349 L216 292 Q246 267 239 208 C209 195 172 195 148 199 Q114 194 87 180Z" fill="url(#${p}palm)"/><path d="M89 219q20 32 49 50" stroke="#bc84644a" stroke-width="1.5" fill="none"/><path d="M106 302q42-10 101 0" stroke="#bd866844" stroke-width="1.5" fill="none"/>`;
  details+=fingers.map(f=>nail(f.x+4,f.y+9,f.w-8,43)).join('');
  details+=nail(26,173,29,39,-29);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 355" aria-hidden="true"><defs><linearGradient id="${p}skin" x1="0" x2="1"><stop stop-color="#b47d5d"/><stop offset=".23" stop-color="${skin}"/><stop offset=".65" stop-color="#e7b593"/><stop offset="1" stop-color="#c18a68"/></linearGradient><linearGradient id="${p}palm" x1="0" x2="1" y2=".2"><stop stop-color="#ca936e"/><stop offset=".55" stop-color="#e6b08a"/><stop offset="1" stop-color="#c78f6b"/></linearGradient><linearGradient id="${p}polish" x1="0" x2="1" y2=".2"><stop stop-color="${style.accent}"/><stop offset=".3" stop-color="${style.color}"/><stop offset=".82" stop-color="${style.color}"/><stop offset="1" stop-color="${style.accent}"/></linearGradient><linearGradient id="${p}chrome" x1="0" x2="1"><stop stop-color="#9aadb4"/><stop offset=".28" stop-color="#e8d9d8"/><stop offset=".48" stop-color="#a6a2d4"/><stop offset=".62" stop-color="#f9f5e3"/><stop offset=".82" stop-color="#b8d5bf"/><stop offset="1" stop-color="#92a5b4"/></linearGradient></defs>${details}<path d="M99 329q55-8 122 0" stroke="#bfa16b" stroke-width="3" fill="none"/><path d="M100 332q57-7 121 0" stroke="#e0c991" stroke-width="1" fill="none"/></svg>`;
}
const lockSVG='<svg class="style-lock" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M7 8V5a3 3 0 0 1 6 0v3"/></svg>';
function renderWardrobe(){
  $('count').textContent=collected.size;$('wardrobe-count').textContent=`${collected.size} of 6`;
  $('style-grid').innerHTML=STYLES.map(s=>`<button class="style-card ${collected.has(s.id)?'collected':''} ${active===s.id?'active':''}" data-style="${s.id}" ${collected.has(s.id)?'':'disabled'} aria-pressed="${active===s.id}" aria-label="${s.name}${collected.has(s.id)?', try this set':', find this set in the studio'}"><span class="nail-samples pattern-${s.pattern}" style="--swatch:${s.color}"><i class="sample-nail"></i><i class="sample-nail"></i><i class="sample-nail"></i></span>${lockSVG}<strong>${s.name}</strong><small>${s.finish}<span>${collected.has(s.id)?(active===s.id?'On your hands ✓':'Try it ↗'):'Find me ◦'}</span></small></button>`).join('');
}
function renderLook(){const s=findStyle(active);$('look-name').textContent=s.name;$('look-description').textContent=s.description;$('look-finish').textContent=s.finish;$('look-swatch').style.background=s.color;$('look-status').textContent=lastManicure===active?'Freshly polished ✓':active==='bare'?'Your starting look':'Ready to try on';$('hand-preview').innerHTML=handSVG(s);$('hand-preview').setAttribute('aria-label',`Hand preview: ${s.name}, ${length} ${shape} nails`);document.querySelectorAll('[data-shape]').forEach(b=>{const a=b.dataset.shape===shape;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a)});document.querySelectorAll('[data-length]').forEach(b=>{const a=b.dataset.length===length;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a)});}
function renderComparisons(){
  $('comparison-section').hidden=comparisons.length===0;
  $('compare-grid').innerHTML=comparisons.map((c,i)=>{const s=findStyle(c.id);return `<article class="comparison-card"><div class="small-hand" role="img" aria-label="${s.name}, ${c.length} ${c.shape} nails">${handSVG(s,c.shape,c.length)}</div><div><div class="eyebrow">LOOK ${i+1}</div><h3>${s.name}</h3><p>${c.length[0].toUpperCase()+c.length.slice(1)} · ${c.shape}</p><button class="text-button" data-wear="${i}">Wear this look ↗</button></div></article>`}).join('')+(comparisons.length===1?'<div class="comparison-card comparison-empty">One more little possibility.<br>Save another look to see them side by side.</div>':'');
  $('pin').innerHTML=`<svg viewBox="0 0 24 24"><rect x="3" y="5" width="7" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2"/></svg> ${comparisons.length===2?'Replace second comparison':'Save this look to compare'} <span>+</span>`;
}
function choose(id){if(id!=='bare'&&!collected.has(id))return;active=id;game.setStyle(id);renderLook();renderWardrobe();persist();tone(560,0,.12,.03);}
const game = new SalonGame($('salon'),{
 styles:STYLES,
 onCollect(style){collected.add(style.id);active=style.id;lastManicure=null;renderWardrobe();renderLook();persist();chime();toast(`${style.name} discovered. It's yours to try!`);if(collected.size===6)setTimeout(()=>toast('Your wardrobe is complete. Time for a favorite set.'),3400)},
 onNear(near){$('interaction').hidden=!near||!hasEntered;if(!near)return;$('interaction-text').textContent=near.type==='style'?`Pick up ${near.style.name}`:'Take a seat for your manicure';$('interact-button').textContent=near.type==='style'?'Pick up ↗':'Take a seat ↗';},
 onManicure(style){active=style.id;game.setStyle(active);lastManicure=style.id;renderWardrobe();renderLook();persist();chime();toast(`${style.name}, freshly polished. Looking lovely.`);}
});
game.setCollected([...collected]);game.setStyle(active);
$('enter').addEventListener('click',()=>{hasEntered=true;$('arrival').hidden=true;game.setEnabled(true);$('salon').focus({preventScroll:true});tone(520);tone(780,.12);toast('Six sets to discover. Follow the little sparkles.');});
$('interact-button').addEventListener('click',()=>{game.interact();$('salon').focus({preventScroll:true});});
$('recenter').addEventListener('click',()=>{game.resetPosition();$('salon').focus({preventScroll:true});});
$('style-grid').addEventListener('click',e=>{const b=e.target.closest('[data-style]');if(b&&!b.disabled)choose(b.dataset.style);});
$('shape-options').addEventListener('click',e=>{const b=e.target.closest('[data-shape]');if(b){shape=b.dataset.shape;renderLook();persist();}});
$('length-options').addEventListener('click',e=>{const b=e.target.closest('[data-length]');if(b){length=b.dataset.length;renderLook();persist();}});
$('pin').addEventListener('click',()=>{const c={id:active,shape,length};if(comparisons.some(v=>JSON.stringify(v)===JSON.stringify(c))){toast('That exact look is already in your comparison.');return;}if(comparisons.length<2)comparisons.push(c);else comparisons[1]=c;renderComparisons();persist();toast('Look saved. Try another set to compare.');});
$('clear-comparison').addEventListener('click',()=>{comparisons=[];renderComparisons();persist();});
$('compare-grid').addEventListener('click',e=>{const b=e.target.closest('[data-wear]');if(!b)return;const c=comparisons[Number(b.dataset.wear)];shape=c.shape;length=c.length;choose(c.id);});
$('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').setAttribute('aria-label',soundEnabled?'Turn sound off':'Turn sound on');$('sound').title=soundEnabled?'Turn sound off':'Turn sound on';$('sound').innerHTML=soundEnabled?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5ZM15 8q5 4 0 8m3-11q8 7 0 14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l5 6m0-6-5 6"/></svg>';chime();});
const closeHelp=()=>{$('help-dialog').close();game.setEnabled(hasEntered);if(hasEntered)$('salon').focus({preventScroll:true});};
$('help').addEventListener('click',()=>{game.setEnabled(false);$('help-dialog').showModal();});$('close-help').addEventListener('click',closeHelp);$('help-done').addEventListener('click',closeHelp);$('help-dialog').addEventListener('cancel',()=>game.setEnabled(hasEntered));
$('new-visit').addEventListener('click',()=>{if(!confirm('Start a fresh visit? Your collected sets and saved comparisons in this browser will be cleared.'))return;collected=new Set();active='bare';shape='almond';length='medium';comparisons=[];lastManicure=null;game.setCollected([]);game.setStyle('bare');game.resetPosition();renderWardrobe();renderLook();renderComparisons();persist();toast('A fresh little adventure awaits.');});
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);game.setInput(b.dataset.key,true);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>game.setInput(b.dataset.key,false));});
document.addEventListener('visibilitychange',()=>{if(document.hidden)game.setEnabled(false);else game.setEnabled(hasEntered&&!$('help-dialog').open);});
renderWardrobe();renderLook();renderComparisons();
// Read-only diagnostic state for checking the real game in a local browser.
window.nailRoom = {game,getState:()=>({...game.getState(),active,shape,length,comparisons:[...comparisons],collected:[...collected],hasEntered})};
