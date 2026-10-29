/* Bonely Store | Firebase (Firestore + Auth)
   Script comum (sem type=module). Carrega o SDK por import() e expõe window.FB.
   Carregar ANTES do app.js. Se algo falhar, FB.on fica false e o app avisa. */
(function(){
const ADMIN_EMAIL='bonelystore@gmail.com'; // único e-mail autorizado no painel (igual ao das regras)
const V='13.0.0',B='https://www.gstatic.com/firebasejs/'+V+'/';
const cfg={
  apiKey:"AIzaSyD9bZsll8fK-2aNhwie6K_C7Ak6KYyC6Cw",
  authDomain:"bonely-store.firebaseapp.com",
  projectId:"bonely-store",
  storageBucket:"bonely-store.firebasestorage.app",
  messagingSenderId:"12397749769",
  appId:"1:12397749769:web:4cc1d3075d630d8eb2bad8"
};
const FB=window.FB={on:false,admin:false,loaded:false,user:null,onerr:null};
let db,auth,F,U,listening=false,tm=0;
const snap={};            // coleção -> Map(docId -> json canônico), para gravar só o que mudou
const SYNC=['products','combos','orders','moves','shares','expenses','coupons'];
const keyOf={products:x=>String(x.id),combos:x=>String(x.id),orders:x=>x.fid||x.id,moves:x=>x._id,shares:x=>x._id,expenses:x=>String(x.id),coupons:x=>x.code};

const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort().reduce((o,k)=>(o[k]=x[k],o),{}):x);
const clean=x=>JSON.parse(JSON.stringify(x));
const col=n=>F.collection(db,n), dref=(n,i)=>F.doc(db,n,i);
const H=async s=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(s||'').trim().toLowerCase()));return [...new Uint8Array(b)].slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('')};
const ph10=s=>String(s||'').replace(/\D/g,'').slice(-10);
const num=id=>parseInt(String(id).replace(/\D/g,''),10)||0;

FB.ready=(async()=>{
  try{
    if(!(window.crypto&&crypto.subtle))throw new Error('Precisa de HTTPS');
    const [A,Fs,Au]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-firestore.js'),import(B+'firebase-auth.js')]);
    F=Fs;U=Au;
    const app=A.initializeApp(cfg);
    db=F.getFirestore(app);auth=U.getAuth(app);
    await new Promise(r=>{const un=U.onAuthStateChanged(auth,u=>{un();setUser(u);r()})});
    FB.on=true;
  }catch(e){console.warn('Firebase indisponível',e);FB.on=false}
})();
function setUser(u){FB.user=u||null;FB.admin=!!(u&&String(u.email||'').toLowerCase()===ADMIN_EMAIL)}

