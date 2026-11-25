// 共用核心：寶可夢角色卡的規則、隨機配點、角色卡畫面、篩選面板、匯入匯出（pokepast.es 格式）。
// 規則站的隨機產生器（site/assets/generator.js）與對戰網站的隊伍編輯（battle/js/editor.js）共用這一份。
// 對戰網站的 battle/js/pkcore.js 是這個檔案的複製品，改這邊之後要複製過去（tools/sync_pkcore.bat）。
(function(root){
function make(G,opt){opt=opt||{};
var D=G.dex,MV=G.moves,AB=G.abilities,NA=G.natures,CH=G.chart,TC=G.typeColor,INK=G.typeInk,RZ=G.rankZh,SZ=G.statZh,GZ=G.genZh;
var IMG=opt.img||'',RULES=opt.rules||'',DATA=opt.data||'',BLANK=opt.blank?' target="_blank" rel="noopener"':'';
var SOC=['強壯','帥氣','美麗','聰明','可愛'];
var SKG=[['戰鬥類',['鬥毆','導引','對抗','閃避']],['生存類',['警覺','運動','自然','隱匿']],['社交類',['魅惑','禮儀','威嚇','表演']]];
var SK=[];SKG.forEach(function(g){SK=SK.concat(g[1])});
var SI={};SK.forEach(function(n,i){SI[n]=i});
// 階級表：能力值、社交、技能點數、技能上限、目標上限（系統說明・階級）
var RANK={1:[0,0,5,1,1],2:[2,2,10,2,2],3:[4,4,14,3,3],4:[6,6,17,4,4],5:[8,8,19,5,5],6:[10,10,20,5,6],7:[10,10,22,5,8],8:[14,14,25,5,10]};
var STYW={phys:[5,3,2,.3,1],spec:[.3,3,2,5,2],tank:[1,1,5,1,5],sup:[.5,2,2,1,5]};
var SOC_CAP=5,FREE_MAX=12;
function $(i){return document.getElementById(i)}
function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function rnd(a){return a[Math.floor(Math.random()*a.length)]}
function pad(n){return n?'#'+String(n).padStart(3,'0'):''}
function chip(t){return '<span class="tag" style="background:'+(TC[t]||'#888')+';color:'+(INK[t]||'#fff')+'">'+t+'</span>'}
function pickW(c,w){var t=0,i;for(i=0;i<c.length;i++)t+=w[i];var r=Math.random()*t;for(i=0;i<c.length;i++){r-=w[i];if(r<0)return c[i]}return c[c.length-1]}
function norm(t){return String(t||'').normalize('NFKC').toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9一-鿿]/g,'')}

// ---------- 規則 ----------
function isFull(x){return x.st.every(function(a){return a[0]>=a[1]})}// 圖鑑能力值全滿：視為傳說或幻之，沒有能力值上限
function capOf(x,k,rank){return isFull(x)?Infinity:x.st[k][1]+(rank===8?2:0)}
function bonus(s){return s.rank===7?3:0}// 大師級：HP、意志、先攻、防禦與特防 +3
function dice(s){return s.rank===7?2:0}// 大師級：涉及技能的擲骰 +2 顆骰
function will(s){return s.st[4]+3+bonus(s)}
function hp(s,x){return (x.hp||0)+s.st[2]+bonus(s)}
function slots(s){return s.st[4]+3}
function spent(s,g,x){
 if(g==='st')return s.st.reduce(function(n,v,k){return n+v-x.st[k][0]},0);
 if(g==='so')return s.so.reduce(function(n,v){return n+v-1},0);
 return s.sk.reduce(function(n,v){return n+v},0)}
function budget(s,g){return RANK[s.rank][g==='st'?0:g==='so'?1:2]}
function maxOf(s,g,k,x){if(s.free)return FREE_MAX;return g==='st'?capOf(x,k,s.rank):g==='so'?SOC_CAP:RANK[s.rank][3]}
function minOf(s,g,k,x){if(s.free)return 0;return g==='st'?x.st[k][0]:g==='so'?1:0}
function alloc(v,cap,w,pts){v=v.slice();
 while(pts>0){var c=[],cw=[];v.forEach(function(n,i){if(n<cap[i]&&w[i]>0){c.push(i);cw.push(w[i])}});if(!c.length)break;v[pickW(c,cw)]++;pts--}
 return v}

// ---------- 招式 ----------
function parts(a){var o={st:[],sk:[]},ok=true;String(a||'').split('+').forEach(function(sd){sd.split('/').forEach(function(t){t=t.trim();
  if(!t)return;if(SI[t]!=null)o.sk.push(t);else if(SZ.indexOf(t)>-1||SOC.indexOf(t)>-1||t==='意志')o.st.push(t);else ok=false})});return ok&&(o.st.length||o.sk.length)?o:null}
function statVal(s,t){var i=SZ.indexOf(t);if(i>-1)return s.st[i];i=SOC.indexOf(t);if(i>-1)return s.so[i];return t==='意志'?will(s):0}
function maxBy(a,f){return a.reduce(function(m,t){return Math.max(m,f(t))},0)}
function hitPool(s,m){var p=parts(m.a);if(!p)return null;
 return maxBy(p.st,function(t){return statVal(s,t)})+maxBy(p.sk,function(t){return s.sk[SI[t]]})+(p.sk.length?dice(s):0)}
function dmgPool(s,m,x){var r=String(m.d||'').match(/^([^+]+?)\s*\+\s*(\d+)/);if(!r)return null;
 var ts=r[1].split('/').map(function(t){return t.trim()});if(!ts.every(function(t){return SZ.indexOf(t)>-1}))return null;
 return maxBy(ts,function(t){return statVal(s,t)})+(+r[2])+(x.ty.indexOf(m.t)>-1&&m.c!=='變化'?1:0)}
function hasAny(x,rank){return x.mv.some(function(m){return !m.k&&m.z==='任意招式'&&m.r<=rank})}
function pool(x,rank,mode){var seen={},out=[];
 function add(k){if(k&&MV[k]&&!seen[k]){seen[k]=1;out.push(k)}}
 if(mode==='all')Object.keys(MV).forEach(add);
 else{x.mv.forEach(function(m){if(mode==='dex'||m.r<=rank)add(m.k)});
  if(hasAny(x,mode==='dex'?8:rank))Object.keys(MV).forEach(function(k){if(MV[k].t!=='無')add(k)})}
 return out}
function repRank(x,k){for(var i=0;i<x.mv.length;i++)if(x.mv[i].k===k)return x.mv[i].r;return 0}
function mvWeight(k,x,st,style,rank){if(style==='random')return 1;
 var m=MV[k],atk=m.c!=='變化',w=1,r=repRank(x,k)||1;
 if(atk){w*=1.6;if(x.ty.indexOf(m.t)>-1)w*=2.2;w*=(m.c==='物理')===(st[0]>=st[3])?1.6:.6}
 if(style==='phys')w*=m.c==='物理'?2.5:m.c==='特殊'?.2:1;
 if(style==='spec')w*=m.c==='特殊'?2.5:m.c==='物理'?.2:1;
 if(style==='tank'&&!atk)w*=2.2;
 if(style==='sup')w*=atk?.5:3.5;
 return w*(1+r*.25)}
function pickMoves(x,s,n,keep){var taken=(keep||[]).filter(Boolean),c=pool(x,s.rank,'rank').filter(function(k){return taken.indexOf(k)<0}),out=taken.slice();
 while(out.length<n&&c.length){var k=pickW(c,c.map(function(y){return mvWeight(y,x,s.st,s.style,s.rank)}));out.push(k);c.splice(c.indexOf(k),1)}
 // 除了完全隨機與輔助，至少帶一招會造成傷害的招式
 if(s.style!=='random'&&s.style!=='sup'&&!(keep&&keep.length)&&out.length&&!out.some(function(k){return MV[k].c!=='變化'})){
  var a=c.filter(function(k){return MV[k].c!=='變化'});if(a.length)out[out.length-1]=rnd(a)}
 return out}

// ---------- 產生 ----------
function rollStats(x,s){var w;
 if(s.style==='random')w=[1,1,1,1,1];else if(s.style==='species')w=x.st.map(function(a){return a[1]*a[1]});else w=STYW[s.style];
 return alloc(x.st.map(function(a){return a[0]}),x.st.map(function(a,k){return capOf(x,k,s.rank)}),w,RANK[s.rank][0])}
function rollSocial(s){return alloc([1,1,1,1,1],[5,5,5,5,5],[1,1,1,1,1],RANK[s.rank][1])}
function rollSkills(s){var w=SK.map(function(){return 1});
 if(s.style!=='random'){s.mv.slice(0,slots(s)).forEach(function(k){var p=parts(MV[k]&&MV[k].a);if(p&&p.sk.length){p.sk.forEach(function(t){w[SI[t]]+=4/p.sk.length})}});
  w[SI['閃避']]+=2;w[SI['對抗']]+=2;w[SI['警覺']]+=1}
 return alloc(SK.map(function(){return 0}),SK.map(function(){return RANK[s.rank][3]}),w,RANK[s.rank][2])}
function abName(a){return (a.n||a).replace(/ \(Hidden\)/,'')}
function roll(x,rank,style){
 var s={i:x.i,rank:rank,style:style||'species',nick:'',item:'',note:'',hap:2,loy:2,free:false,mode:'rank'};
 s.st=rollStats(x,s);s.so=rollSocial(s);s.mv=pickMoves(x,s,slots(s));s.sk=rollSkills(s);
 s.ab=abName(rnd(x.ab));s.na=rnd(NA).n;return s}
function valid(s){return s&&D[s.i]&&RANK[s.rank]&&Array.isArray(s.st)&&s.st.length===5&&Array.isArray(s.so)&&s.so.length===5&&Array.isArray(s.sk)&&s.sk.length===12&&Array.isArray(s.mv)}

// ---------- 角色卡畫面 ----------
function pips(base,val,cap){var h='',b=Math.min(base,val),n=isFinite(cap)?Math.max(cap,val):val;
 for(var i=0;i<n;i++)h+='<i class="'+(i<b?'b':i<val?'a':'')+'"></i>';return '<span class="pips" aria-hidden="true">'+h+'</span>'}
function stepBtn(g,k,d,on){return '<button type="button" class="gb" data-a="step" data-g="'+g+'" data-k="'+k+'" data-d="'+d+'" data-fid="'+g+k+d+'"'+(on?'':' disabled')+' aria-label="'+(d>0?'增加':'減少')+'">'+(d>0?'+':'−')+'</button>'}
function row(s,g,k,name,base,val,cap,x,suffix){
 var rem=budget(s,g)-spent(s,g,x),over=!s.free&&val>cap;
 var inc=s.free?val<FREE_MAX:(val<cap&&rem>0),dec=val>minOf(s,g,k,x);
 return '<div class="gr'+(over?' over':'')+'"><span class="sd-n">'+name+'</span>'+pips(base,val,cap)+'<span class="sd-v">'+val+(suffix||'')+'</span>'+stepBtn(g,k,-1,dec)+stepBtn(g,k,1,inc)+'</div>'}
function remark(s,g,x){var r=budget(s,g)-spent(s,g,x);
 if(s.free)return '<small>已用 '+spent(s,g,x)+' 點（階級 '+budget(s,g)+' 點）</small>';
 return r<0?'<small class="warn">超出 '+(-r)+' 點</small>':'<small'+(r>0?' class="left"':'')+'>剩餘 '+r+' ／ 共 '+budget(s,g)+' 點</small>'}
function rrBtn(w,t){return '<button type="button" class="clear rr" data-a="rr" data-w="'+w+'" data-fid="rr'+w+'">'+(t||'重新隨機')+'</button>'}
function fld(l,h){return '<label class="gfld"><span>'+l+'</span>'+h+'</label>'}
function opt_(v,t,sel){return '<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(t)+'</option>'}
function counter(f,val,lab){return '<div class="gfld"><span>'+lab+'</span><div class="gcnt2"><button type="button" class="gb" data-a="cnt" data-f="'+f+'" data-d="-1" data-fid="'+f+'-1"'+(val<=0?' disabled':'')+' aria-label="減少">−</button><b>'+val+'</b><button type="button" class="gb" data-a="cnt" data-f="'+f+'" data-d="1" data-fid="'+f+'1"'+(val>=5?' disabled':'')+' aria-label="增加">+</button></div></div>'}
function matchup(x){var w=[],r=[],im=[];Object.keys(CH).forEach(function(t){var n=0,imm=false;x.ty.forEach(function(d){var c=CH[d];if(!c)return;if(c.i.indexOf(t)>-1)imm=true;else if(c.w.indexOf(t)>-1)n++;else if(c.r.indexOf(t)>-1)n--});
  if(imm)im.push(t);else if(n>0)w.push([t,n]);else if(n<0)r.push([t,n])});return {w:w,r:r,i:im}}
function mxChips(a){return a.map(function(t){var n=t[0]?t:[t,1],l=Math.abs(n[1]);return '<span class="gmx">'+chip(n[0])+(l>1?'<b>×'+l+'</b>':'')+'</span>'}).join('')}
function moveOptions(s,x,idx){var own=s.mv[idx]||'',others=s.mv.slice(0,slots(s)).filter(function(k,i){return i!==idx&&k}),c=pool(x,s.rank,s.mode).filter(function(k){return others.indexOf(k)<0});
 var h=opt_('','（未選擇）',!own);
 if(own&&c.indexOf(own)<0)h+=opt_(own,(MV[own]?MV[own].z||own:own)+'（超出階級）',true);
 var gs={},order=[];
 c.forEach(function(k){var r=repRank(x,k),g=s.mode==='all'||(!r)?MV[k].t+'屬性':(RZ[r]||'未標示階級');if(!gs[g]){gs[g]=[];order.push(g)}gs[g].push(k)});
 order.forEach(function(g){h+='<optgroup label="'+esc(g)+'">'+gs[g].map(function(k){return opt_(k,(MV[k].z||k),k===own)}).join('')+'</optgroup>'});
 return h}
function moveRow(s,x,i){var k=s.mv[i]||'',m=MV[k],h='';
 var late=m&&s.mode==='rank'&&pool(x,s.rank,'rank').indexOf(k)<0;
 h+='<div class="gm'+(late?' over':'')+'"><div class="gm1"><span class="gmn">'+(i+1)+'</span><select aria-label="第 '+(i+1)+' 招" data-m="'+i+'" data-fid="m'+i+'">'+moveOptions(s,x,i)+'</select><button type="button" class="gb" data-a="rm" data-m="'+i+'" data-fid="rm'+i+'" title="只重新抽這一招" aria-label="重新抽這一招">↻</button></div>';
 if(m){var hp_=hitPool(s,m),dp=dmgPool(s,m,x),st=x.ty.indexOf(m.t)>-1&&m.c!=='變化';
  h+='<div class="gm2">'+chip(m.t)+'<span>'+esc(m.c)+'</span>'+(m.p&&m.p!=='—'?'<span>威力 '+esc(m.p)+'</span>':'')+
   '<span>命中 '+esc(m.a||'—')+(hp_!=null?' = <b>'+hp_+'</b> 骰':'')+'</span>'+
   (m.d&&m.d!=='-'?'<span>傷害 '+esc(m.d)+(dp!=null?' = <b>'+dp+'</b> 骰'+(st?'（含屬性一致）':''):'')+'</span>':'')+
   '<a href="'+DATA+'moves.html?n='+encodeURIComponent(k)+'"'+BLANK+'>招式資料</a>'+(late?'<em class="warn">超出目前階級</em>':'')+'</div>'+
   (m.e?'<p class="ge">'+esc(m.e)+'</p>':'')}
 return h+'</div>'}
function sheetHTML(s,o){var x=D[s.i],c=TC[x.ty[0]]||'#888',c2=TC[x.ty[1]]||c;
 var nature=NA.filter(function(n){return n.n===s.na})[0],ab=AB[s.ab];
 var dex=s.st[1],mx=matchup(x),n=slots(s),rkv=RANK[s.rank],bo=bonus(s),dc=dice(s);
 var abs=x.ab.map(abName),rest=Object.keys(AB).filter(function(k){return abs.indexOf(k)<0}).sort(function(a,b){return (AB[a].z||a).localeCompare(AB[b].z||b,'zh-Hant')});
 var abOpts='<optgroup label="這隻寶可夢的特性">'+abs.map(function(k){return opt_(k,(AB[k]&&AB[k].z)||k,k===s.ab)}).join('')+'</optgroup><optgroup label="其他特性（隱藏特性，需與說書人討論）">'+rest.map(function(k){return opt_(k,AB[k].z||k,k===s.ab)}).join('')+'</optgroup>';
 var fact=function(k,v){return '<div class="fact"><span>'+k+'</span><b>'+v+'</b></div>'};
 var clashP=Math.max(s.st[0],s.st[3])+s.sk[SI['對抗']]+dc;
 var tools=(o.tools||[]).map(function(t){return '<button type="button" class="clear" data-a="'+t[0]+'">'+t[1]+'</button>'}).join('');
 var h='<div class="gtool">'+tools+'<label class="gfree"><input type="checkbox" data-f="free"'+(s.free?' checked':'')+'> 不受規則限制</label><span class="gmsg" role="status"></span></div>';
 h+='<div class="dhero" style="--tc:'+c+';--tc2:'+c2+'"><div class="dimg">'+(x.img?'<img alt="'+esc(x.z||x.n)+'" src="'+IMG+x.img+'.webp" onerror="this.style.display=\'none\'">':'')+'</div><div class="dtitle"><small>'+pad(x.num)+(x.g?'・'+GZ[x.g].replace(/（.*/,''):'')+'</small><h2>'+esc(s.nick||x.z||x.n)+'</h2><small>'+(s.nick?esc(x.z||x.n)+'・':'')+esc(x.n)+'</small><div class="tags">'+x.ty.map(chip).join('')+'</div></div></div>';
 h+='<div class="gcols"><section class="dsec"><h3>基本資料</h3><div class="gform">'+
  fld('暱稱','<input data-f="nick" value="'+esc(s.nick)+'" placeholder="（沒有）" data-fid="nick">')+
  fld('階級','<select data-f="rank" data-fid="rank">'+Object.keys(RZ).map(function(r){return opt_(r,RZ[r],+r===s.rank)}).join('')+'</select>')+
  fld('性格','<span class="grr"><select data-f="na" data-fid="na">'+NA.map(function(q){return opt_(q.n,q.n,q.n===s.na)}).join('')+'</select><button type="button" class="gb" data-a="rr" data-w="na" data-fid="rrna" title="重新抽性格" aria-label="重新抽性格">↻</button></span>')+
  fld('特性','<span class="grr"><select data-f="ab" data-fid="ab">'+abOpts+'</select><button type="button" class="gb" data-a="rr" data-w="ab" data-fid="rrab" title="重新抽特性" aria-label="重新抽特性">↻</button></span>')+
  fld('攜帶道具','<input data-f="item" value="'+esc(s.item)+'" placeholder="（沒有）" data-fid="item">')+
  '<div class="gpair">'+counter('hap',s.hap,'幸福度')+counter('loy',s.loy,'忠誠度')+'</div></div>'+
  (nature?'<p class="ge"><b>'+esc(nature.n)+'</b>：'+esc(nature.k)+'。<a href="'+RULES+'create-20.html"'+BLANK+'>性格說明</a></p>':'')+
  (ab?'<p class="ge"><b>'+esc(ab.z||s.ab)+'</b>：'+esc(ab.e)+'</p>':'')+
  '<div class="facts gsmall">'+fact('建議階級',RZ[x.rk]||'—')+fact('進化階段',x.stage||'—')+fact('身高／體重',(x.h||'—')+' m／'+(x.w||'—')+' kg')+'</div></section>';
 h+='<section class="dsec"><h3>戰鬥數值'+(s.rank===7?'<small>含大師級 +3 與涉及技能的 +2 骰</small>':'')+'</h3><div class="facts gfacts">'+fact('HP',hp(s,x))+fact('意志',will(s))+fact('先攻值',dex+s.sk[SI['警覺']]+bo)+fact('防禦',s.st[2]+bo)+fact('特防',s.st[4]+bo)+fact('閃避骰池',dex+s.sk[SI['閃避']]+dc)+fact('對抗骰池',clashP)+fact('目標上限',rkv[4])+'</div>'+
  '<div class="gmxs">'+(mx.w.length?'<div><span>弱點</span>'+mxChips(mx.w)+'</div>':'')+(mx.r.length?'<div><span>抗性</span>'+mxChips(mx.r)+'</div>':'')+(mx.i.length?'<div><span>免疫</span>'+mxChips(mx.i)+'</div>':'')+'</div></section></div>';
 var full=isFull(x);
 h+='<div class="gcols"><section class="dsec"><h3>能力值'+remark(s,'st',x)+rrBtn('st')+'</h3>'+
  x.st.map(function(a,k){var cap=capOf(x,k,s.rank);return row(s,'st',k,SZ[k],a[0],s.st[k],cap,x,isFinite(cap)?' / '+cap:'')}).join('')+
  (full?'<p class="ge">圖鑑能力值全滿的寶可夢視為傳說或幻之寶可夢，沒有能力值上限，點數也可以不用完（<a href="'+RULES+'spirit-4.html"'+BLANK+'>傳說戰鬥</a>）。</p>':'')+
  (s.rank===8&&!full?'<p class="ge">冠軍級的能力值最高可超過上限 2 點，上限已經加上。</p>':'')+'</section>';
 h+='<section class="dsec"><h3>社交能力值'+remark(s,'so',x)+rrBtn('so')+'</h3>'+SOC.map(function(t,k){return row(s,'so',k,t,1,s.so[k],SOC_CAP,x,' / '+SOC_CAP)}).join('')+'</section></div>';
 h+='<section class="dsec"><h3>技能<small>上限 '+rkv[3]+'</small>'+remark(s,'sk',x)+rrBtn('sk')+'</h3><div class="gskills">'+SKG.map(function(g){return '<div><h5>'+g[0]+'</h5>'+g[1].map(function(t){var k=SI[t];return row(s,'sk',k,t,0,s.sk[k],s.free?Math.max(5,s.sk[k]):5,x)}).join('')+'</div>'}).join('')+'</div></section>';
 var avail=pool(x,s.rank,s.mode).length;
 h+='<section class="dsec"><h3>招式<small>可學 '+n+' 招（洞察 + 3）</small><select class="gmode" data-f="mode" data-fid="mode" aria-label="招式清單範圍">'+opt_('rank','只列這個階級能學的',s.mode==='rank')+opt_('dex','列出完整招式庫',s.mode==='dex')+opt_('all','列出全部招式',s.mode==='all')+'</select>'+rrBtn('mv')+'</h3>';
 for(var i=0;i<n;i++)h+=moveRow(s,x,i);
 if(avail<n)h+='<p class="ge">這個範圍只有 '+avail+' 招可學，其餘欄位先留空。</p>';
 h+='</section><section class="dsec"><h3>備註</h3><textarea class="gnote" data-f="note" rows="2" data-fid="note" placeholder="訓練點數、戰鬥羈絆、飾品等，都可以記在這裡">'+esc(s.note)+'</textarea></section>';
 return h}

// 把角色卡畫進 box，並處理它裡面的所有操作。
// o.get()：目前的角色卡；o.change(s)：任何修改之後；o.action(a,s,btn)：核心不認得的按鈕（data-a）；o.tools：[[動作,文字]…]
function view(box,o){
 function cur(){return o.get()}
 function render(){var s=cur();if(!s){box.innerHTML='';return}
  var ae=document.activeElement,fid=ae&&box.contains(ae)&&ae.dataset?ae.dataset.fid:null;
  box.innerHTML=sheetHTML(s,o);
  if(fid){var el=box.querySelector('[data-fid="'+fid+'"]');if(el&&!el.disabled)el.focus({preventScroll:true})}
  if(o.change)o.change(s,'render')}
 function msg(t){var m=box.querySelector('.gmsg');if(m){m.textContent=t;setTimeout(function(){if(m)m.textContent=''},2600)}}
 box.addEventListener('click',function(e){var b=e.target.closest('[data-a]');var s=cur();if(!b||b.disabled||!s)return;var x=D[s.i],a=b.dataset.a;
  if(a==='step'){var arr=s[b.dataset.g],k=+b.dataset.k,d=+b.dataset.d;arr[k]+=d;render()}
  else if(a==='cnt'){s[b.dataset.f]=Math.max(0,Math.min(5,s[b.dataset.f]+(+b.dataset.d)));render()}
  else if(a==='rr'){var w=b.dataset.w;
   if(w==='st'){s.st=rollStats(x,s);s.mv=pickMoves(x,s,slots(s),s.mv.filter(Boolean).slice(0,slots(s)))}
   else if(w==='so')s.so=rollSocial(s);
   else if(w==='sk')s.sk=rollSkills(s);
   else if(w==='na')s.na=rnd(NA).n;
   else if(w==='ab')s.ab=abName(rnd(x.ab));
   else if(w==='mv')s.mv=pickMoves(x,s,slots(s));
   render()}
  else if(a==='rm'){var i=+b.dataset.m,others=s.mv.slice(0,slots(s)).filter(function(k,j){return j!==i&&k}),c=pool(x,s.rank,s.mode).filter(function(k){return others.indexOf(k)<0&&k!==s.mv[i]});
   if(c.length){s.mv[i]=pickW(c,c.map(function(y){return mvWeight(y,x,s.st,s.style,s.rank)}));render()}else msg('沒有其他招式可抽')}
  else if(o.action)o.action(a,s,b)});
 box.addEventListener('input',function(e){var t=e.target,f=t.dataset.f,s=cur();if(!s||!f)return;
  if(f==='nick'||f==='item'||f==='note'){s[f]=t.value;if(f==='nick'){var h=box.querySelector('.dtitle h2'),x=D[s.i];if(h)h.textContent=s.nick||x.z||x.n}if(o.change)o.change(s,'text')}});
 box.addEventListener('change',function(e){var t=e.target,f=t.dataset.f,s=cur();if(!s)return;
  if(t.dataset.m!=null){s.mv[+t.dataset.m]=t.value;render();return}
  if(!f)return;
  if(f==='rank'){s.rank=+t.value;render()}
  else if(f==='na'||f==='ab'||f==='mode'){s[f]=t.value;render()}
  else if(f==='free'){s.free=t.checked;render()}
  else if(f==='nick'){render()}});
 return {render:render,msg:msg}}

// ---------- 篩選面板 ----------
function panelHTML(go){return '<div class="genbox"><div class="filters" id="gf"><input id="gq" type="search" placeholder="搜尋名稱、編號、特性或招式…"><select id="gt" aria-label="屬性"></select><select id="gt2" aria-label="第二屬性"></select><select id="gg" aria-label="世代"></select><select id="gr" aria-label="建議階級"></select><select id="gs" aria-label="進化階段"></select><select id="gl" aria-label="類別"><option value="">全部類別</option><option value="noleg">排除傳說與幻之</option><option value="leg">只要傳說與幻之</option><option value="nomega">排除超級進化</option><option value="plain">排除傳說、幻之與超級進化</option></select></div>'+
 '<div class="gcount"><span class="count" id="gcnt"></span><span class="dacts"><button type="button" class="clear" id="greset" hidden>清除篩選</button><button type="button" class="clear" id="gfold" aria-controls="gf"></button></span></div></div>'+
 '<div class="genbox gmain"><label>寶可夢<select id="gsp"></select></label><label>階級<select id="grk"></select></label><label>配點傾向<select id="gsty"><option value="species">依物種專長</option><option value="random">完全隨機</option><option value="phys">物理攻擊</option><option value="spec">特殊攻擊</option><option value="tank">耐久防禦</option><option value="sup">輔助變化</option></select></label>'+(go||'')+'</div>'}
// 綁定篩選與選單（元素用 id：gq gt gt2 gg gr gs gl gsp grk gsty ggo gcnt greset gfold gf）
function panel(){
 var q=$('gq'),ft=$('gt'),ft2=$('gt2'),fg=$('gg'),fr=$('gr'),fs=$('gs'),fl=$('gl'),sp=$('gsp'),rk=$('grk'),sty=$('gsty'),L=D;
 function match(x){
  if(ft.value&&x.ty.indexOf(ft.value)<0)return false;
  if(ft2.value==='-'){if(x.ty.length!==1)return false}else if(ft2.value&&x.ty.indexOf(ft2.value)<0)return false;
  if(fg.value&&String(x.g)!==fg.value)return false;
  if(fr.value&&String(x.rk)!==fr.value)return false;
  if(fs.value&&x.stage!==fs.value)return false;
  var l=fl.value,me=x.stage==='超級進化';
  if((l==='noleg'&&x.leg)||(l==='leg'&&!x.leg)||(l==='nomega'&&me)||(l==='plain'&&(x.leg||me)))return false;
  var t=q.value.trim().toLowerCase();if(!t)return true;
  var hay=(x.n+' '+x.z+' #'+x.num+' '+pad(x.num)+' '+x.ty.join(' ')+' '+x.ab.map(function(a){return a.n+' '+a.z}).join(' ')+' '+x.mv.map(function(m){return m.n+' '+m.z}).join(' ')).toLowerCase();
  return t.split(/\s+/).every(function(w){return hay.indexOf(w)>-1})}
 function refilter(){var keep=sp.value;L=D.filter(match);
  $('gcnt').textContent='符合 '+L.length+' / '+D.length+' 筆';
  $('greset').hidden=!(q.value||ft.value||ft2.value||fg.value||fr.value||fs.value||fl.value);
  sp.innerHTML='<option value="">隨機（從符合的 '+L.length+' 筆中抽選）</option>'+L.map(function(x){return '<option value="'+x.i+'">'+pad(x.num)+' '+esc(x.z||x.n)+'</option>'}).join('');
  if(keep&&L.some(function(x){return String(x.i)===keep}))sp.value=keep;
  var go=$('ggo');if(go)go.disabled=!L.length}
 var timer;q.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(refilter,120)});
 [ft,ft2,fg,fr,fs,fl].forEach(function(el){el.addEventListener('input',refilter)});
 $('greset').addEventListener('click',function(){q.value=ft.value=ft2.value=fg.value=fr.value=fs.value=fl.value='';refilter();q.focus()});
 var fbox=$('gf'),fold=$('gfold');
 function setFold(on){fbox.classList.toggle('fold',on);fold.textContent=on?'展開篩選 ▾':'收合篩選 ▴';fold.setAttribute('aria-expanded',on?'false':'true')}
 try{setFold(localStorage.getItem('pk-genfold')==='1')}catch(e){setFold(false)}
 fold.addEventListener('click',function(){var on=!fbox.classList.contains('fold');setFold(on);try{localStorage.setItem('pk-genfold',on?'1':'0')}catch(e){}});
 var tops=Object.keys(TC).filter(function(t){return t!=='無'}).map(function(t){return '<option>'+t+'</option>'}).join('');
 ft.innerHTML='<option value="">屬性（不限）</option>'+tops;
 ft2.innerHTML='<option value="">第二屬性（不限）</option><option value="-">只有單一屬性</option>'+tops;
 fg.innerHTML='<option value="">全部世代</option>'+Object.keys(GZ).map(function(k){return '<option value="'+k+'">'+GZ[k]+'</option>'}).join('');
 fr.innerHTML='<option value="">全部建議階級</option>'+Object.keys(RZ).map(function(k){return '<option value="'+k+'">建議'+RZ[k]+'</option>'}).join('');
 fs.innerHTML='<option value="">全部進化階段</option><option>初階</option><option>二階</option><option>最終階</option><option>超級進化</option><option>未知</option>';
 rk.innerHTML='<option value="">依寶可夢的建議階級</option><option value="r">隨機階級</option>'+Object.keys(RZ).map(function(k){return '<option value="'+k+'">'+RZ[k]+'</option>'}).join('');
 refilter();
 return {refilter:refilter,list:function(){return L},
  // 依目前的篩選與選單產生一隻；沒有符合的寶可夢時回傳 null
  make:function(){var x=sp.value!==''?D[+sp.value]:rnd(L);if(!x)return null;
   var r=rk.value==='r'?1+Math.floor(Math.random()*8):rk.value?+rk.value:(x.rk||1);
   return roll(x,r,sty.value)},
  // 重新產生同一種寶可夢（保留暱稱與道具）
  remake:function(s){var x=D[s.i],n=roll(x,s.rank,sty.value);n.nick=s.nick;n.item=s.item;n.note=s.note;return n},
  style:function(){return sty.value}}}

