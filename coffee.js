/* =====================================================================
   دفتر الإيجارات — قسم «ماكينات القهوة»
   ماكينات (مع صور وملحقات وصيانة)، إيجارات (دفعات + ضمان + تسليم/استلام)،
   زبائن بالانتظار، وتقارير «رجعت حقها؟».

   التخزين: نفس مجموعة people بأنواع خاصة، فما بتحتاج قاعدة أمان جديدة:
     cfMachine · cfRental · cfLead · cfImage (صورة مضغوطة)
   core.js بيتجاهل هالأنواع، فما بتظهر بالمستودعات ولا بصفحة الوالد.
   ===================================================================== */
(function(){
"use strict";

window.RLCoffee = function(api){
  var R=window.RL, esc=R.esc, fmtPlain=R.fmtPlain;
  var C={ showEnded:false };
  var REMIND_DAYS=3;   // التذكير قبل نهاية الإيجار بـ3 أيام

  /* ---------------- أيقونات ---------------- */
  var I={
    cup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5"/></svg>',
    cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    wa:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.7L2.2 21.8l5-1.3A9.8 9.8 0 1 0 12 2.2Zm0 17.9a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3 .8.8-3-.2-.3A8.1 8.1 0 1 1 12 20.1Zm4.5-6c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.8 2.8 0 0 0-.8 2.1 4.9 4.9 0 0 0 1 2.5 11 11 0 0 0 4.2 3.7c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z"/></svg>',
    tel:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.9 4.2c.4-.1.9.1 1.1.5l1.4 2.8c.2.4.1.9-.2 1.2l-1.2 1.2a13 13 0 0 0 5.1 5.1l1.2-1.2c.3-.3.8-.4 1.2-.2l2.8 1.4c.4.2.6.6.5 1.1l-.6 2.6c-.1.5-.6.9-1.1.9C9.9 19.5 4.5 14.1 4.5 6.9c0-.5.4-1 .9-1.1z"/></svg>',
    warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'
  };

  /* ---------------- أدوات ---------------- */
  function S(){ return api.S(); }
  function qar(v){ return '<span class="num">'+fmtPlain(v)+'</span> ر.ق'; }
  function uid(p){ return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function today(){ return R.todayISO(); }
  function parse(d){ var p=String(d||"").split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
  function iso(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); }
  function addPeriod(d, period, n){
    var dt=parse(d);
    if(period==="day") dt.setDate(dt.getDate()+n);
    else if(period==="week") dt.setDate(dt.getDate()+7*n);
    else { var day=dt.getDate(); dt.setDate(1); dt.setMonth(dt.getMonth()+n); var last=new Date(dt.getFullYear(), dt.getMonth()+1, 0).getDate(); dt.setDate(Math.min(day,last)); }
    return iso(dt);
  }
  function days(a,b){ return Math.round((parse(b)-parse(a))/86400000); }
  function dateAr(d){ return d ? R.dayMonth(d)+(String(d).slice(0,4)!==String(new Date().getFullYear())?' '+String(d).slice(0,4):'') : ''; }
  var PERIOD={month:"شهري", week:"أسبوعي", day:"يومي"}, PERIOD_ONE={month:"شهر", week:"أسبوع", day:"يوم"};
  function methodAr(v){ return {Cash:"كاش", Cheque:"شيك", Fawran:"فوران", Bank:"تحويل بنكي"}[v]||v||""; }
  function digits(v){ return R.digitsOf(v); }
  function phone(v){ var d=digits(v); if(d.length===8) d="974"+d; return d; }   // أرقام قطر بدون مفتاح

  function all(type){ var P=S().people, out=[]; Object.keys(P).forEach(function(id){ var x=P[id]; if(x && x.type===type && !x.deleted) out.push(Object.assign({id:id}, x)); }); return out; }
  function get(id){ var x=S().people[id]; return x && !x.deleted ? Object.assign({id:id}, x) : null; }
  function img(id){ var x=id && S().people[id]; return x && x.data ? x.data : null; }
  function machines(){ return all("cfMachine").sort(function(a,b){ return String(a.createdAt||"").localeCompare(String(b.createdAt||"")); }); }
  function rentals(){ return all("cfRental").sort(function(a,b){ return String(b.start||"").localeCompare(String(a.start||"")); }); }
  function leads(){ return all("cfLead").sort(function(a,b){ return String(b.createdAt||"").localeCompare(String(a.createdAt||"")); }); }
  function activeRental(mid){ return rentals().filter(function(r){ return r.machineId===mid && r.status!=="ended"; })[0]||null; }

  function save(id, data, msg){
    var merged=Object.assign({}, S().people[id]||{}, data, {updatedAt:new Date().toISOString()});
    S().people[id]=merged; api.refresh();
    return api.store.set("people", id, merged).then(function(){ if(msg!==false) api.toast(msg||"تم الحفظ"); }, function(){ api.toast("تعذّر الحفظ — تحقق من الاتصال"); });
  }

  /* ---------------- حسابات الإيجار ---------------- */
  // كم فترة بين البداية والنهاية (شهر/أسبوع/يوم)
  function periodsIn(r){
    if(!r.start || !r.end) return 0;
    var k=0; while(k<600 && addPeriod(r.start, r.period||"month", k) < r.end) k++;
    return k;
  }
  // الدفع سلف: كل فترة بلّشت لحد اليوم صارت مستحقة
  function periodsStarted(r){
    var lim = r.status==="ended" && r.returnedAt ? r.returnedAt : today();
    var k=0, n=periodsIn(r);
    while(k<n && addPeriod(r.start, r.period||"month", k) <= lim) k++;
    return k;
  }
  function paidOf(r){ return (r.payments||[]).reduce(function(a,p){ return a+(Number(p.amount)||0); },0); }
  function money(r){
    var rate=Number(r.rate)||0, total=periodsIn(r)*rate, dueNow=periodsStarted(r)*rate, paid=paidOf(r);
    return {rate:rate, total:total, dueNow:dueNow, paid:paid, balance:dueNow-paid, rateKnown:rate>0};
  }
  function daysLeft(r){ return r.end ? days(today(), r.end) : null; }
  function rentalState(r){
    if(r.status==="ended") return "ended";
    if(r.start > today()) return "upcoming";
    var dl=daysLeft(r);
    if(dl==null) return "active";
    if(dl<0) return "overdue";
    if(dl<=REMIND_DAYS) return "ending";
    return "active";
  }
  var STATE_TXT={active:"مؤجرة", ending:"قرّب ينتهي", overdue:"انتهت المدة", ended:"انتهى", upcoming:"تبدأ قريبًا"};
  function machineState(m){
    if(m.maintenanceOn) return "maint";
    var r=activeRental(m.id); if(r) return "rented";
    return "free";
  }
  var M_TXT={rented:"مؤجرة", free:"متاحة", maint:"بالصيانة"};

  function payback(m){
    var cost=(Number(m.purchasePrice)||0), maint=(m.maintenance||[]).reduce(function(a,x){ return a+(Number(x.cost)||0); },0);
    var rs=rentals().filter(function(r){ return r.machineId===m.id; }), got=rs.reduce(function(a,r){ return a+paidOf(r); },0);
    var since=m.purchaseDate || (rs.length ? rs[rs.length-1].start : null), rentedDays=0, totalDays=since?Math.max(1, days(since, today())+1):0;
    rs.forEach(function(r){ var a=r.start, b=(r.status==="ended" && r.returnedAt) ? r.returnedAt : (today()<r.end?today():r.end); if(a && b && a<=today()) rentedDays+=Math.max(0, days(a<since?since:a, b)+1); });
    var monthly = rs.filter(function(r){ return r.status!=="ended"; }).reduce(function(a,r){ var rt=Number(r.rate)||0; return a+(r.period==="week"?rt*4.33:(r.period==="day"?rt*30:rt)); },0);
    var need=cost+maint, left=Math.max(0, need-got);
    return {cost:cost, maint:maint, need:need, got:got, left:left, pct:need>0?Math.min(1,got/need):0, done:need>0&&got>=need, profit:got-need,
      rentedDays:Math.min(rentedDays,totalDays), totalDays:totalDays, occ:totalDays?Math.min(1,rentedDays/totalDays):0,
      monthsLeft: monthly>0 ? Math.ceil(left/monthly) : null, rentals:rs.length, costKnown:cost>0};
  }

  /* ---------------- رسائل واتساب ---------------- */
  function renewMsg(r){
    var m=get(r.machineId)||{}, who=r.company||r.tenant||"";
    return "مرحبا"+(who?" "+who:"")+"، نذكّركم إن إيجار ماكينة القهوة ("+(m.name||"")+") ينتهي بتاريخ "+R.dmy(r.end)+". حابين تمددون الإيجار؟ ردّوا علينا ونرتب لكم. شكرًا\n\n" +
      "Hello, a reminder that the coffee machine rental ("+(m.name||"")+") ends on "+R.dmy(r.end)+". Would you like to extend it? Thank you.";
  }
  function payMsg(r){
    var mo=money(r), m=get(r.machineId)||{};
    return "مرحبا، نذكّركم بمبلغ إيجار ماكينة القهوة ("+(m.name||"")+") المستحق: "+fmtPlain(mo.balance)+" ر.ق. شكرًا لكم\n\n" +
      "Hello, a reminder of the outstanding coffee machine rental ("+(m.name||"")+"): "+fmtPlain(mo.balance)+" QAR. Thank you.";
  }
  function freeMsg(l, m){
    return "مرحبا"+(l.name?" "+l.name:"")+"، صار عندنا ماكينة قهوة متاحة للإيجار ("+(m?m.name:"")+"). إذا لسا محتاجينها خبرونا ونرتب التسليم. شكرًا";
  }
  function contact(num, msg){
    var d=phone(num); if(!d) return '<span class="who none">بدون رقم</span>';
    return '<span class="contact"><a class="c-tel" href="tel:+'+d+'" aria-label="اتصال">'+I.tel+'</a><a class="c-wa" href="https://wa.me/'+d+'?text='+encodeURIComponent(msg||"")+'" target="_blank" rel="noopener" aria-label="واتساب">'+I.wa+'</a></span>';
  }

  /* ---------------- الصور ---------------- */
  // الصورة بتنضغط (أقصى ضلع 720px، JPEG) وبتنحفظ كسجل لحالها
  function compress(file){
    return new Promise(function(res, rej){
      var fr=new FileReader();
      fr.onload=function(){ var im=new Image(); im.onload=function(){
        var max=720, w=im.width, h=im.height, k=Math.min(1, max/Math.max(w,h)), c=document.createElement("canvas");
        c.width=Math.round(w*k); c.height=Math.round(h*k); c.getContext("2d").drawImage(im,0,0,c.width,c.height);
        var q=.72, out=c.toDataURL("image/jpeg", q); while(out.length>260000 && q>.35){ q-=.1; out=c.toDataURL("image/jpeg", q); }
        res(out); }; im.onerror=rej; im.src=fr.result; };
      fr.onerror=rej; fr.readAsDataURL(file);
    });
  }
  var pendingPhoto=null;   // {target:"main"|"acc"|"out"|"in", index}
  function pickPhoto(target, index){
    pendingPhoto={target:target, index:index};
    var inp=document.getElementById("cf-file"); if(!inp){ inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.id="cf-file"; inp.hidden=true; document.body.appendChild(inp);
      inp.addEventListener("change", function(){ if(inp.files[0]) gotPhoto(inp.files[0]); inp.value=""; }); }
    inp.click();
  }
  async function gotPhoto(file){
    var s=api.sheet(); if(!s || !pendingPhoto) return;
    api.toast("جارٍ رفع الصورة…");
    var data; try{ data=await compress(file); }catch(e){ api.toast("تعذّرت قراءة الصورة"); return; }
    var id=uid("cfimg_");
    S().people[id]={type:"cfImage", data:data, createdAt:new Date().toISOString()};
    try{ await api.store.set("people", id, S().people[id]); }catch(e){ api.toast("تعذّر رفع الصورة"); return; }
    var t=pendingPhoto; pendingPhoto=null;
    if(t.target==="main") s.d.photoId=id;
    else if(t.target==="acc"){ if(t.index==="new") s.d.newAccPhoto=id; else s.d.acc[t.index].photoId=id; }
    else if(t.target==="out") s.d.photosOut=(s.d.photosOut||[]).concat(id);
    else if(t.target==="in") s.d.photosIn=(s.d.photosIn||[]).concat(id);
    api.renderSheet(); api.toast("تمت إضافة الصورة");
  }
  function thumb(id, cls, alt){
    var src=img(id);
    return src ? '<img class="'+(cls||"cf-th")+'" src="'+src+'" alt="'+esc(alt||"")+'" loading="lazy">' : '<span class="'+(cls||"cf-th")+' cf-noimg" aria-hidden="true">'+I.cup+'</span>';
  }
  function gallery(ids, target){
    return '<div class="cf-gal">'+(ids||[]).map(function(id){ return '<span class="cf-gi">'+thumb(id,"cf-gimg")+'<button type="button" class="cf-gx" data-act="cfrmphoto" data-t="'+target+'" data-id="'+id+'" aria-label="حذف الصورة">×</button></span>'; }).join("") +
      '<button type="button" class="cf-gadd" data-act="cfphoto" data-t="'+target+'">'+I.cam+'<span>صورة</span></button></div>';
  }

  /* ================= العرض الرئيسي ================= */
  // seg: rent (الإيجارات) · mach (الماكينات) · lead (بالانتظار) · rep (التقارير)
  function view(seg){
    var ms=machines(), rs=rentals(), ls=leads(), h="";
    var free=ms.filter(function(m){ return machineState(m)==="free"; });
    if(seg==="mach") return machinesView(ms);
    if(seg==="lead") return leadsView(ls, free);
    if(seg==="rep") return reportView(ms, rs);
    var act=rs.filter(function(r){ return r.status!=="ended"; });
    var waiting=ls.filter(function(l){ return l.status==="new"||l.status==="contacted"||!l.status; });
    var owed=act.reduce(function(a,r){ var b=money(r).balance; return a+(b>0?b:0); },0);
    h+='<section class="hero cf-hero"><div class="hero-line"><span class="hero-big num">'+act.length+'</span><span class="hero-of">من '+ms.length+' ماكينات مؤجرة الآن</span></div>' +
      '<div class="hero-sub">'+(free.length?free.length+' متاحة للإيجار':'ما في ماكينة متاحة')+(waiting.length?' · '+waiting.length+' زبون بالانتظار':'')+(owed>0?' · مستحق على المستأجرين '+qar(owed):'')+'</div>' +
      '<div class="cf-fleet" aria-hidden="true">'+ms.map(function(m){ return '<i class="'+machineState(m)+'"></i>'; }).join("")+'</div>' +
      '<div class="legend"><span><i style="background:var(--bean)"></i>مؤجرة</span><span><i style="background:var(--roof)"></i>متاحة</span><span><i style="background:var(--part)"></i>بالصيانة</span></div></section>';
    var al=alerts(true); if(al) h+='<div class="stack" style="margin-top:12px;gap:8px">'+al+'</div>';
    return h+rentalsView(rs);
  }
  // سطر صغير بصفحة المستودعات حتى ما يضيع تذكير القهوة
  function summaryLine(){
    var ending=0, overdue=0, owed=0;
    rentals().forEach(function(r){ if(r.status==="ended") return; var st=rentalState(r); if(st==="ending") ending++; if(st==="overdue") overdue++; var mo=money(r); if(mo.rateKnown && mo.balance>0 && r.start<=today()) owed+=mo.balance; });
    var parts=[]; if(ending) parts.push(ending===1?'إيجار بينتهي خلال '+REMIND_DAYS+' أيام':ending+' إيجارات بتنتهي خلال '+REMIND_DAYS+' أيام'); if(overdue) parts.push(overdue===1?'إيجار خلصت مدته':overdue+' إيجارات خلصت مدتها'); if(owed) parts.push('مستحق '+qar(owed));
    if(!parts.length) return "";
    return '<button type="button" class="alert cf-mini" data-act="cfgo" data-v="rent"><span>'+I.cup+'</span><span><b>ماكينات القهوة:</b> '+parts.join('، ')+'</span></button>';
  }

  // تنبيهات: قرّب ينتهي (3 أيام)، انتهت المدة، مبلغ مستحق، ماكينة متاحة وفي زبون ناطر
  function alerts(inTab){
    var out=[], rs=rentals().filter(function(r){ return r.status!=="ended"; });
    rs.forEach(function(r){
      var st=rentalState(r), m=get(r.machineId)||{}, who=esc(r.company||r.tenant||"المستأجر"), dl=daysLeft(r);
      if(st==="ending") out.push('<div class="alert" role="group"><span>'+I.cup+'</span><span style="flex:1"><b>إيجار '+esc(m.name||"ماكينة")+' عند '+who+' بينتهي '+(dl===0?'اليوم':(dl===1?'بكرا':'بعد '+dl+' أيام'))+'</b> ('+R.dmy(r.end)+'). اسأله إذا بده يمدد.</span>'+contact(r.contact, renewMsg(r))+'</div>');
      else if(st==="overdue") out.push('<div class="alert bad" role="group"><span>'+I.warn+'</span><span style="flex:1"><b>'+esc(m.name||"ماكينة")+' عند '+who+': خلصت مدة الإيجار من '+(-dl)+' يوم.</b> مدّد أو سجّل الاستلام.</span><button type="button" class="btn sm line" data-act="cfopenrental" data-id="'+r.id+'">فتح</button></div>');
      var mo=money(r); if(mo.rateKnown && mo.balance>0 && r.start<=today()) out.push('<div class="alert" role="group"><span>'+I.warn+'</span><span style="flex:1">على '+who+' مبلغ <b>'+qar(mo.balance)+'</b> عن '+esc(m.name||"الماكينة")+'.</span><button type="button" class="btn sm line" data-act="cfpay" data-id="'+r.id+'">تسجيل دفعة</button></div>');
    });
    var free=machines().filter(function(m){ return machineState(m)==="free"; }), waiting=leads().filter(function(l){ return l.status==="new"||l.status==="contacted"||!l.status; });
    if(free.length && waiting.length) out.push('<button type="button" class="alert info" data-act="cfseg" data-v="lead"><span>'+I.cup+'</span><span><b>عندك '+(free.length===1?'ماكينة متاحة':free.length+' ماكينات متاحة')+' و'+(waiting.length===1?'زبون ناطر':waiting.length+' زباين ناطرين')+'.</b> اضغط لتشوفهم.</span></button>');
    if(!inTab && !out.length) return "";
    return out.join("");
  }

  /* ---------------- الإيجارات ---------------- */
  function rentalRow(r){
    var m=get(r.machineId)||{}, st=rentalState(r), mo=money(r), dl=daysLeft(r);
    var when = st==="ended" ? 'من '+dateAr(r.start)+' لـ '+dateAr(r.returnedAt||r.end)
      : (st==="upcoming" ? 'يبدأ '+dateAr(r.start) : (dl<0 ? '<span class="neg">انتهت المدة '+dateAr(r.end)+'</span>' : 'لحد '+dateAr(r.end)+' · '+(dl===0?'آخر يوم':'باقي '+dl+' يوم')));
    var end = st==="ended" ? '<b>'+qar(mo.paid)+'</b><small>حصّلت</small>'
      : (!mo.rateKnown ? '<b class="note">—</b><small class="neg">السعر ناقص</small>'
        : (mo.balance>0 ? '<b class="neg">'+qar(mo.balance)+'</b><small>مستحق</small>' : '<b>'+qar(mo.rate)+'</b><small>'+PERIOD[r.period||"month"]+' · مدفوع</small>'));
    return '<button type="button" class="row" data-act="cfopenrental" data-id="'+r.id+'">'+thumb(m.photoId,"cf-th",m.name) +
      '<span class="row-main"><b>'+(r.company||r.tenant?esc(r.company||r.tenant):'<span class="note">أضف اسم المستأجر</span>')+'</b><small><bdi>'+esc(m.name||"ماكينة")+'</bdi> · '+when+'</small></span>' +
      '<span class="row-end">'+end+'</span></button>';
  }
  function rentalsView(rs){
    var act=rs.filter(function(r){ return r.status!=="ended"; }), ended=rs.filter(function(r){ return r.status==="ended"; }), h="";
    h+='<section class="sec"><div class="sec-h"><h2>الإيجارات الحالية</h2><button type="button" class="btn sm soft" data-act="cfnewrental">+ إيجار جديد</button></div>';
    h+= act.length ? '<div class="panel">'+act.map(rentalRow).join("")+'</div>' : '<div class="panel empty">ما في ماكينة مؤجرة هلّق</div>';
    h+='</section>';
    if(ended.length){
      h+='<section class="sec"><div class="sec-h"><h2>إيجارات سابقة</h2><span class="count">'+ended.length+'</span></div>';
      h+= C.showEnded ? '<div class="panel">'+ended.map(rentalRow).join("")+'</div>' : '<button type="button" class="btn line block" data-act="cfshowended">عرض الإيجارات السابقة</button>';
      h+='</section>';
    }
    return h;
  }

  /* ---------------- الماكينات ---------------- */
  function machinesView(ms){
    var h='<section class="sec"><div class="sec-h"><h2>الماكينات</h2><button type="button" class="btn sm soft" data-act="cfnewmachine">+ ماكينة</button></div>';
    if(!ms.length) return h+'<div class="panel empty">أضف أول ماكينة</div></section>';
    h+='<div class="cf-grid">'+ms.map(function(m){
      var st=machineState(m), r=activeRental(m.id);
      return '<button type="button" class="cf-card" data-act="cfopenmachine" data-id="'+m.id+'">'+thumb(m.photoId,"cf-cimg",m.name) +
        '<span class="cf-cb"><b>'+esc(m.name||"ماكينة")+'</b><small><span class="cf-st '+st+'">'+M_TXT[st]+'</span>'+(r&&(r.company||r.tenant)?' · <bdi>'+esc(r.company||r.tenant)+'</bdi>':'')+'</small>' +
        '<small>'+((m.accessories||[]).length?(m.accessories.length+' ملحقات'):'بدون ملحقات')+'</small></span></button>'; }).join("")+'</div>';
    return h+'</section>';
  }

  /* ---------------- الزبائن بالانتظار ---------------- */
  var LEAD_ST=[["new","جديد"],["contacted","تواصلت"],["bought","اشتريت إله"],["rented","تأجر"],["cancelled","ألغى"]];
  function leadStText(v){ var x=LEAD_ST.filter(function(s){ return s[0]===(v||"new"); })[0]; return x?x[1]:""; }
  function leadsView(ls, free){
    var open=ls.filter(function(l){ return ["rented","cancelled"].indexOf(l.status)<0; }), closed=ls.filter(function(l){ return ["rented","cancelled"].indexOf(l.status)>=0; }), h="";
    h+='<section class="sec"><div class="sec-h"><h2>زبائن بالانتظار</h2><button type="button" class="btn sm soft" data-act="cfnewlead">+ زبون</button></div>';
    h+='<p class="note" style="margin:0 4px 8px">زبائن بدهم ماكينة وما في متاحة. لما تشتري ماكينة إلهم، اضغط «تأجير» وبتتحوّل بياناته لعقد.</p>';
    h+= open.length ? '<div class="panel">'+open.map(function(l){
      return '<div class="row" data-act="cfopenlead" data-id="'+l.id+'" role="button" tabindex="0"><span class="unit">'+esc((l.company||l.name||"؟").slice(0,2))+'</span>' +
        '<span class="row-main"><b>'+esc(l.company||l.name||"زبون")+'</b><small>'+[l.company&&l.name?'<bdi>'+esc(l.name)+'</bdi>':'', esc(l.want||""), l.from?'من '+dateAr(l.from):'', '<span class="cf-lst">'+leadStText(l.status)+'</span>'].filter(Boolean).join(' · ')+'</small></span>' +
        contact(l.contact, free.length?freeMsg(l, free[0]):"") + '</div>'; }).join("")+'</div>' : '<div class="panel empty">ما في حدا ناطر</div>';
    h+='</section>';
    if(closed.length) h+='<section class="sec"><div class="sec-h"><h2>انتهى طلبهم</h2><span class="count">'+closed.length+'</span></div><div class="panel">'+closed.map(function(l){
      return '<button type="button" class="row" data-act="cfopenlead" data-id="'+l.id+'" style="opacity:.75"><span class="unit">'+esc((l.company||l.name||"؟").slice(0,2))+'</span><span class="row-main"><b>'+esc(l.company||l.name||"زبون")+'</b><small>'+leadStText(l.status)+'</small></span></button>'; }).join("")+'</div></section>';
    return h;
  }

  /* ---------------- التقارير: رجعت حقها؟ ---------------- */
  function reportView(ms, rs){
    var h="", T={need:0,got:0};
    h+='<section class="sec" style="margin-top:14px"><div class="sec-h"><h2>كل ماكينة: رجعت حقها؟</h2></div>';
    if(!ms.length) return h+'<div class="panel empty">ما في ماكينات</div></section>';
    h+=ms.map(function(m){
      var p=payback(m); T.need+=p.need; T.got+=p.got;
      return '<div class="panel pad cf-pb"><div class="cf-pbh">'+thumb(m.photoId,"cf-th",m.name)+'<div style="flex:1;min-width:0"><b>'+esc(m.name||"ماكينة")+'</b><small>'+(p.done?'<span class="cf-ok">رجعت حقها ✓</span>':(p.costKnown?'باقي '+qar(p.left):'<span class="neg">سعر الشراء ناقص</span>'))+'</small></div>' +
        '<span class="cf-pct num">'+(p.costKnown?Math.round(p.pct*100)+'%':'—')+'</span></div>' +
        '<div class="bar"><i style="width:'+(p.pct*100).toFixed(0)+'%'+(p.done?'':';background:var(--part)')+'"></i></div>' +
        '<div class="sumline"><span>سعر الشراء'+(p.maint?' + الصيانة':'')+'</span><b>'+(p.costKnown?qar(p.need):'—')+'</b></div>' +
        (p.maint?'<div class="sumline"><span>منها صيانة</span><b>'+qar(p.maint)+'</b></div>':'') +
        '<div class="sumline"><span>حصّلت منها ('+p.rentals+' إيجار)</span><b>'+qar(p.got)+'</b></div>' +
        (p.done?'<div class="sumline"><span>ربح صافي فوق حقها</span><b class="cf-ok">'+qar(p.profit)+'</b></div>':(p.monthsLeft!=null&&p.costKnown?'<div class="sumline"><span>بترجع حقها تقريبًا بعد</span><b>'+p.monthsLeft+' '+(p.monthsLeft===1?'شهر':'أشهر')+'</b></div>':'')) +
        '<div class="sumline"><span>الإشغال</span><b>'+Math.round(p.occ*100)+'% <small class="note">('+p.rentedDays+' من '+p.totalDays+' يوم)</small></b></div></div>';
    }).join("");
    h+='<div class="panel pad" style="margin-top:10px"><div class="sumline total"><span>المجموع: حصّلت '+qar(T.got)+'</span><b>'+(T.need?Math.round(T.got/T.need*100)+'% من '+qar(T.need):'')+'</b></div></div></section>';
    // التحصيل شهر بشهر من كل الإيجارات
    var byM={}; (rs||[]).forEach(function(r){ (r.payments||[]).forEach(function(p){ var k=String(p.date||"").slice(0,7); if(!k) return; byM[k]=(byM[k]||0)+(Number(p.amount)||0); }); });
    var ks=Object.keys(byM).sort().reverse();
    h+='<section class="sec"><div class="sec-h"><h2>التحصيل شهر بشهر</h2></div>' + (ks.length ? '<div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th class="n">المحصّل</th></tr></thead><tbody>' +
      ks.map(function(k){ return '<tr><td>'+R.monthLabel(k)+'</td><td class="n num">'+fmtPlain(byM[k])+'</td></tr>'; }).join("") +
      '<tr class="tot"><td>المجموع</td><td class="n num">'+fmtPlain(T.got)+'</td></tr></tbody></table></div></div>' : '<div class="panel empty">ما في دفعات مسجلة لسا</div>') + '</section>';
    // الإيجارات الحالية: مين عليه شي
    var act=(rs||[]).filter(function(r){ return r.status!=="ended"; });
    if(act.length) h+='<section class="sec"><div class="sec-h"><h2>الإيجارات الحالية</h2></div><div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>المستأجر والماكينة</th><th>لحد</th><th class="n">الباقي عليه</th></tr></thead><tbody>' +
      act.map(function(r){ var m=get(r.machineId)||{}, mo=money(r); return '<tr data-act="cfopenrental" data-id="'+r.id+'" style="cursor:pointer"><td style="white-space:normal">'+esc(r.company||r.tenant||"بدون اسم")+'<br><small class="note"><bdi>'+esc(m.name||"")+'</bdi></small></td><td>'+R.dmy(r.end)+'</td><td class="n num'+(mo.balance>0?' neg':'')+'">'+(mo.rateKnown?fmtPlain(Math.max(0,mo.balance)):'—')+'</td></tr>'; }).join("") +
      '</tbody></table></div></div></section>';
    h+='<div class="btnrow" style="margin-top:10px"><button type="button" class="btn line" data-act="excel">تنزيل ملف Excel</button></div>';
    return h;
  }

  /* ================= الصفحات المنبثقة ================= */
  function sheet(s){
    switch(s.kind){
      case "cfMachine": return machineSheet(s);
      case "cfMachineView": return machineViewSheet(s);
      case "cfRental": return rentalSheet(s);
      case "cfRentalView": return rentalViewSheet(s);
      case "cfPay": return paySheet(s);
      case "cfReturn": return returnSheet(s);
      case "cfLead": return leadSheet(s);
      case "cfMaint": return maintSheet(s);
    }
    return "";
  }
  function head(title, sub, pre){ return '<div class="sheet-h">'+(pre||'')+'<div class="t"><h3>'+title+'</h3>'+(sub?'<small>'+sub+'</small>':'')+'</div><button type="button" class="xbtn" data-act="closesheet" aria-label="إغلاق">×</button></div>'; }
  function field(id, label, key, val, type, extra){ return '<div class="field'+(extra&&extra.full?' full':'')+'"><label for="'+id+'">'+label+'</label><input id="'+id+'" '+(type?'type="'+type+'" ':'')+(type==="tel"?'dir="ltr" ':'')+(type==="number"?'inputmode="numeric" min="0" ':'')+'data-in="'+key+'" value="'+esc(val==null?"":val)+'"'+(extra&&extra.ph?' placeholder="'+esc(extra.ph)+'"':'')+'></div>'; }

  /* ---- ماكينة: إضافة وتعديل ---- */
  function machineSheet(s){
    var d=s.d, h=head(s.id?'تعديل الماكينة':'ماكينة جديدة','الصورة والملحقات بتظهر بكل إيجار');
    h+='<div class="stack"><div class="cf-photo">'+(d.photoId&&img(d.photoId)?'<img src="'+img(d.photoId)+'" alt="">':'<span class="cf-noimg">'+I.cup+'</span>')+'<button type="button" class="btn line sm" data-act="cfphoto" data-t="main">'+I.cam+(d.photoId?' تغيير الصورة':' إضافة صورة')+'</button></div>';
    h+='<div class="grid2">'+field("m-n","اسم الماكينة","name",d.name,"text",{full:true,ph:"مثل: Wega Polaris 2 Group"}) +
      field("m-c","اللون","color",d.color,"text") + field("m-s","الرقم التسلسلي","serial",d.serial,"text") +
      field("m-p","سعر الشراء","purchasePrice",d.purchasePrice,"number") + field("m-d","تاريخ الشراء","purchaseDate",d.purchaseDate,"date") + '</div>';
    h+='<div class="field"><span class="lbl">الملحقات</span><div class="panel" style="box-shadow:inset 0 0 0 1px var(--line-2)">' +
      (d.acc||[]).map(function(a,i){ return '<div class="cf-acc"><button type="button" class="cf-accimg" data-act="cfphoto" data-t="acc" data-i="'+i+'" aria-label="صورة '+esc(a.name)+'">'+(img(a.photoId)?'<img src="'+img(a.photoId)+'" alt="">':I.cam)+'</button><input data-acc="'+i+'" value="'+esc(a.name)+'" aria-label="اسم الملحق"><button type="button" class="xbtn" data-act="cfaccdel" data-i="'+i+'" aria-label="حذف">×</button></div>'; }).join("") +
      '<div class="cf-acc cf-accnew"><button type="button" class="cf-accimg" data-act="cfphoto" data-t="acc" data-i="new" aria-label="صورة للملحق الجديد">'+(img(d.newAccPhoto)?'<img src="'+img(d.newAccPhoto)+'" alt="">':I.cam)+'</button><input id="cf-accn" data-in="newAcc" value="'+esc(d.newAcc||"")+'" placeholder="ملحق جديد: هاندل، تامبر، مطحنة…"><button type="button" class="btn sm soft" data-act="cfaccadd">إضافة</button></div>' +
      '</div></div>';
    h+='<label class="check"><input type="checkbox" data-chk="maintenanceOn"'+(d.maintenanceOn?' checked':'')+'>الماكينة بالصيانة حاليًا (ما بتنعرض متاحة)</label>';
    h+='<div class="field"><label for="m-no">ملاحظات</label><textarea id="m-no" data-in="notes">'+esc(d.notes||"")+'</textarea></div>';
    h+='<button type="button" class="btn block" data-act="cfsavemachine">'+(s.id?'حفظ التعديلات':'إضافة الماكينة')+'</button>';
    if(s.id) h+='<button type="button" class="btn danger block" data-act="cfdelmachine">حذف الماكينة</button>';
    return h+'</div>';
  }
  function machineDraft(m){
    m=m||{}; return {name:m.name||"", color:m.color||"", serial:m.serial||"", purchasePrice:m.purchasePrice||"", purchaseDate:m.purchaseDate||"",
      photoId:m.photoId||null, acc:(m.accessories||[]).map(function(a){ return {id:a.id, name:a.name, photoId:a.photoId||null}; }), maintenance:!!m.maintenance, notes:m.notes||"", newAcc:"", newAccPhoto:null};
  }

  /* ---- ماكينة: عرض ---- */
  function machineViewSheet(s){
    var m=get(s.id); if(!m) return head("الماكينة غير موجودة");
    var st=machineState(m), r=activeRental(m.id), p=payback(m), rs=rentals().filter(function(x){ return x.machineId===m.id; });
    var h=head(esc(m.name||"ماكينة"), '<span class="cf-st '+st+'">'+M_TXT[st]+'</span>'+(m.color?' · '+esc(m.color):'')+(m.serial?' · <bdi>'+esc(m.serial)+'</bdi>':''));
    h+='<div class="stack">'+(img(m.photoId)?'<img class="cf-hero-img" src="'+img(m.photoId)+'" alt="'+esc(m.name)+'">':'');
    if(r) h+='<button type="button" class="alert info" data-act="cfopenrental" data-id="'+r.id+'"><span>'+I.cup+'</span><span>مؤجرة'+(r.company||r.tenant?' عند <b>'+esc(r.company||r.tenant)+'</b>':'')+' لحد '+dateAr(r.end)+'</span></button>';
    else if(st==="free") h+='<button type="button" class="btn block" data-act="cfnewrental" data-mid="'+m.id+'">تأجير هالماكينة</button>';
    h+='<div><div class="lbl" style="margin-bottom:6px">الملحقات</div>'+((m.accessories||[]).length?'<div class="cf-accs">'+m.accessories.map(function(a){ return '<span class="cf-chipimg">'+(img(a.photoId)?'<img src="'+img(a.photoId)+'" alt="">':'<i>'+I.cup+'</i>')+'<span>'+esc(a.name)+'</span></span>'; }).join("")+'</div>':'<p class="note">ما في ملحقات مسجلة</p>')+'</div>';
    h+='<div class="panel pad" style="box-shadow:inset 0 0 0 1px var(--line-2)"><div class="sumline"><span>سعر الشراء</span><b>'+(p.costKnown?qar(p.cost):'—')+'</b></div>' +
      '<div class="sumline"><span>حصّلت منها</span><b>'+qar(p.got)+'</b></div>' +
      '<div class="sumline total"><span>'+(p.done?'رجعت حقها ✓':'باقي لترجع حقها')+'</span><b>'+(p.done?qar(p.profit)+' ربح':(p.costKnown?qar(p.left):'—'))+'</b></div></div>';
    // الصيانة
    h+='<div><div class="sec-h" style="margin:0 0 6px"><span class="lbl">سجل الصيانة</span><button type="button" class="btn sm soft" data-act="cfnewmaint" data-id="'+m.id+'">+ صيانة</button></div>' +
      ((m.maintenance||[]).length?'<div class="panel" style="box-shadow:inset 0 0 0 1px var(--line-2)">'+m.maintenance.map(function(x){ return '<div class="trow"><span class="tm"><b>'+esc(x.desc)+'</b><small>'+R.dmy(x.date)+'</small></span><span class="ta">'+qar(x.cost)+'</span><button type="button" class="xbtn" data-act="cfdelmaint" data-id="'+m.id+'" data-x="'+x.id+'" aria-label="حذف">×</button></div>'; }).join("")+'</div>':'<p class="note">ما في صيانة مسجلة</p>')+'</div>';
    if(rs.length) h+='<div><div class="lbl" style="margin-bottom:6px">إيجاراتها</div><div class="panel" style="box-shadow:inset 0 0 0 1px var(--line-2)">'+rs.map(function(x){ return '<button type="button" class="trow" style="width:100%;border:0;background:none;cursor:pointer;text-align:start;color:inherit" data-act="cfopenrental" data-id="'+x.id+'"><span class="tm"><b>'+esc(x.company||x.tenant||"مستأجر")+'</b><small>'+dateAr(x.start)+' – '+dateAr(x.returnedAt||x.end)+'</small></span><span class="ta">'+qar(paidOf(x))+'</span></button>'; }).join("")+'</div></div>';
    h+='<button type="button" class="btn line block" data-act="cfeditmachine" data-id="'+m.id+'">تعديل الماكينة والملحقات</button>';
    return h+'</div>';
  }

  /* ---- إيجار: إضافة وتعديل ---- */
  function rentalDraft(r, preset){
    r=r||{}; preset=preset||{};
    var start=r.start||today(), period=r.period||"month";
    var m=get(r.machineId||preset.machineId);
    return {machineId:r.machineId||preset.machineId||"", tenant:r.tenant||preset.tenant||"", company:r.company||preset.company||"", contact:r.contact||preset.contact||"",
      start:start, period:period, end:r.end||addPeriod(start,period,1), endTouched:!!r.end, rate:r.rate||"", payMethod:r.payMethod||"Fawran",
      depType:(r.deposit&&r.deposit.type)||"none", depNo:(r.deposit&&r.deposit.number)||"", depBank:(r.deposit&&r.deposit.bank)||"", depAmount:(r.deposit&&r.deposit.amount)||"",
      items: r.items || (m ? (m.accessories||[]).map(function(a){ return a.id; }) : []), photosOut:r.photosOut||[], notes:r.notes||"", leadId:preset.leadId||r.leadId||null};
  }
  function rentalSheet(s){
    var d=s.d, ms=machines(), m=get(d.machineId), h=head(s.id?'تعديل الإيجار':'إيجار جديد', 'التذكير بيطلع قبل النهاية بـ'+REMIND_DAYS+' أيام');
    h+='<div class="stack"><div class="field"><span class="lbl">الماكينة</span><div class="cf-pick">'+ms.map(function(x){
      var st=machineState(x), busy=st!=="free" && x.id!==(get(s.id)||{}).machineId;
      return '<button type="button" data-act="pick" data-k="machineId" data-v="'+x.id+'" aria-pressed="'+(d.machineId===x.id)+'"'+(busy?' disabled':'')+'>'+thumb(x.photoId,"cf-pth")+'<span>'+esc(x.name)+'<small>'+(busy?M_TXT[st]:'متاحة')+'</small></span></button>'; }).join("") +
      (ms.length?'':'<p class="note">أضف ماكينة أول من قسم «الماكينات».</p>')+'</div></div>';
    h+='<div class="grid2">'+field("r-c","اسم الشركة","company",d.company,"text") + field("r-t","اسم المستأجر","tenant",d.tenant,"text") +
      field("r-p","رقم التواصل","contact",d.contact,"tel",{full:true,ph:"55512345"})+'</div>';
    h+='<div class="field"><span class="lbl">مدة الإيجار</span>'+api.choice("period", d.period, [["month","شهري"],["week","أسبوعي"],["day","يومي"]])+'</div>';
    h+='<div class="grid2">'+field("r-s","من تاريخ","start",d.start,"date")+field("r-e","لحد تاريخ","end",d.end,"date")+
      field("r-r","السعر لكل "+PERIOD_ONE[d.period],"rate",d.rate,"number",{full:true})+'</div>';
    var n=periodsIn({start:d.start,end:d.end,period:d.period}), tot=n*(Number(d.rate)||0);
    if(n&&tot) h+='<p class="help">'+n+' '+PERIOD_ONE[d.period]+' × '+fmtPlain(d.rate)+' = <b>'+qar(tot)+'</b> للعقد كامل. التذكير يوم '+R.dmy(addPeriod(d.end,"day",-REMIND_DAYS))+'.</p>';
    h+='<div class="field"><span class="lbl">طريقة الدفع</span>'+api.choice("payMethod", d.payMethod, [["Fawran","فوران"],["Cash","كاش"],["Cheque","شيك"],["Bank","تحويل"]])+'</div>';
    h+='<div class="field"><span class="lbl">الضمان</span>'+api.choice("depType", d.depType, [["none","بدون ضمان"],["cheque","شيك ضمان"],["cash","مبلغ تأمين"]])+'</div>';
    if(d.depType!=="none") h+='<div class="grid2">'+field("r-da","مبلغ الضمان","depAmount",d.depAmount,"number")+(d.depType==="cheque"?field("r-dn","رقم الشيك","depNo",d.depNo,"text")+field("r-db","البنك","depBank",d.depBank,"text",{full:true}):'')+'</div>';
    if(m && (m.accessories||[]).length) h+='<div class="field"><span class="lbl">الملحقات اللي طالعة مع الماكينة</span><div class="cf-checks">'+m.accessories.map(function(a){
      return '<label class="check"><input type="checkbox" data-item="'+a.id+'"'+(d.items.indexOf(a.id)>=0?' checked':'')+'>'+esc(a.name)+'</label>'; }).join("")+'</div></div>';
    h+='<div class="field"><span class="lbl">صور التسليم (حالة الماكينة وقت ما طلعت)</span>'+gallery(d.photosOut,"out")+'</div>';
    h+='<div class="field"><label for="r-no">ملاحظات</label><textarea id="r-no" data-in="notes">'+esc(d.notes)+'</textarea></div>';
    h+='<button type="button" class="btn block" data-act="cfsaverental">'+(s.id?'حفظ التعديلات':'تسجيل الإيجار')+'</button>';
    if(s.id) h+='<button type="button" class="btn danger block" data-act="cfdelrental">حذف الإيجار</button>';
    return h+'</div>';
  }

  /* ---- إيجار: عرض ---- */
  function rentalViewSheet(s){
    var r=get(s.id); if(!r) return head("الإيجار غير موجود");
    var m=get(r.machineId)||{}, st=rentalState(r), mo=money(r), dl=daysLeft(r);
    var h=head(r.company||r.tenant?esc(r.company||r.tenant):'مستأجر بدون اسم', (r.company&&r.tenant?'<bdi>'+esc(r.tenant)+'</bdi> · ':'')+'<span class="cf-rst '+st+'">'+STATE_TXT[st]+'</span>', thumb(m.photoId,"cf-th",m.name));
    h+='<div class="stack">';
    h+='<div class="cf-dates"><div><small>من</small><b>'+dateAr(r.start)+'</b></div><div class="cf-arrow" aria-hidden="true"></div><div><small>'+(st==="ended"?'رجعت':'لحد')+'</small><b>'+dateAr(st==="ended"?(r.returnedAt||r.end):r.end)+'</b></div>' +
      (st!=="ended"&&dl!=null?'<div class="cf-left '+st+'"><b class="num">'+Math.abs(dl)+'</b><small>'+(dl<0?'يوم متأخر':'يوم باقي')+'</small></div>':'')+'</div>';
    h+='<div class="panel pad" style="box-shadow:inset 0 0 0 1px var(--line-2)"><div class="sumline"><span>الماكينة</span><b><bdi>'+esc(m.name||"")+'</bdi></b></div>' +
      '<div class="sumline"><span>السعر</span><b>'+(mo.rateKnown?qar(mo.rate)+' / '+PERIOD_ONE[r.period||"month"]:'<span class="neg">ناقص — عدّل الإيجار</span>')+'</b></div>' +
      '<div class="sumline"><span>المستحق لحد اليوم</span><b>'+qar(mo.dueNow)+'</b></div>' +
      '<div class="sumline"><span>دفع</span><b>'+qar(mo.paid)+'</b></div>' +
      (mo.rateKnown||mo.paid ? '<div class="sumline total"><span>'+(mo.balance>0?'الباقي عليه':(mo.balance<0?'دافع زيادة (سلف)':'مسدّد'))+'</span><b class="'+(mo.balance>0?'neg':'')+'">'+qar(Math.abs(mo.balance))+'</b></div>' : '<div class="sumline total"><span>الباقي عليه</span><b>—</b></div>')+'</div>';
    // الدفعات
    h+='<div><div class="sec-h" style="margin:0 0 6px"><span class="lbl">الدفعات</span><button type="button" class="btn sm soft" data-act="cfpay" data-id="'+r.id+'">+ دفعة</button></div>' +
      ((r.payments||[]).length?'<div class="panel" style="box-shadow:inset 0 0 0 1px var(--line-2)">'+r.payments.slice().sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); }).map(function(p){
        return '<div class="trow"><span class="tm"><b>'+qar(p.amount)+'</b><small>'+[R.dmy(p.date), methodAr(p.method), esc(p.note||"")].filter(Boolean).join(' · ')+'</small></span><button type="button" class="xbtn" data-act="cfdelpay" data-id="'+r.id+'" data-x="'+p.id+'" aria-label="حذف الدفعة">×</button></div>'; }).join("")+'</div>':'<p class="note">ما في دفعات مسجلة</p>')+'</div>';
    // الضمان
    var dp=r.deposit||{type:"none"};
    h+='<div class="panel pad" style="box-shadow:inset 0 0 0 1px var(--line-2)"><div class="sumline"><span>الضمان</span><b>'+(dp.type==="none"||!dp.type?'بدون ضمان':(dp.type==="cheque"?'شيك ضمان':'مبلغ تأمين')+(dp.amount?' · '+qar(dp.amount):''))+'</b></div>' +
      (dp.type==="cheque"&&(dp.number||dp.bank)?'<div class="sumline"><span>الشيك</span><b><bdi>'+esc([dp.number,dp.bank].filter(Boolean).join(" · "))+'</bdi></b></div>':'') +
      (dp.type&&dp.type!=="none"?'<div class="sumline"><span>الحالة</span><b>'+(dp.returned?'رجّعته للمستأجر':'لسا عندي')+'</b></div>':'')+'</div>';
    // التسليم
    var items=(r.items||[]).map(function(id){ var a=(m.accessories||[]).filter(function(x){ return x.id===id; })[0]; return a?a.name:null; }).filter(Boolean);
    if(items.length) h+='<div><div class="lbl" style="margin-bottom:6px">طلع معها</div><div class="cf-accs">'+items.map(function(n){ return '<span class="cf-chip">'+esc(n)+'</span>'; }).join("")+'</div>'+(r.missing&&r.missing.length?'<p class="note bad" style="margin-top:6px">ما رجع: '+r.missing.map(function(id){ var a=(m.accessories||[]).filter(function(x){ return x.id===id; })[0]; return a?esc(a.name):""; }).join("، ")+'</p>':'')+'</div>';
    if((r.photosOut||[]).length||(r.photosIn||[]).length) h+='<div class="grid2">'+((r.photosOut||[]).length?'<div><div class="lbl">صور التسليم</div><div class="cf-gal">'+r.photosOut.map(function(id){ return thumb(id,"cf-gimg"); }).join("")+'</div></div>':'<div></div>')+((r.photosIn||[]).length?'<div><div class="lbl">صور الاستلام</div><div class="cf-gal">'+r.photosIn.map(function(id){ return thumb(id,"cf-gimg"); }).join("")+'</div></div>':'')+'</div>';
    if(r.notes) h+='<p class="note">'+esc(r.notes)+'</p>';
    // أفعال
    var d=phone(r.contact);
    if(d) h+='<div class="btnrow"><a class="btn" style="background:var(--wa)" href="https://wa.me/'+d+'?text='+encodeURIComponent(renewMsg(r))+'" target="_blank" rel="noopener">'+I.wa+' تسأله عن التمديد</a>'+(mo.balance>0?'<a class="btn line" href="https://wa.me/'+d+'?text='+encodeURIComponent(payMsg(r))+'" target="_blank" rel="noopener">تذكير بالمبلغ</a>':'')+'<a class="btn line" href="tel:+'+d+'">'+I.tel+' اتصال</a></div>';
    else h+='<button type="button" class="btn line block" data-act="cfeditrental" data-id="'+r.id+'">إضافة رقم تواصل</button>';
    if(st!=="ended") h+='<div class="btnrow"><button type="button" class="btn soft" data-act="cfextend" data-id="'+r.id+'">تمديد '+PERIOD_ONE[r.period||"month"]+'</button><button type="button" class="btn dad" data-act="cfreturn" data-id="'+r.id+'">استلام الماكينة</button></div>';
    h+='<button type="button" class="btn line block" data-act="cfeditrental" data-id="'+r.id+'">تعديل الإيجار</button>';
    return h+'</div>';
  }
  function paySheet(s){
    var d=s.d, r=get(s.id)||{};
    return head('تسجيل دفعة', esc(r.company||r.tenant||"")) + '<div class="stack">' +
      '<div class="field"><label for="cp-a">المبلغ</label><input id="cp-a" class="big num" type="number" inputmode="numeric" min="0" data-in="amount" value="'+esc(d.amount)+'"></div>' +
      '<div class="grid2">'+field("cp-d","التاريخ","date",d.date,"date")+field("cp-n","ملاحظة","note",d.note,"text",{ph:"اختياري"})+'</div>' +
      '<div class="field"><span class="lbl">الطريقة</span>'+api.choice("method", d.method, [["Fawran","فوران"],["Cash","كاش"],["Cheque","شيك"],["Bank","تحويل"]])+'</div>' +
      '<button type="button" class="btn block" data-act="cfsavepay">حفظ الدفعة</button></div>';
  }
  function returnSheet(s){
    var d=s.d, r=get(s.id)||{}, m=get(r.machineId)||{}, items=(r.items||[]).map(function(id){ return (m.accessories||[]).filter(function(x){ return x.id===id; })[0]; }).filter(Boolean);
    var dp=r.deposit||{};
    return head('استلام الماكينة', esc(r.company||r.tenant||"")+' · <bdi>'+esc(m.name||"")+'</bdi>') + '<div class="stack">' +
      field("rt-d","تاريخ الاستلام","date",d.date,"date") +
      (items.length?'<div class="field"><span class="lbl">شيّك على الملحقات اللي رجعت</span><div class="cf-checks">'+items.map(function(a){ return '<label class="check"><input type="checkbox" data-back="'+a.id+'"'+(d.back.indexOf(a.id)>=0?' checked':'')+'>'+esc(a.name)+'</label>'; }).join("")+'</div></div>':'') +
      '<div class="field"><span class="lbl">صور الاستلام (حالة الماكينة وقت ما رجعت)</span>'+gallery(d.photosIn,"in")+'</div>' +
      (dp.type&&dp.type!=="none"?'<label class="check"><input type="checkbox" data-chk="depReturned"'+(d.depReturned?' checked':'')+'>رجّعت '+(dp.type==="cheque"?'شيك الضمان':'مبلغ التأمين')+' للمستأجر</label>':'') +
      '<div class="field"><label for="rt-n">ملاحظة على الحالة</label><textarea id="rt-n" data-in="note" placeholder="مثل: خدش بسيط على الجنب">'+esc(d.note||"")+'</textarea></div>' +
      '<button type="button" class="btn dad block" data-act="cfsavereturn">تأكيد الاستلام</button></div>';
  }
  function leadSheet(s){
    var d=s.d, h=head(s.id?'زبون بالانتظار':'زبون جديد بالانتظار','بده ماكينة وما في متاحة');
    h+='<div class="stack"><div class="grid2">'+field("l-c","الشركة","company",d.company,"text")+field("l-n","الاسم","name",d.name,"text") +
      field("l-p","رقم التواصل","contact",d.contact,"tel",{full:true,ph:"55512345"}) +
      field("l-w","شو بده","want",d.want,"text",{full:true,ph:"مثل: ماكينة 1 جروب لكافيه"}) +
      field("l-f","من تاريخ","from",d.from,"date") + field("l-b","الميزانية بالشهر","budget",d.budget,"number") + '</div>';
    h+='<div class="field"><span class="lbl">الحالة</span>'+api.choice("status", d.status, LEAD_ST)+'</div>';
    h+='<div class="field"><label for="l-no">ملاحظات</label><textarea id="l-no" data-in="notes">'+esc(d.notes||"")+'</textarea></div>';
    h+='<button type="button" class="btn block" data-act="cfsavelead">'+(s.id?'حفظ':'إضافة')+'</button>';
    if(s.id){
      var free=machines().filter(function(m){ return machineState(m)==="free"; });
      h+='<div class="btnrow"><button type="button" class="btn soft" data-act="cfleadrent" data-id="'+s.id+'"'+(free.length?'':' disabled')+'>تأجير'+(free.length?'':' (ما في متاحة)')+'</button><button type="button" class="btn line" data-act="cfleadbuy" data-id="'+s.id+'">اشتريت ماكينة إله</button></div>';
      h+='<button type="button" class="btn danger block" data-act="cfdellead">حذف</button>';
    }
    return h+'</div>';
  }
  function maintSheet(s){
    var d=s.d;
    return head('تسجيل صيانة','التكلفة بتنخصم من «رجعت حقها»') + '<div class="stack">' + field("mt-d","الوصف","desc",d.desc,"text",{ph:"مثل: تغيير جلدة البويلر"}) +
      '<div class="grid2">'+field("mt-c","التكلفة","cost",d.cost,"number")+field("mt-t","التاريخ","date",d.date,"date")+'</div>' +
      '<button type="button" class="btn block" data-act="cfsavemaint">حفظ</button></div>';
  }

  /* ================= الأفعال ================= */
  function act(a, el){
    var s=api.sheet(), id=el.getAttribute("data-id");
    switch(a){
      case "cfseg": case "cfgo": api.goTab("cf_"+el.getAttribute("data-v")); return true;
      case "cfshowended": C.showEnded=true; api.refresh(); return true;
      case "cfphoto": var t=el.getAttribute("data-t"), i=el.getAttribute("data-i"); pickPhoto(t, i==null?null:(i==="new"?"new":Number(i))); return true;
      case "cfrmphoto": var tt=el.getAttribute("data-t"), pid=el.getAttribute("data-id"), key=tt==="out"?"photosOut":"photosIn"; s.d[key]=(s.d[key]||[]).filter(function(x){ return x!==pid; }); api.renderSheet(); return true;

      case "cfnewmachine": api.openSheet({kind:"cfMachine", id:null, d:machineDraft()}); return true;
      case "cfopenmachine": api.openSheet({kind:"cfMachineView", id:id}); return true;
      case "cfeditmachine": api.openSheet({kind:"cfMachine", id:id, d:machineDraft(get(id))}); return true;
      case "cfaccadd": var nm=String(s.d.newAcc||"").trim(); if(!nm){ api.toast("اكتب اسم الملحق"); return true; } s.d.acc.push({id:uid("a_"), name:nm, photoId:s.d.newAccPhoto||null}); s.d.newAcc=""; s.d.newAccPhoto=null; api.renderSheet(); var f=document.getElementById("cf-accn"); if(f) f.focus(); return true;
      case "cfaccdel": s.d.acc.splice(Number(el.getAttribute("data-i")),1); api.renderSheet(); return true;
      case "cfsavemachine": saveMachine(); return true;
      case "cfdelmachine": var mm=get(s.id); if(activeRental(s.id)){ api.toast("الماكينة مؤجرة — سجّل استلامها أول"); return true; } if(confirm("حذف «"+(mm.name||"")+"»؟ سجل إيجاراتها بيضل محفوظ.")){ save(s.id,{deleted:true},"تم الحذف"); api.closeSheet(); } return true;
      case "cfnewmaint": api.openSheet({kind:"cfMaint", id:id, d:{desc:"", cost:"", date:today()}}); return true;
      case "cfsavemaint": var md=s.d; if(!String(md.desc).trim()||!(Number(md.cost)>=0)){ api.toast("اكتب الوصف والتكلفة"); return true; }
        var m1=get(s.id); save(s.id,{maintenance:(m1.maintenance||[]).concat({id:uid("mt_"), desc:String(md.desc).trim(), cost:Number(md.cost)||0, date:md.date||today()})}); api.openSheet({kind:"cfMachineView", id:s.id}); return true;
      case "cfdelmaint": var m2=get(id), xid=el.getAttribute("data-x"); if(confirm("حذف سجل الصيانة؟")) save(id,{maintenance:(m2.maintenance||[]).filter(function(x){ return x.id!==xid; })}); return true;

      case "cfnewrental": api.openSheet({kind:"cfRental", id:null, d:rentalDraft(null, {machineId:el.getAttribute("data-mid")||(machines().filter(function(m){ return machineState(m)==="free"; })[0]||{}).id||""})}); return true;
      case "cfopenrental": api.openSheet({kind:"cfRentalView", id:id}); return true;
      case "cfeditrental": api.openSheet({kind:"cfRental", id:id, d:rentalDraft(get(id))}); return true;
      case "cfsaverental": saveRental(); return true;
      case "cfdelrental": var rr=get(s.id); if(confirm("حذف إيجار «"+(rr.company||rr.tenant||"")+"» بكل دفعاته؟")){ save(s.id,{deleted:true},"تم الحذف"); api.closeSheet(); } return true;
      case "cfextend": var r1=get(id), ne=addPeriod(r1.end, r1.period||"month", 1); if(confirm("تمديد الإيجار لحد "+R.dmy(ne)+"؟")) save(id,{end:ne},"تم التمديد لحد "+R.dmy(ne)); return true;
      case "cfreturn": var r2=get(id); api.openSheet({kind:"cfReturn", id:id, d:{date:today(), back:(r2.items||[]).slice(), photosIn:[], depReturned:false, note:""}}); return true;
      case "cfsavereturn": saveReturn(); return true;
      case "cfpay": var r3=get(id); api.openSheet({kind:"cfPay", id:id, d:{amount:(money(r3).balance>0?money(r3).balance:(r3.rate||"")), date:today(), method:r3.payMethod||"Fawran", note:""}}); return true;
      case "cfsavepay": var pd=s.d, amt=Number(pd.amount)||0; if(!(amt>0)){ api.toast("اكتب المبلغ"); return true; }
        var r4=get(s.id); save(s.id,{payments:(r4.payments||[]).concat({id:uid("cp_"), amount:amt, date:pd.date||today(), method:pd.method||null, note:String(pd.note||"").slice(0,80)||null})},"تم تسجيل الدفعة"); api.openSheet({kind:"cfRentalView", id:s.id}); return true;
      case "cfdelpay": var r5=get(id), px=el.getAttribute("data-x"); if(confirm("حذف الدفعة؟")) save(id,{payments:(r5.payments||[]).filter(function(p){ return p.id!==px; })}); return true;

      case "cfnewlead": api.openSheet({kind:"cfLead", id:null, d:{name:"", company:"", contact:"", want:"", from:"", budget:"", status:"new", notes:""}}); return true;
      case "cfopenlead": var l=get(id); api.openSheet({kind:"cfLead", id:id, d:{name:l.name||"", company:l.company||"", contact:l.contact||"", want:l.want||"", from:l.from||"", budget:l.budget||"", status:l.status||"new", notes:l.notes||""}}); return true;
      case "cfsavelead": saveLead(); return true;
      case "cfdellead": if(confirm("حذف الزبون من القائمة؟")){ save(s.id,{deleted:true},"تم الحذف"); api.closeSheet(); } return true;
      case "cfleadrent": var l2=get(id), fm=machines().filter(function(m){ return machineState(m)==="free"; })[0]; api.openSheet({kind:"cfRental", id:null, d:rentalDraft(null,{machineId:fm?fm.id:"", tenant:l2.name, company:l2.company, contact:l2.contact, leadId:id})}); return true;
      case "cfleadbuy": var l3=get(id); save(id,{status:"bought"},false); C.afterMachineLead=id; api.openSheet({kind:"cfMachine", id:null, d:machineDraft({name:l3.want||""})}); api.toast("أضف الماكينة الجديدة، وبعدها بتنفتح صفحة الإيجار للزبون"); return true;
    }
    return false;
  }
  // حقول خاصة: صناديق الاختيار وأسماء الملحقات
  document.addEventListener("change", function(e){
    var s=api.sheet(); if(!s || !s.d || String(s.kind).indexOf("cf")!==0) return;
    var t=e.target;
    if(t.hasAttribute("data-chk")) s.d[t.getAttribute("data-chk")]=t.checked;
    if(t.hasAttribute("data-item")){ var it=t.getAttribute("data-item"); s.d.items=s.d.items.filter(function(x){ return x!==it; }); if(t.checked) s.d.items.push(it); }
    if(t.hasAttribute("data-back")){ var b=t.getAttribute("data-back"); s.d.back=s.d.back.filter(function(x){ return x!==b; }); if(t.checked) s.d.back.push(b); }
  });
  document.addEventListener("input", function(e){
    var s=api.sheet(); if(!s || !s.d || String(s.kind).indexOf("cf")!==0) return;
    var t=e.target;
    if(t.hasAttribute("data-acc")) s.d.acc[Number(t.getAttribute("data-acc"))].name=t.value;
    // تغيير البداية أو المدة بيحسب النهاية لحاله، إلا إذا عدّلت النهاية بإيدك
    if(s.kind==="cfRental"){
      var k=t.getAttribute("data-in");
      if(k==="end") s.d.endTouched=true;
      if(k==="start" && !s.d.endTouched && /^\d{4}-\d{2}-\d{2}$/.test(t.value)){ s.d.end=addPeriod(t.value, s.d.period, 1); var e2=document.getElementById("r-e"); if(e2) e2.value=s.d.end; }
      if(k==="rate"||k==="start"||k==="end"){ clearTimeout(C.rt); C.rt=setTimeout(function(){ var f=document.activeElement&&document.activeElement.id; api.renderSheet(); var x=f&&document.getElementById(f); if(x){ x.focus(); } }, 600); }
    }
  });
  // اختيار المدة أو الماكينة لازم يحدّث النهاية والملحقات
  function onPick(k){
    var s=api.sheet(); if(!s || s.kind!=="cfRental") return;
    if(k==="period" && !s.d.endTouched) s.d.end=addPeriod(s.d.start, s.d.period, 1);
    if(k==="machineId"){ var m=get(s.d.machineId); s.d.items=m?(m.accessories||[]).map(function(a){ return a.id; }):[]; }
  }

  function saveMachine(){
    var s=api.sheet(), d=s.d, name=String(d.name||"").trim();
    if(!name){ api.toast("اكتب اسم الماكينة"); return; }
    if(String(d.newAcc||"").trim()) d.acc.push({id:uid("a_"), name:String(d.newAcc).trim(), photoId:d.newAccPhoto||null});
    // «maintenance» = سجل الصيانة (مصفوفة) · «maintenanceOn» = الماكينة بالصيانة حاليًا
    var data={type:"cfMachine", name:name, color:String(d.color||"").trim()||null, serial:String(d.serial||"").trim()||null,
      purchasePrice:Number(d.purchasePrice)||null, purchaseDate:d.purchaseDate||null, photoId:d.photoId||null,
      accessories:d.acc.filter(function(a){ return String(a.name).trim(); }).map(function(a){ return {id:a.id, name:String(a.name).trim(), photoId:a.photoId||null}; }),
      maintenance:(get(s.id)||{}).maintenance||[], maintenanceOn:!!d.maintenanceOn, notes:String(d.notes||"").trim()||null};
    var mid=s.id||uid("cfm_"); if(!s.id) data.createdAt=new Date().toISOString();
    var stored=data;
    save(mid, stored, s.id?"تم الحفظ":"تمت إضافة الماكينة");
    if(!s.id && C.afterMachineLead){ var lid=C.afterMachineLead, l=get(lid); C.afterMachineLead=null; api.openSheet({kind:"cfRental", id:null, d:rentalDraft(null,{machineId:mid, tenant:l.name, company:l.company, contact:l.contact, leadId:lid})}); return; }
    api.openSheet({kind:"cfMachineView", id:mid});
  }
  function saveRental(){
    var s=api.sheet(), d=s.d;
    if(!d.machineId){ api.toast("اختر الماكينة"); return; }
    if(!String(d.company||d.tenant||"").trim()){ api.toast("اكتب اسم الشركة أو المستأجر"); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.start||"") || !/^\d{4}-\d{2}-\d{2}$/.test(d.end||"") || d.end<=d.start){ api.toast("تأكد من التاريخين: النهاية لازم تكون بعد البداية"); return; }
    var ex=get(s.id)||{};
    var data={type:"cfRental", machineId:d.machineId, tenant:String(d.tenant||"").trim()||null, company:String(d.company||"").trim()||null, contact:String(d.contact||"").trim()||null,
      start:d.start, end:d.end, period:d.period||"month", rate:Number(d.rate)||null, payMethod:d.payMethod||null,
      deposit:{type:d.depType||"none", amount:Number(d.depAmount)||null, number:String(d.depNo||"").trim()||null, bank:String(d.depBank||"").trim()||null, returned:!!(ex.deposit&&ex.deposit.returned)},
      items:d.items||[], photosOut:d.photosOut||[], notes:String(d.notes||"").trim()||null, status:ex.status||"active", payments:ex.payments||[], leadId:d.leadId||null};
    var rid=s.id||uid("cfr_"); if(!s.id) data.createdAt=new Date().toISOString();
    save(rid, data, s.id?"تم الحفظ":"تم تسجيل الإيجار");
    if(d.leadId && !s.id) save(d.leadId, {status:"rented", rentalId:rid}, false);
    api.openSheet({kind:"cfRentalView", id:rid});
  }
  function saveReturn(){
    var s=api.sheet(), d=s.d, r=get(s.id);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date||"")){ api.toast("اختر تاريخ الاستلام"); return; }
    var missing=(r.items||[]).filter(function(x){ return d.back.indexOf(x)<0; });
    if(missing.length && !confirm("في "+missing.length+" ملحق ما رجع. تأكيد الاستلام هيك؟")) return;
    var dep=Object.assign({}, r.deposit||{}); if(d.depReturned) dep.returned=true;
    save(s.id, {status:"ended", returnedAt:d.date, photosIn:d.photosIn||[], missing:missing, returnNote:String(d.note||"").trim()||null, deposit:dep,
      notes:[r.notes, d.note?("الاستلام: "+String(d.note).trim()):null].filter(Boolean).join("\n")||null}, "تم استلام الماكينة");
    api.openSheet({kind:"cfRentalView", id:s.id});
  }
  function saveLead(){
    var s=api.sheet(), d=s.d;
    if(!String(d.name||d.company||"").trim()){ api.toast("اكتب الاسم أو الشركة"); return; }
    var data={type:"cfLead", name:String(d.name||"").trim()||null, company:String(d.company||"").trim()||null, contact:String(d.contact||"").trim()||null,
      want:String(d.want||"").trim()||null, from:d.from||null, budget:Number(d.budget)||null, status:d.status||"new", notes:String(d.notes||"").trim()||null};
    var lid=s.id||uid("cfl_"); if(!s.id) data.createdAt=new Date().toISOString();
    save(lid, data); api.closeSheet();
  }

  /* ---------------- Excel ---------------- */
  function sheetRows(){
    var rows=[["الماكينة","المستأجر","الشركة","الرقم","من","لحد","المدة","السعر","المستحق لحد اليوم","المدفوع","الباقي","الضمان","الحالة"]];
    rentals().forEach(function(r){ var m=get(r.machineId)||{}, mo=money(r), dp=r.deposit||{};
      rows.push([m.name||"", r.tenant||"", r.company||"", r.contact||"", r.start||"", r.returnedAt||r.end||"", PERIOD[r.period||"month"], mo.rate||"", mo.dueNow, mo.paid, mo.balance,
        dp.type==="cheque"?"شيك "+(dp.amount||""):(dp.type==="cash"?"تأمين "+(dp.amount||""):"بدون"), STATE_TXT[rentalState(r)]]); });
    rows.push([], ["الماكينة","سعر الشراء","الصيانة","حصّلت","الباقي لترجع حقها","النسبة","الإشغال"]);
    machines().forEach(function(m){ var p=payback(m); rows.push([m.name||"", p.cost||"", p.maint, p.got, p.left, p.costKnown?Math.round(p.pct*100)+"%":"", Math.round(p.occ*100)+"%"]); });
    var ls=leads(); if(ls.length){ rows.push([], ["زبون بالانتظار","الشركة","الرقم","شو بده","من تاريخ","الحالة"]); ls.forEach(function(l){ rows.push([l.name||"", l.company||"", l.contact||"", l.want||"", l.from||"", leadStText(l.status)]); }); }
    return rows;
  }

  /* ---------------- البيانات الأولية (مرة وحدة) ----------------
     الماكينتين المؤجرتين زي ما بعتهم يوسف بـ16 نوفمبر 2026.
     الأسماء والأرقام وسعر الثانية بتنعبّى من الموقع. */
  var SEED_ID="2026-11-16-coffee-seed", seedTried=false;
  async function seed(){
    if(seedTried || !(api.store.fresh.people && api.store.fresh.settings)) return;
    var st=S().settings||{}; if((st.dataFixes||{})[SEED_ID] || all("cfMachine").length) return;
    seedTried=true;
    var now=new Date().toISOString();
    var m1={type:"cfMachine", name:"Wega Polaris 2 Group", color:"أسود", groups:2, purchasePrice:10000, createdAt:now,
      accessories:[{id:"a_m1h",name:"2 هاندل (Portafilter)"},{id:"a_m1t",name:"تامبر (Tamper)"}], maintenance:[]};
    var m2={type:"cfMachine", name:"Wega Polaris 1 Group", groups:1, purchasePrice:null, createdAt:new Date(Date.now()+1).toISOString(),
      accessories:[{id:"a_m2h",name:"2 هاندل لامارزوكو (سنغل ودبل)"},{id:"a_m2g",name:"مطحنة JAS"},{id:"a_m2t",name:"تامبر (Tamper)"},{id:"a_m2d",name:"موزّع (Distributor)"}], maintenance:[]};
    var r1={type:"cfRental", machineId:"cfm_seed1", start:"2026-10-25", end:"2026-11-25", period:"month", rate:2000, payMethod:"Fawran",
      deposit:{type:"none"}, items:["a_m1h","a_m1t"], payments:[], status:"active", createdAt:now};
    var r2={type:"cfRental", machineId:"cfm_seed2", start:"2026-11-16", end:"2026-12-16", period:"month", rate:null, payMethod:null,
      deposit:{type:"none"}, items:["a_m2h","a_m2g","a_m2t","a_m2d"], payments:[], status:"active", createdAt:now};
    var w=[{col:"people",id:"cfm_seed1",data:m1},{col:"people",id:"cfm_seed2",data:m2},{col:"people",id:"cfr_seed1",data:r1},{col:"people",id:"cfr_seed2",data:r2}];
    try{
      await api.store.batch(w);
      var done=Object.assign({}, st.dataFixes||{}); done[SEED_ID]=now;
      await api.saveSettings({dataFixes:done}, true);
    }catch(e){ seedTried=false; }
  }

  return { view:view, sheet:sheet, act:act, onPick:onPick, alerts:function(){ return alerts(false); }, summaryLine:summaryLine, sheetRows:sheetRows, seed:seed,
    isCoffee:function(p){ return p && /^cf/.test(String(p.type||"")); } };
};
})();