/* ---------- vitrine (público) ---------- */
FB.loadPublic=async()=>{
  const [p,c,s]=await Promise.all([F.getDocs(col('products')),F.getDocs(col('combos')),F.getDoc(dref('settings','public'))]);
  const by=(a,b)=>(a.id||0)-(b.id||0);
  return{products:p.docs.map(d=>d.data()).sort(by),combos:c.docs.map(d=>d.data()).sort(by),pub:s.exists()?s.data():null};
};
/* cupons: a loja só consegue ler UM cupom por código (get), nunca listar */
FB.getCoupon=async code=>{const s=await F.getDoc(dref('coupons',code));return s.exists()?s.data():null};
FB.couponInfo=async(code,email)=>{
  const [u,m]=await Promise.all([
    F.getDoc(dref('couponUse',code)).catch(()=>null),
    email?H(email).then(eh=>F.getDoc(dref('couponUsers',code+'_'+eh))).catch(()=>null):Promise.resolve(null)]);
  return{n:u&&u.exists()?(u.data().n||0):0,mine:!!(m&&m.exists())};
};
FB.nextSeq=()=>F.runTransaction(db,async t=>{
  const r=dref('counters','orders'),s=await t.get(r),n=(s.exists()?s.data().seq:1000)+1;
  t.set(r,{seq:n});return n;
});
FB.placeOrder=async(o,c)=>{
  const eh=await H(c.email),fid=o.id+'_'+eh;
  o.fid=fid;
  const ph=ph10(c.phone),pk=ph.length===10?await H(ph):'';
  const [cs,ps]=await Promise.all([F.getDoc(dref('customers',eh)),pk?F.getDoc(dref('phoneIdx',pk)):Promise.resolve(null)]);
  const b=F.writeBatch(db);
  b.set(dref('orders',fid),clean(o));
  b.set(dref('customers',eh),{name:c.name||'',email:c.email,phone:c.phone||'',addr:c.addr==='Retirada na loja'?'':(c.addr||''),orderIds:F.arrayUnion(o.id)},{merge:true});
  if(pk&&!(ps&&ps.exists()))b.set(dref('phoneIdx',pk),{eh});
  if(o.coupon&&o.coupon.code){const cc=o.coupon.code;b.set(dref('couponUse',cc),{n:F.increment(1)},{merge:true});if(o.coupon.once)b.set(dref('couponUsers',cc+'_'+eh),{ts:o.ts,order:o.id})}
  await b.commit();
};
FB.findCustomer=async v=>{
  v=String(v||'').trim();if(!v)return null;
  let eh;
  if(v.includes('@'))eh=await H(v);
  else{const p=ph10(v);if(p.length<10)return null;const i=await F.getDoc(dref('phoneIdx',await H(p)));if(!i.exists())return null;eh=i.data().eh}
  const s=await F.getDoc(dref('customers',eh));
  return s.exists()?s.data():null;
};
FB.getOrder=async(id,email)=>{
  const s=await F.getDoc(dref('orders',id+'_'+await H(email)));
  return s.exists()?s.data():null;
};
FB.myOrders=async c=>{
  if(!c||!c.email)return [];
  const eh=await H(c.email);
  const r=await Promise.all((c.orderIds||[]).map(i=>F.getDoc(dref('orders',i+'_'+eh)).then(s=>s.exists()?s.data():null).catch(()=>null)));
  return r.filter(Boolean).sort((a,b)=>(b.ts||0)-(a.ts||0));
};