// ---------- 分享連結 ----------
function encode(s){return btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(t){try{return JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g,'+').replace(/_/g,'/')))))}catch(e){return null}}

// ---------- 文字摘要 ----------
function asText(s){var x=D[s.i],o=[],bo=bonus(s),dc=dice(s),ab=AB[s.ab];
 o.push((s.nick?s.nick+'（'+(x.z||x.n)+'）':(x.z||x.n))+' '+pad(x.num)+'　'+x.ty.join('/'));
 o.push('階級：'+RZ[s.rank]+'　性格：'+s.na+'　特性：'+((ab&&ab.z)||s.ab)+(s.item?'　道具：'+s.item:''));
 o.push('HP '+hp(s,x)+'　意志 '+will(s)+'　先攻值 '+(s.st[1]+s.sk[SI['警覺']]+bo)+'　防禦 '+(s.st[2]+bo)+'　特防 '+(s.st[4]+bo)+'　閃避 '+(s.st[1]+s.sk[SI['閃避']]+dc)+'　對抗 '+(Math.max(s.st[0],s.st[3])+s.sk[SI['對抗']]+dc));
 o.push('能力值：'+SZ.map(function(t,k){return t+' '+s.st[k]}).join('、'));
 o.push('社交：'+SOC.map(function(t,k){return t+' '+s.so[k]}).join('、'));
 o.push('技能：'+(SK.filter(function(t){return s.sk[SI[t]]>0}).map(function(t){return t+' '+s.sk[SI[t]]}).join('、')||'無'));
 o.push('幸福度 '+s.hap+'　忠誠度 '+s.loy);
 o.push('招式：');
 s.mv.slice(0,slots(s)).forEach(function(k){var m=MV[k];if(!m)return;var a=hitPool(s,m),d=dmgPool(s,m,x);
  o.push('・'+(m.z||k)+'（'+m.t+'／'+m.c+'）命中 '+(a!=null?a+' 骰':m.a)+(m.d&&m.d!=='-'?'，傷害 '+(d!=null?d+' 骰':m.d):''))});
 if(s.note)o.push('備註：'+s.note);
 return o.join('\n')}

