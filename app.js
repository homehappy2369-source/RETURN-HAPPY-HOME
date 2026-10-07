const $=s=>document.querySelector(s);
let db=null,master=new Map(),rets=[],cur=null,jenis="",pend=null;
const mem={master:[],ret:[]};

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(()=>e.classList.remove("on"),2200)}
function openDB(){return new Promise((res,rej)=>{try{const r=indexedDB.open("returnhh",1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore("master",{keyPath:"key"});d.createObjectStore("ret",{keyPath:"id",autoIncrement:true})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
function run(store,mode,fn){return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
const getAll=st=>db?run(st,"readonly",s=>s.getAll()):Promise.resolve(mem[st]);

async function init(){
 try{db=await openDB()}catch(e){db=null;toast("Penyimpanan browser tidak tersedia. Data hilang saat halaman ditutup.")}
 const m=await getAll("master");m.forEach(r=>master.set(r.key,r));
 rets=await getAll("ret");render();$("#scan").focus();
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function fmt(ts){const d=new Date(ts);return{tgl:d.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"}),jam:d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).replace(/\./g,":")}}

/* Tab */
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
 ["input","data","master"].forEach(t=>$("#t-"+t).classList.toggle("hide",t!==b.dataset.t));
 if(b.dataset.t==="input")$("#scan").focus();
});

/* Input */
function lookup(){
 const v=$("#scan").value.trim();
 const box=$("#item");
 if(!v){cur=null;box.className="item";box.innerHTML='<span class="k">Barang akan tampil di sini setelah kode di-scan.</span>';upd();return}
 cur=master.get(v)||master.get(v.toUpperCase())||null;
 if(cur){box.className="item";box.innerHTML='<div class="k">Kode '+esc(cur.kode)+'</div><div class="n">'+esc(cur.nama)+'</div>'}
 else{box.className="item bad";box.innerHTML=master.size?'<div class="n">Kode tidak ditemukan</div><div class="k">Periksa kode, atau import master barang terbaru.</div>':'<div class="n">Master barang masih kosong</div><div class="k">Import file Excel di tab Master barang.</div>'}
 upd();
}
function getJumlah(){
 const n=Number.parseInt($("#jumlah").value,10);
 return Number.isFinite(n)&&n>=1?n:0;
}
function upd(){$("#simpan").disabled=!(cur&&jenis&&getJumlah()>=1)}
$("#scan").addEventListener("input",lookup);
$("#scan").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookup();if(cur)$("#jumlah").focus()}});
$("#jumlah").addEventListener("input",upd);
$("#jumlah").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#ket").focus()}});
$("#ket").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();simpan()}});
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{jenis=b.dataset.j;document.querySelectorAll(".seg button").forEach(x=>x.setAttribute("aria-pressed",x===b));upd()});
$("#simpan").onclick=simpan;
async function simpan(){
 if(!cur||!jenis)return;
 const jumlah=getJumlah();
 if(jumlah<1){toast("Jumlah minimal 1");$("#jumlah").focus();return}
 const r={ts:new Date().toISOString(),kode:cur.kode,nama:cur.nama,jumlah,jenis,ket:$("#ket").value.trim()};
 try{
  if(db){r.id=await run("ret","readwrite",s=>s.add(r))}else{r.id=Date.now();mem.ret.push(r)}
  rets.push(r);toast("Tersimpan: "+r.nama+" ("+r.jumlah+" pcs)");
  $("#scan").value="";$("#jumlah").value="1";$("#ket").value="";lookup();render();$("#scan").focus();
 }catch(e){toast("Gagal menyimpan. Coba lagi.")}
}

/* Data */
function render(){
 const q=$("#cari").value.trim().toLowerCase(),fj=$("#fj").value;
 const list=rets.filter(r=>(!fj||r.jenis===fj)&&(!q||(r.kode+" "+r.nama+" "+r.ket).toLowerCase().includes(q))).sort((a,b)=>b.ts.localeCompare(a.ts));
 const show=list.slice(0,300);
 $("#cnt").textContent=list.length?(list.length.toLocaleString("id-ID")+" data"+(list.length>show.length?", menampilkan 300 terbaru. Export memuat semua data.":"")):"Belum ada data return.";
 $("#tb").innerHTML=show.map(r=>{const f=fmt(r.ts);return"<tr><td>"+f.tgl+"</td><td>"+f.jam+"</td><td>"+esc(r.kode)+"</td><td>"+esc(r.nama)+'</td><td>'+Number(r.jumlah||1).toLocaleString("id-ID")+'</td><td><span class="tag '+(r.jenis==="Pecah Belah"?"p":"b")+'">'+esc(r.jenis)+"</span></td><td>"+esc(r.ket)+'</td><td><button class="x" data-d="'+r.id+'">Hapus</button></td></tr>'}).join("");
}
$("#cari").oninput=render;$("#fj").onchange=render;
$("#tb").onclick=async e=>{
 const btn=e.target.closest("[data-d]");if(!btn)return;
 if(!btn.dataset.arm){
  document.querySelectorAll("[data-arm]").forEach(x=>{delete x.dataset.arm;x.textContent="Hapus"});
  btn.dataset.arm="1";btn.textContent="Yakin hapus?";
  setTimeout(()=>{if(btn.isConnected&&btn.dataset.arm){delete btn.dataset.arm;btn.textContent="Hapus"}},3000);
  return;
 }
 const n=Number(btn.dataset.d);
 if(db)await run("ret","readwrite",s=>s.delete(n));else mem.ret=mem.ret.filter(r=>r.id!==n);
 rets=rets.filter(r=>r.id!==n);render();toast("Dihapus");
};