/* ---------- painel (admin) ---------- */
FB.errMsg=e=>{
  const c=String(e&&e.code||e&&e.message||'');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c))return 'E-mail ou senha incorretos.';
  if(/too-many/.test(c))return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if(/not-admin/.test(c))return 'Esta conta não tem acesso ao painel.';
  if(/network/.test(c))return 'Sem conexão. Verifique a internet.';
  return 'Não foi possível entrar agora.';
};
FB.login=async(email,pw)=>{
  const r=await U.signInWithEmailAndPassword(auth,String(email||'').trim(),pw||'');
  setUser(r.user);
  if(!FB.admin){await U.signOut(auth);setUser(null);throw new Error('not-admin')}
};
FB.confirmPw=async pw=>{
  const u=auth.currentUser;
  if(!FB.admin||!u)throw new Error('not-admin');
  await U.reauthenticateWithCredential(u,U.EmailAuthProvider.credential(u.email,String(pw||'')));
};
FB.logout=async()=>{try{await U.signOut(auth)}catch(e){}setUser(null);FB.loaded=false};
/* token da sessão (a página /midily envia para o /api/midily provar que é a dona da loja) */
FB.token=async()=>auth&&auth.currentUser?auth.currentUser.getIdToken():'';
FB.loadAdmin=async S=>{
  const names=[...SYNC,'customers'];
  const [res,sp,sa,cn]=await Promise.all([
    Promise.all(names.map(n=>F.getDocs(col(n)))),
    F.getDoc(dref('settings','public')),F.getDoc(dref('settings','admin')),F.getDoc(dref('counters','orders'))]);
  names.forEach((n,i)=>{S[n]=res[i].docs.map(d=>d.data())});
  const byId=(a,b)=>(a.id||0)-(b.id||0),byTs=(a,b)=>(b.ts||0)-(a.ts||0);
  S.products.sort(byId);S.combos.sort(byId);S.orders.sort(byTs);S.moves.sort(byTs);S.shares.sort(byTs);S.expenses.sort(byTs);S.coupons.sort(byTs);
  const pub=sp.exists()?sp.data():{},adm=sa.exists()?sa.data():{};
  S.colls=pub.colls||[];S.cfg=pub.cfg||{};
  S.goals=adm.goals||{};S.goal=adm.goal||0;S.seen=adm.seen||[];
  S.seq=Math.max(cn.exists()?cn.data().seq:1000,...S.orders.map(o=>num(o.id)));
  SYNC.forEach(n=>{const m=snap[n]=new Map();S[n].forEach(x=>m.set(keyOf[n](x),canon(x)))});
  snap.pub=canon({colls:S.colls,cfg:S.cfg});snap.adm=canon({goals:S.goals,goal:S.goal,seen:S.seen});snap.cnt=canon({seq:S.seq});
  FB.loaded=true;
};
FB.queue=S=>{clearTimeout(tm);tm=setTimeout(()=>FB.flush(S),300)};
FB.flush=async S=>{
  if(!FB.on||!FB.admin||!FB.loaded)return;
  const ops=[],now=Date.now();
  for(const n of SYNC){
    const arr=S[n]||[],sn=snap[n]||(snap[n]=new Map()),seen=new Set();
    arr.forEach((x,i)=>{
      if(n==='moves'||n==='shares'){if(!x._id)x._id=now.toString(36)+Math.random().toString(36).slice(2,7);if(!x.ts)x.ts=now-i}
      const id=keyOf[n](x),j=canon(x);seen.add(id);
      if(sn.get(id)!==j){ops.push(['set',n,id,clean(x)]);sn.set(id,j)}
    });
    [...sn.keys()].forEach(id=>{if(!seen.has(id)){ops.push(['del',n,id]);sn.delete(id)}});
  }
  const one=(k,c,id,d)=>{const j=canon(d);if(snap[k]!==j){ops.push(['set',c,id,clean(d)]);snap[k]=j}};
  one('pub','settings','public',{colls:S.colls||[],cfg:S.cfg||{}});
  one('adm','settings','admin',{goals:S.goals||{},goal:S.goal||0,seen:S.seen||[]});
  one('cnt','counters','orders',{seq:S.seq||1000});
  try{
    for(let i=0;i<ops.length;i+=400){
      const b=F.writeBatch(db);
      ops.slice(i,i+400).forEach(([t,c,id,d])=>t==='set'?b.set(dref(c,id),d):b.delete(dref(c,id)));
      await b.commit();
    }
  }catch(e){console.error('Falha ao salvar na nuvem',e);if(FB.onerr)FB.onerr(e)}
};
/* pedidos novos chegam em tempo real no painel */
FB.listen=(S,cb)=>{
  if(listening||!FB.admin)return;listening=true;
  F.onSnapshot(col('orders'),sn=>{
    let add=0,chg=0;const m=snap.orders||(snap.orders=new Map());
    sn.docChanges().forEach(ch=>{
      if(ch.doc.metadata.hasPendingWrites)return;
      const id=ch.doc.id,d=ch.doc.data(),i=S.orders.findIndex(o=>(o.fid||o.id)===id);
      if(ch.type==='removed'){if(i>=0){S.orders.splice(i,1);chg++}m.delete(id);return}
      const j=canon(d);
      if(i<0){S.orders.unshift(d);add++}
      else if(m.get(id)!==j){S.orders[i]=d;chg++}
      m.set(id,j);S.seq=Math.max(S.seq||0,num(d.id));
    });
    if(add||chg){S.orders.sort((a,b)=>(b.ts||0)-(a.ts||0));if(cb)cb(add,chg)}
  },e=>console.warn('listener',e));
};
})();