// ---------- pokepast.es（Pokémon Showdown 文字格式）匯出入 ----------
// 第一行、Ability、屬性顏色等 pokepast.es 認得的部分用英文；Pokerole 專有的資料放在它不認得的行（它會原樣顯示），匯入時再讀回來。
var NAT_EN=['Adamant','Bashful','Bold','Brave','Calm','Careful','Docile','Gentle','Hardy','Hasty','Impish','Jolly','Lax','Lonely','Mild','Modest','Naive','Naughty','Quiet','Quirky','Rash','Relaxed','Sassy','Serious','Timid'];
var ATTR_EN=['Strength','Dexterity','Vitality','Special','Insight'];
var SOC_EN=['Tough','Cool','Beauty','Clever','Cute'];
var SK_EN=['Brawl','Channel','Clash','Evasion','Alert','Athletic','Nature','Stealth','Allure','Etiquette','Intimidate','Perform'];
function sdName(n){var m;n=String(n).replace(/’/g,"'");
 if((m=n.match(/^Mega-(.+?)(?: ([XY]))?$/)))return m[1]+'-Mega'+(m[2]?'-'+m[2]:'');
 if((m=n.match(/^Primal (.+)$/)))return m[1]+'-Primal';
 if((m=n.match(/^Origin (.+)$/)))return m[1]+'-Origin';
 if((m=n.match(/^(.+?)\s*♀$/)))return m[1]+'-F';
 if((m=n.match(/^(.+?)\s*♂$/)))return m[1]+'-M';
 if((m=n.match(/^(.+?) \((.+)\)$/)))return m[1]+'-'+m[2].replace(/,\s*/g,'-').replace(/ /g,'-');
 return n.replace(/\//g,'-')}
var byName=null,dupN=null;
// 英文名重複的（尼多蘭／尼多朗在原書都寫 Nidoran）：用中文名分出性別
function spec(x){if(!dupN){dupN={};D.forEach(function(y){dupN[y.n]=(dupN[y.n]||0)+1})}
 var n=sdName(x.n);return dupN[x.n]>1?n+(/蘭/.test(x.z)?'-F':'-M'):n}
function nameIndex(){if(byName)return byName;byName={};
 D.forEach(function(x){[norm(spec(x)),norm(x.n)].forEach(function(k){if(k&&!(k in byName))byName[k]=x.i})});
 D.forEach(function(x){var k=norm(x.z);if(k&&!(k in byName))byName[k]=x.i});
 return byName}
function findDex(t){var i=nameIndex()[norm(t)];return i==null?-1:i}
var byMove=null,byAb=null;
function findMove(t){if(!byMove){byMove={};Object.keys(MV).forEach(function(k){byMove[norm(k)]=k;if(MV[k].z)byMove[norm(MV[k].z)]=k})}return byMove[norm(t)]||null}
function findAb(t){if(!byAb){byAb={};Object.keys(AB).forEach(function(k){byAb[norm(k)]=k;if(AB[k].z)byAb[norm(AB[k].z)]=k})}return byAb[norm(t)]||null}
function itemOk(t){return /^[A-Z][a-z0-9:']*(?:[- ][A-Z][a-z0-9:']*)*$/.test(t)}
function pairs(names,vals){return names.map(function(n,i){return n+' '+vals[i]}).join(' / ')}
function toPaste(s){var x=D[s.i],o=[],ab=AB[s.ab];
 // 第一行的英文種名是給 pokepast.es 找圖用的；其餘都用中文。暱稱沒填就放中文名，頁面上才看得到中文。
 var nk=(s.nick||x.z||'').replace(/[()\r\n]/g,' ').trim(),sp=spec(x),head=nk?nk+' ('+sp+')':sp;
 if(s.item&&itemOk(s.item))head+=' @ '+s.item;
 o.push(head);
 if(s.item&&!itemOk(s.item))o.push('道具: '+s.item.replace(/\r?\n/g,' '));
 o.push('特性: '+((ab&&ab.z)||s.ab));
 o.push('階級: '+s.rank+' ('+RZ[s.rank]+')');
 o.push('性格: '+s.na);
 o.push('幸福度: '+s.hap);
 o.push('忠誠度: '+s.loy);
 o.push('能力值: '+pairs(SZ,s.st));
 o.push('社交: '+pairs(SOC,s.so));
 var sk=[];SK.forEach(function(n,i){if(s.sk[i]>0)sk.push(n+' '+s.sk[i])});
 o.push('技能: '+(sk.join(' / ')||'無'));
 if(s.free)o.push('不受規則限制: 是');
 if(s.note)o.push('備註: '+s.note.replace(/\r?\n/g,' ⏎ '));
 s.mv.slice(0,slots(s)).forEach(function(k){if(k&&MV[k])o.push('- '+(MV[k].z||k))});
 return o.join('\n')}
function toPasteTeam(list){return list.map(toPaste).join('\n\n')}
function readPairs(txt,names,zh,vals){var warn=0;String(txt).split('/').forEach(function(p){var m=p.trim().match(/^(\S+)\s+(-?\d+)$/);if(!m)return;
  var k=names.findIndex(function(n){return n.toLowerCase()===m[1].toLowerCase()});if(k<0)k=zh.indexOf(m[1]);if(k>-1)vals[k]=Math.max(0,+m[2]);else warn++});return warn}
// 解析一個寶可夢區塊；找不到寶可夢時回傳 {err}
var KEYS={'特性':'ability','階級':'rank','道具':'item','held item':'item','幸福度':'happiness','忠誠度':'loyalty','能力值':'attributes','社交':'social','技能':'skills','備註':'notes','note':'notes','不受規則限制':'unrestricted','性格':'nature'};
function parseSet(block,warns){var L=block.split('\n').map(function(l){return l.replace(/\s+$/,'')}).filter(function(l){return l.trim()});if(!L.length)return null;
 var head=L[0].trim(),item='',m=head.match(/^(.*?)\s+@\s+(.+)$/);
 if(m){head=m[1].trim();item=m[2].trim()}
 head=head.replace(/\s+\((?:M|F)\)\s*$/,'');
 var nick='',idx=-1;
 m=head.match(/^(.*)\(([^()]+)\)\s*$/);
 if(m){idx=findDex(m[2].trim());if(idx>-1)nick=m[1].trim()}
 if(idx>-1&&nick===D[idx].z)nick='';
 if(idx<0)idx=findDex(head);
 if(idx<0)return {err:'找不到寶可夢「'+head+'」'};
 var x=D[idx],rank=null,kv={},moves=[],nature=null,bad=[];
 L.slice(1).forEach(function(l){var t=l.trim(),a;
  if((a=t.match(/^[-–]\s*(.+)$/))){moves.push(a[1].replace(/\s*\[[^\]]*\]\s*$/,'').split(' / ')[0].trim());return}
  if((a=t.match(/^(\S+) Nature$/i))){nature=a[1];return}
  if((a=t.match(/^([^:：\s][^:：]*?)\s*[:：]\s*(.*)$/))){var key=a[1].trim().toLowerCase();kv[KEYS[key]||key]=a[2].trim()}});
 if(kv.nature)nature=kv.nature;
 if(kv.rank){a=kv.rank.match(/^(\d)/);if(a&&RANK[+a[1]])rank=+a[1];else{var rr=Object.keys(RZ).filter(function(r){return kv.rank.indexOf(RZ[r])>-1})[0];if(rr)rank=+rr}}
 if(!rank)rank=x.rk||1;
 var s=roll(x,rank,'species');
 s.nick=nick;
 if(!item&&kv.item)item=kv.item;
 s.item=item;
 if(kv.ability){var ab=findAb(kv.ability.replace(/ \(Hidden\)/,''));if(ab)s.ab=ab;else bad.push('特性「'+kv.ability+'」')}
 if(nature){var ni=NAT_EN.findIndex(function(n){return n.toLowerCase()===nature.toLowerCase()});if(ni>-1&&NA[ni])s.na=NA[ni].n;else if(NA.some(function(q){return q.n===nature}))s.na=nature}
 if(kv.happiness!=null&&/^\d+$/.test(kv.happiness))s.hap=Math.min(5,+kv.happiness);
 if(kv.loyalty!=null&&/^\d+$/.test(kv.loyalty))s.loy=Math.min(5,+kv.loyalty);
 var hasStats=!!(kv.attributes&&kv.social&&kv.skills);
 if(kv.attributes){var v=x.st.map(function(q){return q[0]});readPairs(kv.attributes,ATTR_EN,SZ,v);s.st=v}
 if(kv.social){var v2=[1,1,1,1,1];readPairs(kv.social,SOC_EN,SOC,v2);s.so=v2}
 if(kv.skills){var v3=SK.map(function(){return 0});readPairs(kv.skills,SK_EN,SK,v3);s.sk=v3}
 if(kv.unrestricted&&/^(y|是)/i.test(kv.unrestricted))s.free=true;
 if(kv.notes)s.note=kv.notes.replace(/ ⏎ /g,'\n');
 if(moves.length){var n=slots(s),got=[];
  moves.forEach(function(t){var k=findMove(t);if(!k)bad.push('招式「'+t+'」');else if(got.indexOf(k)<0)got.push(k)});
  if(got.length>n){bad.push('超過 '+n+' 招的部分');got=got.slice(0,n)}
  if(got.length){s.mv=got;
   if(!hasStats&&!kv.attributes){s.mv=pickMoves(x,s,n,got)}}}
 if(!kv.attributes&&!kv.social&&!kv.skills&&moves.length)s.sk=rollSkills(s);
 if(bad.length)warns.push((s.nick||x.z||x.n)+'：'+bad.join('、')+'不認得，已略過');
 s.mode='rank';s.free=!!s.free;
 return s}
