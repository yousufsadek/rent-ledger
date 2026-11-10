/* =====================================================================
   طبقة البيانات: Firebase (تسجيل دخول + مزامنة لحظية)، أو تخزين محلي
   إذا كان firebase-config.js فارغًا. مشتركة بين الدفتر وصفحة الوالد.
   ===================================================================== */
(function(){
  "use strict";
  var FIREBASE_VER = "10.12.2", LOCAL_KEY = "rentbook_data";

  function loadScript(src){
    return new Promise(function(res, rej){ var s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }

  // نسخة محلية بنفس واجهة Firestore المستخدمة هنا
  function LocalDB(){
    var data={people:{}, payments:{}, meta:{}, audit:{}}, subs={};
    function load(){ try{ var raw=localStorage.getItem(LOCAL_KEY); if(raw){ var d=JSON.parse(raw); data={people:d.people||{}, payments:d.payments||{}, meta:d.meta||{}, audit:d.audit||{}}; } }catch(e){} }
    function emit(c){ (subs[c]||[]).forEach(function(f){ f(); }); }
    function listen(c, fn){ (subs[c]=subs[c]||[]).push(fn); fn(); return function(){ subs[c]=subs[c].filter(function(x){ return x!==fn; }); }; }
    function ref(col, id){
      return {
        set:function(v){ (data[col]=data[col]||{})[id]=clone(v);
          if(col==="audit"){ var ks=Object.keys(data.audit).sort(); while(ks.length>200) delete data.audit[ks.shift()]; }
          localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); emit(col); return Promise.resolve(); },
        onSnapshot:function(cb){ return listen(col, function(){ var c=data[col]||{}; cb({exists:c.hasOwnProperty(id), data:function(){ return clone(c[id]); }}); }); }
      };
    }
    load();
    window.addEventListener("storage", function(e){ if(e.key===LOCAL_KEY){ load(); Object.keys(subs).forEach(emit); } });
    return {
      local:true,
      collection:function(col){ return {
        doc:function(id){ return ref(col,id); },
        onSnapshot:function(cb){ return listen(col, function(){ var c=data[col]||{}; cb({metadata:{}, docs:Object.keys(c).map(function(id){ return {id:id, data:function(){ return clone(c[id]); }}; })}); }); }
      }; },
      doc:function(path){ var p=path.split("/"); return ref(p[0], p[1]); },
      batchSet:function(writes){ writes.forEach(function(w){ (data[w.col]=data[w.col]||{})[w.id]=clone(w.data); }); localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); ["people","payments","meta"].forEach(emit); return Promise.resolve(); }
    };
  }

  /* opts: {onChange(state), onAuth(user|null), onError(code), audit:bool} */
  function Store(opts){
    var S = {state:{people:{}, payments:{}, settings:{}, audit:[]}, mode:null, user:null, db:null, ready:false, fresh:{}, auditDenied:false};
    var unsubs=[];
    function changed(){ opts.onChange && opts.onChange(S); }
    function stop(){ unsubs.forEach(function(u){ try{ u(); }catch(e){} }); unsubs=[]; }
    function subscribe(){
      stop(); S.ready=false; S.fresh={};
      var got={};
      function err(e){ if(e && e.code==="permission-denied"){ opts.onError && opts.onError("perm"); } }
      function mark(key, snap){ got[key]=true; S.fresh[key]=!(snap && snap.metadata && snap.metadata.fromCache); if(got.people&&got.payments&&got.settings) S.ready=true; changed(); }
      unsubs.push(S.db.collection("people").onSnapshot(function(snap){ var m={}; snap.docs.forEach(function(d){ m[d.id]=d.data(); }); S.state.people=m; mark("people",snap); }, err));
      unsubs.push(S.db.collection("payments").onSnapshot(function(snap){ var m={}; snap.docs.forEach(function(d){ m[d.id]=d.data(); }); S.state.payments=m; mark("payments",snap); }, err));
      unsubs.push(S.db.doc("meta/settings").onSnapshot(function(snap){ S.state.settings=snap.exists?(snap.data()||{}):{}; mark("settings",snap); }, err));
      if(opts.audit){
        try{
          var col=S.db.collection("audit"), q=typeof col.orderBy==="function" ? col.orderBy("at","desc").limit(60) : col;
          unsubs.push(q.onSnapshot(function(snap){
            var arr=snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
            arr.sort(function(a,b){ return String(b.at||"").localeCompare(String(a.at||"")); });
            S.state.audit=arr.slice(0,60); S.auditDenied=false; changed();
          }, function(e){ if(e && e.code==="permission-denied"){ S.auditDenied=true; changed(); } }));
        }catch(e){}
      }
    }
    S.init = async function(){
      var cfg=window.FIREBASE_CONFIG;
      if(!(cfg && cfg.apiKey)){ S.mode="local"; S.db=LocalDB(); S.user={email:"local"}; opts.onAuth && opts.onAuth(S.user); subscribe(); return; }
      S.mode="cloud";
      try{
        var base="https://www.gstatic.com/firebasejs/"+FIREBASE_VER+"/";
        await loadScript(base+"firebase-app-compat.js");
        await Promise.all([loadScript(base+"firebase-auth-compat.js"), loadScript(base+"firebase-firestore-compat.js")]);
        if(!firebase.apps.length) firebase.initializeApp(cfg);
      }catch(e){ opts.onError && opts.onError("load"); return; }
      var fs=firebase.firestore();
      if(cfg.emulatorHost){ firebase.auth().useEmulator("http://"+cfg.emulatorHost+":9099"); fs.useEmulator(cfg.emulatorHost, 8080); }
      try{ await fs.enablePersistence({synchronizeTabs:true}); }catch(e){}
      firebase.auth().onAuthStateChanged(function(user){
        S.user=user||null;
        if(!user){ stop(); S.db=null; S.ready=false; S.state.people={}; S.state.payments={}; opts.onAuth && opts.onAuth(null); return; }
        S.db=fs; opts.onAuth && opts.onAuth(user); subscribe();
      });
    };
    S.login = async function(email, password, remember){
      var P=firebase.auth.Auth.Persistence;
      await firebase.auth().setPersistence(remember ? P.LOCAL : P.SESSION);
      await firebase.auth().signInWithEmailAndPassword(email, password);
    };
    S.resetPassword = function(email){ return firebase.auth().sendPasswordResetEmail(email); };
    S.logout = async function(){
      if(S.mode!=="cloud"){ location.reload(); return; }
      try{ await firebase.auth().signOut(); }catch(e){}
      try{ var fs=firebase.firestore(); await fs.terminate(); await fs.clearPersistence(); }catch(e){}
      location.reload();
    };
    S.idToken = function(){ return (S.mode==="cloud" && firebase.auth().currentUser) ? firebase.auth().currentUser.getIdToken() : Promise.reject({code:"login"}); };

    // ---------- كتابة ----------
    S.set = function(col, id, data){ return S.db ? S.db.collection(col).doc(id).set(data) : Promise.reject(new Error("no db")); };
    S.setSettings = function(data){ return S.db ? S.db.doc("meta/settings").set(data) : Promise.reject(new Error("no db")); };
    S.batch = async function(writes){
      if(S.db.batchSet) return S.db.batchSet(writes);
      for(var i=0;i<writes.length;i+=400){
        var b=S.db.batch();
        writes.slice(i,i+400).forEach(function(w){ b.set(w.col==="meta" ? S.db.doc("meta/"+w.id) : S.db.collection(w.col).doc(w.id), w.data); });
        await b.commit();
      }
    };
    return S;
  }

  window.RLStore = Store;
  window.RLLoadScript = loadScript;
})();
