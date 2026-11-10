/* =====================================================================
   دفتر الإيجارات — منطق الحساب المشترك
   نفس الملف يستخدمه الدفتر (index.html) وصفحة الوالد (father.html)،
   فالأرقام عند الطرفين دائمًا واحدة.
   لا يكتب أي شيء على قاعدة البيانات — حسابات فقط.
   ===================================================================== */
(function(){
  "use strict";

  var AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  var EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // الرصيد المتأخر عند المستأجر يترحّل للشهر التالي ابتداءً من هذا الشهر
  var ARREARS_START_MONTH = "2026-09";
  // الحساب مع الوالد بلّش بالموقع من نوفمبر 2026 (يمكن تغييره من الإعدادات)
  var SETTLE_FLOOR = "2026-11";
  var TERM_MONTHS = { month:1, "6":6, year:12 };

  var DEFAULT_SETTINGS = {
    currency:"QAR", storeAEYousefPct:1, store1to8YousefPct:0.5, store1to8FatherPct:0.5,
    aeYousefExpense:5500, oteYousefExpense:3000, fatherOteExpense:3000,
    motherGiftExpense:1500, internetExpense:250, monthlyExtras:{}
  };

  // ---------- مخطط الهنجرين (قياسات فعلية بالمتر) ----------
  var PLAN = {
    ae:{ w:10, h:37.4, group:"AE", label:"هنجر A – E", side:"الغربي",
      cells:[
        {id:"E", x:0, y:0,    w:10, h:4},
        {id:"D", x:0, y:4.2,  w:6,  h:8.2},
        {id:"C", x:0, y:12.6, w:6,  h:8.2},
        {id:"B", x:0, y:21,   w:6,  h:8.2},
        {id:"A", x:0, y:29.4, w:5,  h:8}
      ]},
    ote:{ w:14.5, h:40.1, group:"ONE_TO_EIGHT", label:"هنجر 1 – 8", side:"الشرقي",
      corridor:{x:5.5, y:12.7, w:3.5, h:27.4},
      cells:[
        {id:"8", x:0,    y:0,    w:7.25, h:12.5},
        {id:"7", x:7.25, y:0,    w:7.25, h:12.5},
        {id:"6", x:0,    y:12.7, w:5.5,  h:9},
        {id:"5", x:9,    y:12.7, w:5.5,  h:9},
        {id:"4", x:0,    y:21.9, w:5.5,  h:9},
        {id:"3", x:9,    y:21.9, w:5.5,  h:9},
        {id:"2", x:0,    y:31.1, w:5.5,  h:9},
        {id:"1", x:9,    y:31.1, w:5.5,  h:9}
      ]}
  };

  // ---------- أدوات عامة ----------
  function pad2(n){ return String(n).padStart(2,"0"); }
  function monthKeyNow(){ var d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1); }
  function todayISO(){ var d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function shiftMonth(mk,delta){
    var p=mk.split("-"), d=new Date(parseInt(p[0],10), parseInt(p[1],10)-1+delta, 1);
    return d.getFullYear()+"-"+pad2(d.getMonth()+1);
  }
  function monthLabel(mk, lang){
    if(!/^\d{4}-\d{2}$/.test(mk||"")) return "";
    var p=mk.split("-");
    return (lang==="en"?EN_MONTHS:AR_MONTHS)[parseInt(p[1],10)-1]+" "+p[0];
  }
  function monthName(mk){ return AR_MONTHS[parseInt(mk.split("-")[1],10)-1]; }
  function isFutureMonth(mk){ return mk>monthKeyNow(); }
  function num(v){ return Math.round(Number(v)||0); }
  function fmtPlain(n){ return num(n).toLocaleString("en-US"); }
  function fmt(n){ return fmtPlain(n)+" ر.ق"; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function digitsOf(v){ return String(v||"").replace(/[^0-9]/g,""); }
  function dmy(iso){ return iso ? String(iso).slice(0,10).split("-").reverse().join("/") : ""; }
  function dayMonth(iso){ if(!iso) return ""; var p=String(iso).slice(0,10).split("-"); return parseInt(p[2],10)+" "+AR_MONTHS[parseInt(p[1],10)-1]; }

  // ---------- محرّك الحساب: يُنشأ على حالة البيانات ----------
  function Ledger(state){
    // state = {people:{}, payments:{}, settings:{}}
    var L = {};
    function S(){ return Object.assign({}, DEFAULT_SETTINGS, state.settings||{}); }
    function setting(k){ var s=state.settings||{}; return s[k]!=null ? s[k] : DEFAULT_SETTINGS[k]; }
    L.setting = setting;

    function list(filter){
      return Object.keys(state.people).map(function(id){ return Object.assign({id:id}, state.people[id]); })
        .filter(filter||function(){ return true; })
        .sort(function(a,b){ return (a.order||0)-(b.order||0); });
    }
    L.people = function(){ return list(function(p){ return !p.trashed; }); };
    L.trashed = function(){ return list(function(p){ return !!p.trashed; }); };
    L.person = function(id){ return state.people[id] ? Object.assign({id:id}, state.people[id]) : null; };

    function payDoc(pid,m){ return state.payments[pid+"__"+m]||null; }
    function sumPaid(pid,m){ var d=payDoc(pid,m); return d ? (Number(d.amountPaid)||0) : 0; }
    L.payDoc = payDoc; L.sumPaid = sumPaid;

    // المستأجر الجديد لا يُحتسب عليه شيء قبل شهر بدايته، والمنتهي لا يُحتسب عليه بعد شهر نهايته
    function beforeStart(p,m){ return !!(p && p.startMonth && m<p.startMonth && !payDoc(p.id,m)); }
    function afterEnd(p,m){ return !!(p && p.endMonth && m>p.endMonth && !payDoc(p.id,m)); }
    function inOccupancy(p,m){
      if(!m) return !p.archived;
      if(afterEnd(p,m)) return false;
      if(p.prevTenantId && beforeStart(p,m)) return false;
      return true;
    }
    L.beforeStart = beforeStart; L.afterEnd = afterEnd;

    L.stores = function(group, month){
      return L.people().filter(function(p){
        return p.type==="store" && (!group || p.group===group) && p.active!==false && inOccupancy(p,month);
      });
    };
    L.commitments = function(month){
      return L.people().filter(function(p){
        return p.type==="partner" && p.active!==false && !(month && (beforeStart(p,month)||afterEnd(p,month)));
      });
    };
    L.allStores = function(){ return L.people().filter(function(p){ return p.type==="store" && p.active!==false; }); };

    function baseRequired(p,m){
      if(beforeStart(p,m)||afterEnd(p,m)) return 0;
      var d=payDoc(p.id,m);
      return d && d.billedAmount!=null ? Number(d.billedAmount)||0 : (Number(p.rent)||0);
    }
    function carryover(p,m){
      if(m<=ARREARS_START_MONTH) return 0;
      var prev=shiftMonth(m,-1);
      if(prev<ARREARS_START_MONTH) return 0;
      if(p.startMonth && prev<p.startMonth) return 0;
      if(prev>=monthKeyNow()) return 0;   // لا يُرحَّل إلا شهر انتهى فعلًا
      return outstanding(p,prev);
    }
    function required(p,m){ return beforeStart(p,m)||afterEnd(p,m) ? 0 : baseRequired(p,m)+carryover(p,m); }
    function outstanding(p,m){
      var d=payDoc(p.id,m);
      if(d && d.paid===true) return 0;
      return Math.max(0, required(p,m)-sumPaid(p.id,m));
    }
    L.baseRequired = baseRequired; L.carryover = carryover; L.required = required; L.outstanding = outstanding;

    // الحالة: paid مدفوع · partial جزئي · late متأخر · due مستحق قريبًا · upcoming شهر قادم
    L.status = function(p,m){
      var d=payDoc(p.id,m), req=required(p,m), paid=sumPaid(p.id,m);
      if(d && (d.paid===true || (d.paid!==false && paid>=req && req>0))) return "paid";
      if(req===0 && paid===0 && p.type==="store") return "paid";
      if(paid>0) return "partial";
      var now=monthKeyNow();
      if(m>now) return "upcoming";
      if(m<now) return "late";
      if(p.dueDay && new Date().getDate()>p.dueDay) return "late";
      return "due";
    };
    L.STATUS_TEXT = {paid:"مدفوع", partial:"دفع جزء", late:"متأخر", due:"مستحق", upcoming:"قادم", vacant:"شاغر"};

    L.receiverOf = function(d){
      if(!d) return null;
      if(d.receiver==="father"||d.receiver==="me") return d.receiver;
      // دفعات قديمة سُجّلت بحقل التخالص القديم
      if(d.settle==="f2y"||d.settle==="landlord") return "father";
      if(d.settle==="y2f") return "me";
      return null;
    };
    L.yousefPct = function(p){ return p.group==="AE" ? setting("storeAEYousefPct") : setting("store1to8YousefPct"); };

    // تحويل قديم مسجّل على صف الدفعة نفسها (النظام القديم) — يُحتسب ولا يُنشأ جديد منه
    L.legacyFwd = function(d, p){
      var m=d&&d.fwdMode, paid=Number(d&&d.amountPaid)||0, r=L.receiverOf(d);
      if(!(m==="share"||m==="full"||m==="part") || !(paid>0) || !r || !p) return 0;
      if(m==="full") return paid;
      if(m==="part") return Math.max(0, Math.min(paid, Number(d.fwd)||0));
      var yp=L.yousefPct(p);
      return r==="me" ? Math.round(paid*(1-yp)) : Math.round(paid*yp);
    };

    // ---------- ملخص الشهر ----------
    L.monthSummary = function(m){
      var stores=L.stores(null,m), out={expected:0, collected:0, outstanding:0, count:stores.length,
        paid:[], unpaid:[], byGroup:{AE:{expected:0,collected:0}, ONE_TO_EIGHT:{expected:0,collected:0}}};
      stores.forEach(function(p){
        var req=required(p,m), got=sumPaid(p.id,m), st=L.status(p,m), g=out.byGroup[p.group]||(out.byGroup[p.group]={expected:0,collected:0});
        out.expected+=req; out.collected+=got; g.expected+=req; g.collected+=got;
        var row={p:p, status:st, required:req, paidAmt:got, left:outstanding(p,m), doc:payDoc(p.id,m)};
        if(st==="paid") out.paid.push(row); else { out.unpaid.push(row); out.outstanding+=row.left; }
      });
      var order={late:0, partial:1, due:2, upcoming:3};
      out.unpaid.sort(function(a,b){ return (order[a.status]-order[b.status]) || b.left-a.left; });
      out.paid.sort(function(a,b){ return String((b.doc&&b.doc.paymentDate)||"").localeCompare(String((a.doc&&a.doc.paymentDate)||"")); });
      out.rate = out.expected>0 ? out.collected/out.expected : 0;
      return out;
    };

    // ---------- الأرباح ----------
    function varExpenses(m){
      var v=(state.settings||{}).variableExpenses, a=v&&v[m];
      return Array.isArray(a) ? a.filter(function(x){ return x && (x.by==="yousef"||x.by==="father"||x.by==="split") && Number(x.amount)>0; }) : [];
    }
    function varShare(m, who){ return varExpenses(m).reduce(function(a,x){ return a+(x.by===who?Number(x.amount):(x.by==="split"?Number(x.amount)/2:0)); },0); }
    L.varExpenses = varExpenses; L.varShare = varShare;

    L.shares = function(m){
      var ae=L.allStores().filter(function(p){ return p.group==="AE"; }),
          ote=L.allStores().filter(function(p){ return p.group==="ONE_TO_EIGHT"; });
      var aeC=ae.reduce(function(a,p){ return a+sumPaid(p.id,m); },0), oteC=ote.reduce(function(a,p){ return a+sumPaid(p.id,m); },0);
      var aeB=ae.reduce(function(a,p){ return a+required(p,m); },0), oteB=ote.reduce(function(a,p){ return a+required(p,m); },0);
      var ex=((state.settings||{}).monthlyExtras||{})[m]||{};
      var yAE=setting("storeAEYousefPct"), yOTE=setting("store1to8YousefPct"), fOTE=setting("store1to8FatherPct");
      var yCosts=[
        {label:"إيجار A–E للوالد", amount:setting("aeYousefExpense")},
        {label:"إيجار 1–8 للوالد", amount:setting("oteYousefExpense")},
        {label:"هدية الوالدة", amount:setting("motherGiftExpense")},
        {label:"الإنترنت", amount:setting("internetExpense")}
      ];
      if(Number(ex.yousef)>0) yCosts.push({label:ex.label||"مصروف خاص بالشهر", amount:Number(ex.yousef)});
      varExpenses(m).forEach(function(x){ var a=x.by==="yousef"?Number(x.amount):(x.by==="split"?Number(x.amount)/2:0); if(a>0) yCosts.push({label:x.desc+(x.by==="split"?" (النصف)":""), amount:a, variable:true}); });
      var fCosts=[{label:"إيجار 1–8", amount:setting("fatherOteExpense")}];
      if(Number(ex.father)>0) fCosts.push({label:ex.label||"مصروف خاص بالشهر", amount:Number(ex.father)});
      varExpenses(m).forEach(function(x){ var a=x.by==="father"?Number(x.amount):(x.by==="split"?Number(x.amount)/2:0); if(a>0) fCosts.push({label:x.desc+(x.by==="split"?" (النصف)":""), amount:a, variable:true}); });
      function total(arr){ return arr.reduce(function(a,x){ return a+x.amount; },0); }
      var yGross=aeC*yAE+oteC*yOTE, yPot=aeB*yAE+oteB*yOTE, fGross=oteC*fOTE, fPot=oteB*fOTE;
      return {
        aeCollected:aeC, oteCollected:oteC, aeBilled:aeB, oteBilled:oteB, pct:{yAE:yAE,yOTE:yOTE,fOTE:fOTE},
        yousef:{gross:yGross, potential:yPot, costs:yCosts, net:yGross-total(yCosts), potentialNet:yPot-total(yCosts)},
        father:{gross:fGross, potential:fPot, costs:fCosts, net:fGross-total(fCosts), potentialNet:fPot-total(fCosts)}
      };
    };

    // ---------- الحساب مع الوالد ----------
    // معادلة واحدة لكل شهر:
    //   حق الوالد  = المبلغ الثابت (5,500 + 3,000) + حصته من دفعات مخازن 1–8
    //   مع الوالد  = كل الدفعات اللي قبضها الوالد بإيده
    //   الفرق       = مع الوالد − حق الوالد      (موجب: الزيادة ليوسف عند الوالد · سالب: يوسف عليه للوالد)
    //   بعد التحويلات: الوالد حوّل ليوسف ينقص الفرق، يوسف حوّل للوالد يزيده
    L.fatherFixed = function(){ return {ae:setting("aeYousefExpense"), ote:setting("oteYousefExpense"), total:setting("aeYousefExpense")+setting("oteYousefExpense")}; };

    L.transfers = function(m){
      var out=[], v=(state.settings||{}).settleTransfers, a=v&&v[m];
      if(Array.isArray(a)) a.forEach(function(x){
        if(x && (x.dir==="f2y"||x.dir==="y2f") && Number(x.amount)>0) out.push({id:x.id, dir:x.dir, amount:Number(x.amount), date:x.date||"", method:x.method||"", note:x.note||"", source:"manual"});
      });
      Object.keys(state.payments).forEach(function(k){
        var d=state.payments[k]; if(!d || d.month!==m) return;
        var p=state.people[d.personId]; if(!p || p.type!=="store") return;
        var amt=L.legacyFwd(d, Object.assign({id:d.personId},p)); if(!(amt>0)) return;
        out.push({id:"row:"+k, dir:L.receiverOf(d)==="me"?"y2f":"f2y", amount:amt, date:d.fwdDate||d.paymentDate||"", method:"", note:"من دفعة "+p.name, source:"row", payKey:k});
      });
      out.sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
      return out;
    };

    L.settleStart = function(){
      var s=(state.settings||{}).settleStart;
      return /^\d{4}-\d{2}$/.test(s||"") ? s : SETTLE_FLOOR;
    };

    L.fatherMonth = function(m){
      var fixed=L.fatherFixed(), shareIncome=0, withFather=0, withMe=0, unknown=[], lines=[];
      Object.keys(state.payments).forEach(function(k){
        var d=state.payments[k]; if(!d || d.month!==m) return;
        var raw=state.people[d.personId]; if(!raw || raw.type!=="store") return;
        var p=Object.assign({id:d.personId}, raw), paid=Number(d.amountPaid)||0; if(!(paid>0)) return;
        var fShare=Math.round(paid*(1-L.yousefPct(p))), r=L.receiverOf(d);
        shareIncome+=fShare;
        if(r==="father") withFather+=paid; else if(r==="me") withMe+=paid; else unknown.push(p);
        lines.push({p:p, paid:paid, fatherShare:fShare, receiver:r, date:d.paymentDate||""});
      });
      lines.sort(function(a,b){ return String(a.date||"9").localeCompare(String(b.date||"9")); });
      var tr=L.transfers(m), f2y=0, y2f=0;
      tr.forEach(function(x){ if(x.dir==="f2y") f2y+=x.amount; else y2f+=x.amount; });
      var entitled=fixed.total+shareIncome, diff=withFather-entitled;
      return {month:m, fixed:fixed, shareIncome:shareIncome, entitled:entitled, withFather:withFather, withMe:withMe,
        diff:diff, transfers:tr, f2y:f2y, y2f:y2f, balance:diff-f2y+y2f, unknown:unknown, lines:lines,
        counted: m>=L.settleStart()};
    };

    // كشف الحساب الجاري مع الوالد: من شهر البداية حتى الشهر المطلوب (لا يتجاوز الشهر الحالي)
    L.fatherAccount = function(uptoMonth){
      var start=L.settleStart(), now=monthKeyNow(), end=uptoMonth&&uptoMonth<now?uptoMonth:now, rows=[], run=0, mk=start, g=0;
      while(mk<=end && g<240){ var r=L.fatherMonth(mk); run+=r.balance; r.running=run; rows.push(r); mk=shiftMonth(mk,1); g++; }
      return {start:start, rows:rows, balance:run};
    };
    // جملة واضحة: مين لازم يحوّل لمين وقديش
    L.balanceText = function(v, who){
      v=Math.round(v);
      if(Math.abs(v)<1) return {dir:"zero", text:"الحساب مسكّر — ما حدا إله عند الثاني"};
      if(who==="father") return v>0 ? {dir:"f2y", amount:v, text:"يوسف إله عندك "+fmt(v)} : {dir:"y2f", amount:-v, text:"إلك عند يوسف "+fmt(-v)};
      return v>0 ? {dir:"f2y", amount:v, text:"إلك عند الوالد "+fmt(v)} : {dir:"y2f", amount:-v, text:"عليك للوالد "+fmt(-v)};
    };

    // ---------- العقود ----------
    L.renewal = function(p){
      if(!p.contractStart||!p.contractTerm||p.contractTerm==="month") return null;
      var months=TERM_MONTHS[p.contractTerm]; if(!months) return null;
      var start=new Date(p.contractStart+"T00:00:00"); if(isNaN(start.getTime())) return null;
      var now=new Date(), ren=new Date(start.getTime()), g=0;
      while(ren.getTime()<=now.getTime() && g<600){ ren.setMonth(ren.getMonth()+months); g++; }
      if(g>1){ var prev=new Date(ren.getTime()); prev.setMonth(prev.getMonth()-months); if(now-prev<=60*86400000) ren=prev; }
      var daysLeft=Math.round((ren-now)/86400000), act=new Date(ren.getTime()); act.setMonth(act.getMonth()-1);
      return {date:ren, daysLeft:daysLeft, actionDate:act, actionDaysLeft:Math.round((act-now)/86400000)};
    };

    // ---------- المخطط والإشغال ----------
    function tokens(name){
      var core=String(name||"").replace(/store|stores|مخزن|مخازن/ig," ");
      return (core.match(/\d+|[A-Za-z]/g)||[]).map(function(x){ return x.toUpperCase(); });
    }
    function cellMatches(p, id){ id=String(id).toUpperCase(); return p.unit ? String(p.unit).toUpperCase()===id : tokens(p.name).indexOf(id)>=0; }
    L.allCells = function(){
      return PLAN.ae.cells.map(function(c){ return {id:c.id, group:"AE"}; }).concat(PLAN.ote.cells.map(function(c){ return {id:c.id, group:"ONE_TO_EIGHT"}; }));
    };
    L.cellGroup = function(id){ var c=L.allCells().filter(function(x){ return x.id===String(id).toUpperCase(); })[0]; return c?c.group:null; };
    L.personForCell = function(id, m){
      var arr=L.stores(null,m).filter(function(p){ return cellMatches(p,id); });
      for(var i=0;i<arr.length;i++) if(!beforeStart(arr[i],m)) return arr[i];
      return arr[0]||null;
    };
    L.unitFor = function(p){
      if(p.unit) return String(p.unit).toUpperCase();
      var cells=L.allCells().filter(function(c){ return c.group===p.group; });
      for(var i=0;i<cells.length;i++){ var hit=L.personForCell(cells[i].id, monthKeyNow()); if(hit && hit.id===p.id) return cells[i].id; }
      return null;
    };
    L.occupancy = function(m){
      var cells=L.allCells(), vacant=[];
      cells.forEach(function(c){ if(!L.stores(c.group,m).filter(function(p){ return cellMatches(p,c.id) && !beforeStart(p,m); }).length) vacant.push(c.id); });
      return {total:cells.length, occupied:cells.length-vacant.length, vacant:vacant};
    };

    // ---------- كشف حساب مستأجر ----------
    L.statement = function(p){
      var now=monthKeyNow(), ms=[];
      Object.keys(state.payments).forEach(function(k){ var d=state.payments[k]; if(d && d.personId===p.id && /^\d{4}-\d{2}$/.test(String(d.month))) ms.push(d.month); });
      ms.sort();
      var first=ms[0]||null; if(p.startMonth && (!first||p.startMonth<first)) first=p.startMonth; if(!first) first=now;
      var last=(p.endMonth && p.endMonth<now) ? p.endMonth : now, months=[], mk=first, g=0;
      while(mk<=last && g<600){ months.push(mk); mk=shiftMonth(mk,1); g++; }
      ms.forEach(function(x){ if(x>last && months.indexOf(x)<0) months.push(x); });
      var bal=0, tD=0, tP=0;
      var rows=months.map(function(x){
        var d=payDoc(p.id,x), due=baseRequired(p,x), paid=sumPaid(p.id,x); tD+=due; tP+=paid; bal+=due-paid;
        return {month:x, due:due, paid:paid, date:(d&&d.paymentDate)||"", method:(d&&d.method)||"", balance:bal, advance:x>now};
      });
      return {rows:rows, totalDue:tD, totalPaid:tP, balance:tD-tP};
    };

    L.monthsWithData = function(){
      var now=monthKeyNow(), set={}; set[now]=true;
      Object.keys(state.payments).forEach(function(k){ var m=state.payments[k].month; if(m && m<=now) set[m]=true; });
      return Object.keys(set).sort();
    };
    return L;
  }

  // ---------- مخطط SVG ----------
  // يُرسم بمقياس واحد للهنجرين. اللون الواضح محجوز للمتأخر.
  function planSVG(L, month, opts){
    opts=opts||{};
    var gap=2.2, padX=0.4, ae=PLAN.ae, ote=PLAN.ote;
    var W=ae.w+gap+ote.w, H=Math.max(ae.h, ote.h)+3.2, out="";
    function block(b, ox){
      var s='<text x="'+(ox+b.w/2)+'" y="1.5" text-anchor="middle" class="pl-cap">'+b.label+'</text>';
      var oy=2.6;
      s+='<rect x="'+ox+'" y="'+oy+'" width="'+b.w+'" height="'+b.h+'" rx=".5" class="pl-shell"/>';
      if(b.corridor) s+='<rect x="'+(ox+b.corridor.x)+'" y="'+(oy+b.corridor.y)+'" width="'+b.corridor.w+'" height="'+b.corridor.h+'" class="pl-corr"/>';
      b.cells.forEach(function(c){
        var p=L.personForCell(c.id, month), st=p ? L.status(p, month) : "vacant";
        var x=ox+c.x+.18, y=oy+c.y+.18, w=c.w-.36, h=c.h-.36, cx=x+w/2, cy=y+h/2;
        var act=p && opts.clickable ? ' data-act="openpay" data-pid="'+p.id+'" tabindex="0" role="button" aria-label="'+esc(p.name)+' — '+L.STATUS_TEXT[st]+'"' : '';
        s+='<g class="pl-cell st-'+st+'"'+act+'><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx=".35"/>' +
          '<text x="'+cx+'" y="'+(cy+(h>6?-.2:.55))+'" text-anchor="middle" class="pl-id">'+c.id+'</text>' +
          (h>6?'<text x="'+cx+'" y="'+(cy+1.9)+'" text-anchor="middle" class="pl-st">'+L.STATUS_TEXT[st]+'</text>':'') +
          (st==="paid"?'<path class="pl-tick" d="M'+(x+w-1.9)+' '+(y+1.15)+' l.5 .5 l1 -1"/>':'') +
        '</g>';
      });
      return s;
    }
    // نرسم كالواقع: الهنجر الغربي (A–E) يسار والشرقي (1–8) يمين — لذلك svg.plan اتجاهه ltr
    out+=block(ae, padX);
    out+=block(ote, padX+ae.w+gap);
    out+='<text x="'+padX+'" y="'+(H-.2)+'" class="pl-dir">غرب</text><text x="'+(W+padX)+'" y="'+(H-.2)+'" text-anchor="end" class="pl-dir">شرق</text>';
    return '<svg class="plan" viewBox="0 0 '+(W+padX*2)+' '+H+'" role="img" aria-label="مخطط المخازن — '+monthLabel(month)+'">'+out+'</svg>';
  }

  window.RL = {
    Ledger:Ledger, planSVG:planSVG, PLAN:PLAN, DEFAULT_SETTINGS:DEFAULT_SETTINGS,
    ARREARS_START_MONTH:ARREARS_START_MONTH, SETTLE_FLOOR:SETTLE_FLOOR,
    AR_MONTHS:AR_MONTHS, EN_MONTHS:EN_MONTHS,
    monthKeyNow:monthKeyNow, todayISO:todayISO, shiftMonth:shiftMonth, monthLabel:monthLabel, monthName:monthName,
    isFutureMonth:isFutureMonth, fmt:fmt, fmtPlain:fmtPlain, esc:esc, digitsOf:digitsOf, dmy:dmy, dayMonth:dayMonth
  };
})();