// 解析整段文字：回傳 {title, sets:[角色卡], warns:[說明], errs:[說明]}
function fromPaste(text){var t=String(text||'').replace(/\r\n?/g,'\n').trim(),title='',warns=[],errs=[],sets=[];
 var blocks=t.split(/\n\s*\n/);
 blocks.forEach(function(b){b=b.trim();if(!b)return;
  var m=b.match(/^===\s*(.*?)\s*===$/);if(m){title=m[1].replace(/^\[[^\]]*\]\s*/,'').replace(/^.*\//,'');return}
  var s=parseSet(b,warns);if(!s)return;if(s.err)errs.push(s.err);else sets.push(s)});
 return {title:title,sets:sets,warns:warns,errs:errs}}
// 讀取任何來源：pokepast.es 網址、分享連結（#s=…）或文字
function importAny(text){text=String(text||'').trim();
 var m=text.match(/^https?:\/\/pokepast\.es\/([A-Za-z0-9]+)/i);
 if(m)return fetch('https://pokepast.es/'+m[1]+'/json').then(function(r){if(!r.ok)throw new Error('找不到這個 pokepast.es 頁面');return r.json()}).then(function(j){var r=fromPaste(j.paste);if(!r.title)r.title=j.title||'';return r},function(e){throw new Error(e.message&&e.message!=='Failed to fetch'?e.message:'無法連到 pokepast.es，請改貼文字內容')});
 m=text.match(/#s=([A-Za-z0-9_-]+)/);
 if(m){var s=decode(m[1]);return Promise.resolve(valid(s)?{title:'',sets:[s],warns:[],errs:[]}:{title:'',sets:[],warns:[],errs:['分享連結讀不出內容']})}
 return Promise.resolve(fromPaste(text))}
// 送到 pokepast.es 建立頁面（開新分頁；公開網址，知道連結的人都看得到）
function uploadPaste(text,title,author){var f=document.createElement('form');f.method='post';f.action='https://pokepast.es/create';f.target='_blank';f.style.display='none';
 function add(n,v){var e=document.createElement('textarea');e.name=n;e.value=v;f.appendChild(e)}
 add('paste',text.replace(/\r?\n/g,'\r\n'));add('title',title||'');add('author',author||'');add('notes','Pokerole 3.0 角色卡（可用 Pokerole 繁中規則站或對戰網站匯入）');
 document.body.appendChild(f);f.submit();f.remove()}

// ---------- 匯入／匯出視窗 ----------
// o：{title, text, hint, imports:[{label, fn(結果)}], uploadTitle, close}。fn 回傳字串＝顯示在視窗裡的訊息，回傳 true＝關閉視窗
function copyText(t,done){function fb(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();var r=false;try{r=document.execCommand('copy')}catch(e){}a.remove();done(r)}
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){done(true)},fb);else fb()}
function dialog(o){var back=document.createElement('div');back.className='pkio-back';
 back.innerHTML='<div class="pkio" role="dialog" aria-modal="true"><h3>'+esc(o.title)+'</h3><p class="ge">'+(o.hint||'')+'</p><textarea spellcheck="false" aria-label="文字內容"></textarea><div class="pkio-msg" role="status"></div><div class="pkio-btns"></div></div>';
 var ta=back.querySelector('textarea'),msg=back.querySelector('.pkio-msg'),bt=back.querySelector('.pkio-btns');ta.value=o.text||'';
 function say(t,bad){msg.textContent=t;msg.className='pkio-msg'+(bad?' bad':'')}
 function close(){back.remove();document.removeEventListener('keydown',key);if(o.close)o.close()}
 function key(e){if(e.key==='Escape')close()}
 function btn(t,cls,fn){var b=document.createElement('button');b.type='button';b.className=cls||'clear';b.textContent=t;b.addEventListener('click',fn);bt.appendChild(b);return b}
 (o.imports||[]).forEach(function(im){btn(im.label,'gbtn pkio-go',function(){say('讀取中…');importAny(ta.value).then(function(r){
   if(!r.sets.length){say(r.errs.length?r.errs.join('；'):'沒有讀到寶可夢，請確認貼上的內容。',true);return}
   var res=im.fn(r);if(res===true){close();return}
   var extra=r.warns.concat(r.errs);say((typeof res==='string'?res:'已匯入 '+r.sets.length+' 隻。')+(extra.length?'　注意：'+extra.join('；'):''))},function(e){say(e.message,true)})})});
 btn('複製',null,function(){copyText(ta.value,function(ok){say(ok?'已複製文字':'無法複製，請手動選取',!ok)})});
 btn('上傳到 pokepast.es',null,function(){if(!ta.value.trim())return;uploadPaste(ta.value,o.uploadTitle||'',o.author||'');say('已在新分頁開啟 pokepast.es。上傳後知道連結的人都看得到。')});
 btn('下載 .txt',null,function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ta.value],{type:'text/plain;charset=utf-8'}));a.download=(o.uploadTitle||'pokerole')+'.txt';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)});
 btn('關閉',null,close);
 back.addEventListener('click',function(e){if(e.target===back)close()});
 document.addEventListener('keydown',key);document.body.appendChild(back);ta.focus();ta.select();
 return {close:close,say:say}}

return {D:D,MV:MV,AB:AB,NA:NA,RZ:RZ,RANK:RANK,SK:SK,SI:SI,SOC:SOC,SZ:SZ,TC:TC,
 slots:slots,will:will,hp:hp,bonus:bonus,pool:pool,roll:roll,valid:valid,abName:abName,pickMoves:pickMoves,rollSkills:rollSkills,
 view:view,panel:panel,panelHTML:panelHTML,encode:encode,decode:decode,asText:asText,
 toPaste:toPaste,toPasteTeam:toPasteTeam,fromPaste:fromPaste,importAny:importAny,uploadPaste:uploadPaste,dialog:dialog,copyText:copyText,
 findDex:findDex,sdName:sdName,spec:spec,esc:esc,pad:pad,norm:norm,budget:budget,spent:spent}}
root.PKCORE={make:make};
})(window);
