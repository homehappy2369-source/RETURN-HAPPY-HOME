const $=s=>document.querySelector(s);
let db=null,master=new Map(),rets=[],archives=[],cur=null,jenis="",pend=null;
const DAY_CUTOFF_HOUR=22;
const mem={master:[],ret:[]};

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(()=>e.classList.remove("on"),2200)}
function openDB(){return new Promise((res,rej)=>{try{const r=indexedDB.open("returnhh",2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("master"))d.createObjectStore("master",{keyPath:"key"});if(!d.objectStoreNames.contains("ret"))d.createObjectStore("ret",{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains("archive"))d.createObjectStore("archive",{keyPath:"id",autoIncrement:true})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
function run(store,mode,fn){return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
const getAll=st=>db?run(st,"readonly",s=>s.getAll()):Promise.resolve(mem[st]);

async function init(){
 try{db=await openDB()}catch(e){db=null;toast("Penyimpanan browser tidak tersedia. Data hilang saat halaman ditutup.")}
 const m=await getAll("master");m.forEach(r=>master.set(r.key,r));
 rets=await getAll("ret");archives=await getAll("archive");await rollover();render();renderArchive();$("#scan").focus();setInterval(rollover,60000);
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function fmt(ts){const d=new Date(ts);return{tgl:d.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"}),jam:d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).replace(/\./g,":")}}

/* Tab */
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
 ["input","data","archive","master"].forEach(t=>$("#t-"+t).classList.toggle("hide",t!==b.dataset.t));if(b.dataset.t==="data")render();if(b.dataset.t==="archive")renderArchive();
 if(b.dataset.t==="input")$("#scan").focus();
});

/* Input */
function lookup(){
 const v=$("#scan").value.trim(),box=$("#item"),sug=$("#suggestions");
 if(!v){cur=null;sug.classList.add("hide");sug.innerHTML="";box.className="item";box.innerHTML='<span class="k">Barang akan tampil di sini setelah kode di-scan atau dipilih dari pencarian.</span>';upd();return}
 cur=master.get(v)||master.get(v.toUpperCase())||null;
 if(cur){sug.classList.add("hide");sug.innerHTML="";box.className="item";box.innerHTML='<div class="k">Kode '+esc(cur.kode)+'</div><div class="n">'+esc(cur.nama)+'</div>'}
 else{const q=v.toLowerCase();const found=[...new Map([...master.values()].map(x=>[x.kode,x])).values()].filter(x=>(x.nama+" "+x.kode).toLowerCase().includes(q)).slice(0,12);sug.innerHTML=found.map(x=>'<button type="button" class="suggest" data-k="'+esc(x.kode)+'"><strong>'+esc(x.nama)+'</strong><span>'+esc(x.kode)+'</span></button>').join("");sug.classList.toggle("hide",!found.length);box.className="item bad";box.innerHTML=master.size?'<div class="n">Pilih barang dari hasil pencarian</div><div class="k">Ketik sebagian nama atau kode barang.</div>':'<div class="n">Master barang masih kosong</div><div class="k">Import file Excel di tab Master barang.</div>'}
 upd();
}
function getJumlah(){const n=Number.parseInt($("#jumlah").value,10);return Number.isFinite(n)&&n>=1?n:0}
function upd(){$("#simpan").disabled=!(cur&&jenis&&getJumlah()>=1)}
$("#scan").addEventListener("input",lookup);
$("#scan").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookup();if(cur)$("#jumlah").focus()}});
$("#suggestions").onclick=e=>{const b=e.target.closest("[data-k]");if(!b)return;const x=master.get(b.dataset.k);if(!x)return;cur=x;$("#scan").value=x.nama;$("#suggestions").classList.add("hide");$("#suggestions").innerHTML="";lookup();$("#jumlah").focus()};
$("#jumlah").addEventListener("input",upd);$("#jumlah").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#ket").focus()}});$("#ket").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();simpan()}});
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{jenis=b.dataset.j;document.querySelectorAll(".seg button").forEach(x=>x.setAttribute("aria-pressed",x===b));upd()});
$("#simpan").onclick=simpan;
async function simpan(){
 if(!cur||!jenis)return;
 const jumlah=getJumlah();if(jumlah<1){toast("Jumlah minimal 1");return}
 const r={ts:new Date().toISOString(),kode:cur.kode,nama:cur.nama,jumlah,jenis,status:"Belum Diambil",ket:$("#ket").value.trim()};
 try{
  if(db){r.id=await run("ret","readwrite",s=>s.add(r))}else{r.id=Date.now();mem.ret.push(r)}
  rets.push(r);toast("Tersimpan: "+r.nama);
  $("#scan").value="";$("#jumlah").value="1";$("#ket").value="";lookup();render();$("#scan").focus();
 }catch(e){toast("Gagal menyimpan. Coba lagi.")}
}

/* Data */
function render(){
 const q=$("#cari").value.trim().toLowerCase(),fj=$("#fj").value;
 const list=rets.filter(r=>(!fj||r.jenis===fj)&&(!q||(r.kode+" "+r.nama+" "+r.ket).toLowerCase().includes(q))).sort((a,b)=>b.ts.localeCompare(a.ts));
 const show=list.slice(0,300);
 $("#cnt").textContent=list.length?(list.length.toLocaleString("id-ID")+" data"+(list.length>show.length?", menampilkan 300 terbaru. Export memuat semua data.":"")):"Belum ada data return.";
 $("#tb").innerHTML=show.map(r=>{const f=fmt(r.ts);return "<tr><td>"+f.tgl+"</td><td>"+f.jam+"</td><td>"+esc(r.kode)+"</td><td>"+esc(r.nama)+"</td><td>"+Number(r.jumlah||1).toLocaleString("id-ID")+"</td><td><span class=\"tag "+(r.jenis==="Pecah Belah"?"p":r.jenis==="Barang Service"?"s":"b")+"\">"+esc(r.jenis)+"</span></td><td><button class=\"check "+(r.status==="Sudah Diambil"?"done":"")+"\" data-check=\""+r.id+"\">"+(r.status==="Sudah Diambil"?"✓ Sudah diambil":"☐ Belum diambil")+"</button></td><td>"+esc(r.ket)+"</td><td><button class=\"x\" data-d=\""+r.id+"\">Hapus</button></td></tr>"}).join("");
}
$("#cari").oninput=render;$("#fj").onchange=render;
$("#tb").onclick=async e=>{
 const cb=e.target.closest("[data-check]");if(cb){const r=rets.find(x=>x.id===Number(cb.dataset.check));if(!r)return;r.status=r.status==="Sudah Diambil"?"Belum Diambil":"Sudah Diambil";if(db)await run("ret","readwrite",s=>s.put(r));render();return;}
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

/* Arsip otomatis setiap jam 22.00 */
function dkey(ts){const d=new Date(ts);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
async function rollover(){const n=new Date();if(n.getHours()<22)return;const today=dkey(n),last=localStorage.getItem("returnhh_rollover");if(last===today)return;const rows=rets.filter(r=>dkey(r.ts)===today);if(rows.length){const cp=rows.map(r=>({...r,originalId:r.id,archivedAt:n.toISOString()}));if(db)await run("archive","readwrite",s=>cp.forEach(x=>s.add(x)));archives.push(...cp);const ids=new Set(rows.map(r=>r.id));if(db)await run("ret","readwrite",s=>rows.forEach(r=>s.delete(r.id)));rets=rets.filter(r=>!ids.has(r.id));toast(rows.length+" data dipindahkan ke arsip")}localStorage.setItem("returnhh_rollover",today);render();renderArchive()}
function renderArchive(){const a=[...archives].sort((x,y)=>(y.archivedAt||y.ts).localeCompare(x.archivedAt||x.ts));$("#arcCnt").textContent=a.length?a.length.toLocaleString("id-ID")+" data arsip":"Belum ada arsip return.";$("#ta").innerHTML=a.map(r=>{const f=fmt(r.ts);return "<tr><td>"+fmt(r.archivedAt||r.ts).tgl+"</td><td>"+f.tgl+"</td><td>"+f.jam+"</td><td>"+esc(r.kode)+"</td><td>"+esc(r.nama)+"</td><td>"+Number(r.jumlah||1).toLocaleString("id-ID")+"</td><td>"+esc(r.jenis)+"</td><td>"+esc(r.status||"Belum Diambil")+"</td><td>"+esc(r.ket)+"</td><td><button class=\"x\" data-ad=\""+r.id+"\">Hapus</button></td></tr>"}).join("")}
$("#ta").onclick=async e=>{const b=e.target.closest("[data-ad]");if(!b)return;const id=Number(b.dataset.ad);if(!confirm("Hapus data arsip ini?"))return;if(db)await run("archive","readwrite",s=>s.delete(id));archives=archives.filter(r=>r.id!==id);renderArchive();toast("Arsip dihapus")};
$("#clearA").onclick=async()=>{if(!archives.length)return;if(!confirm("Hapus semua arsip?"))return;if(db)await run("archive","readwrite",s=>s.clear());archives=[];renderArchive();toast("Semua arsip dihapus")};
$("#exA").onclick=()=>{if(!archives.length){toast("Belum ada arsip");return}const aoa=[["Tanggal Arsip","Tanggal","Jam","Kode Barang","Nama Barang","Jumlah","Jenis","Status","Keterangan"]].concat(archives.map(r=>{const f=fmt(r.ts);return[fmt(r.archivedAt||r.ts).tgl,f.tgl,f.jam,String(r.kode),r.nama,Number(r.jumlah||1),r.jenis,r.status||"Belum Diambil",r.ket]}));const ws=XLSX.utils.aoa_to_sheet(aoa),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Arsip");const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"}),blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="ARSIP RETURN HAPPY HOME.xlsx";a.click()};
/* Export */
async function exportXlsx(j,name){
 const rows=rets.filter(r=>r.jenis===j).sort((a,b)=>a.ts.localeCompare(b.ts));
 if(!rows.length){toast("Belum ada data untuk diexport");return}
 const aoa=[["Tanggal","Jam","Kode Barang","Nama Barang","Jenis Return","Keterangan"]].concat(rows.map(r=>{const f=fmt(r.ts);return[f.tgl,f.jam,String(r.kode),r.nama,r.jenis,r.ket]}));
 const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:12},{wch:10},{wch:16},{wch:44},{wch:20},{wch:36}];
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