/* Export */
async function exportXlsx(j,name){
 const rows=rets.filter(r=>r.jenis===j).sort((a,b)=>a.ts.localeCompare(b.ts));
 if(!rows.length){toast("Belum ada data untuk diexport");return}
 const aoa=[["Tanggal","Jam","Kode Barang","Nama Barang","Jumlah","Jenis Return","Keterangan"]].concat(rows.map(r=>{const f=fmt(r.ts);return[f.tgl,f.jam,String(r.kode),r.nama,Number(r.jumlah||1),r.jenis,r.ket]}));
 const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:12},{wch:10},{wch:16},{wch:44},{wch:10},{wch:20},{wch:36}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Return");
 const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
 const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
 try{
  const dl=window.claude&&await claude.use("downloads");
  if(dl){await dl.save({filename:name,data:blob});toast("File siap disimpan")}
  else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove()}
 }catch(e){if(!e||e.code!=="declined")toast("Export gagal. Coba lagi.")}
}
$("#exP").onclick=()=>exportXlsx("Pecah Belah","EXPORT RETURN PECAH BELAH.xlsx");
$("#exB").onclick=()=>exportXlsx("Bukan Pecah Belah","EXPORT RETURN BUKAN PECAH BELAH.xlsx");

/* Import master */
$("#file").onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""});
  let h=rows.findIndex(r=>r.filter(c=>String(c).trim()!=="").length>=2);
  if(h<0)throw 0;
  pend={rows:rows.slice(h+1),head:rows[h].map((c,i)=>String(c).trim()||"Kolom "+(i+1))};
  const opt=(sel,none)=>(none?'<option value="-1">Tidak dipakai</option>':"")+pend.head.map((c,i)=>'<option value="'+i+'">'+esc(c)+"</option>").join("");
  $("#mk").innerHTML=opt();$("#mnm").innerHTML=opt();$("#mb").innerHTML=opt(0,1);
  const g=(re,ex)=>pend.head.findIndex((c,i)=>re.test(c)&&i!==ex);
  const n=g(/nama|name|deskripsi|description/i,-1);
  const k=g(/kode|code|plu|sku/i,n);
  const b=g(/barcode|bar code/i,-1);
  $("#mnm").value=n>=0?n:Math.min(1,pend.head.length-1);$("#mk").value=k>=0?k:0;$("#mb").value=b>=0?b:-1;
  $("#mInfo").textContent=pend.rows.length.toLocaleString("id-ID")+" baris terbaca. Periksa kolom di atas sebelum import.";
  $("#map").classList.remove("hide");
 }catch(err){toast("File tidak bisa dibaca. Pastikan format Excel.")}
};
$("#imp").onclick=async()=>{
 if(!pend)return;
 const ik=+$("#mk").value,inm=+$("#mnm").value,ib=+$("#mb").value;
 const m=new Map();
 pend.rows.forEach(r=>{
  const kode=String(r[ik]??"").trim(),nama=String(r[inm]??"").trim();
  if(!kode||!nama)return;
  const rec={key:kode,kode,nama};m.set(kode,rec);
  if(ib>=0){const bc=String(r[ib]??"").trim();if(bc&&!m.has(bc))m.set(bc,{key:bc,kode,nama})}
 });
 if(!m.size){toast("Tidak ada baris valid. Cek pilihan kolom.");return}
 try{
  const arr=[...m.values()];
  if(db)await run("master","readwrite",s=>{s.clear();arr.forEach(x=>s.put(x))});else mem.master=arr;
  master=m;pend=null;$("#map").classList.add("hide");$("#file").value="";
  render();toast(arr.length.toLocaleString("id-ID")+" data master masuk");
 }catch(err){toast("Import gagal. Coba lagi.")}
};
init();
