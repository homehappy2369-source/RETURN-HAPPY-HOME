const $=s=>document.querySelector(s);

let db=null;
const DAY_CUTOFF_HOUR=22;
let master=new Map();
let rets=[];
let archives=[];
let services=[];
let cur=null;
let jenis="";
let pend=null;
const archiveOpen=new Set();
const serviceOpen=new Set();

/* Ganti dengan URL Edge Function milik project Supabase kamu. */
const RETURN_API_URL = "https://vzbaezoeqjwqlxgczzwu.supabase.co/functions/v1/return-api";
const RETURN_API_KEY = "sb_publishable_82Kj45x7OAaymPKDkOQUpg_s6HpdN06";

const mem={master:[],ret:[],archive:[],service:[]};
const storeName={master:"master",ret:"ret",archive:"archive",service:"service"};

async function api(action, store, data, id){
  if(!RETURN_API_URL.startsWith("https://") || RETURN_API_URL.includes("GANTI_DENGAN"))
    throw new Error("URL Supabase belum diatur di app.js");
  if(!RETURN_API_KEY || RETURN_API_KEY.includes("GANTI_DENGAN"))
    throw new Error("Supabase anon key belum diatur di app.js");

  const body={action,store};
  if(data!==undefined) body.data=data;
  if(id!==undefined) body.id=id;

  const response=await fetch(RETURN_API_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":RETURN_API_KEY,
      "Authorization":"Bearer "+RETURN_API_KEY
    },
    body:JSON.stringify(body)
  });

  let result={};
  try{result=await response.json()}catch{}
  if(!response.ok || result.error)
    throw new Error(result.error||("HTTP "+response.status));
  return result;
}

async function getAll(st){
  return (await api("list",storeName[st])).rows||[];
}
async function insertRow(st,row){
  return (await api("insert",storeName[st],row)).row;
}
async function updateRow(st,row){
  return (await api("update",storeName[st],row,row.id)).row;
}
async function deleteRow(st,id){
  await api("delete",storeName[st],undefined,id);
}
async function clearRows(st){
  await api("clear",storeName[st]);
}
async function bulkReplaceMaster(rows){
  await clearRows("master");
  const chunk=40;
  for(let i=0;i<rows.length;i+=chunk){
    await Promise.all(rows.slice(i,i+chunk).map(row=>insertRow("master",row)));
  }
}

function toast(t){
  const e=$("#toast");
  if(!e)return;
  e.textContent=t;
  e.classList.add("on");
  clearTimeout(toast.h);
  toast.h=setTimeout(()=>e.classList.remove("on"),3000);
}

function esc(s){
  return String(s??"").replace(/[&<>"]/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
  }[c]));
}

function fmt(ts){
  const d=new Date(ts);
  if(Number.isNaN(d.getTime()))return{tgl:"-",jam:"-"};
  return {
    tgl:d.toLocaleDateString("id-ID",{
      day:"2-digit",month:"2-digit",year:"numeric"
    }),
    jam:d.toLocaleTimeString("id-ID",{
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    }).replace(/\./g,":")
  };
}

function dkey(ts){
  const d=new Date(ts);
  if(Number.isNaN(d.getTime()))return "";
  return d.getFullYear()+"-"+
    String(d.getMonth()+1).padStart(2,"0")+"-"+
    String(d.getDate()).padStart(2,"0");
}
function localToday(){return dkey(new Date().toISOString())}
function normalizeReturn(r){
  return {...r,jumlah:Number(r.jumlah)||1,
    status:r.status||"Belum Diambil",ket:r.ket||""};
}

/* Tab navigasi */
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("nav button").forEach(x=>
    x.setAttribute("aria-selected",x===b));
  ["input","data","archive","master","service"].forEach(t=>
    $("#t-"+t).classList.toggle("hide",t!==b.dataset.t));
  if(b.dataset.t==="data")render();
  if(b.dataset.t==="archive")renderArchive();
  if(b.dataset.t==="master")renderMasterCount();
  if(b.dataset.t==="service")renderService();
  if(b.dataset.t==="input")$("#scan").focus();
});

/* Memuat data dari Supabase */
async function init(){
  try{
    const [m,r,a,s]=await Promise.all([
      getAll("master"),getAll("ret"),getAll("archive"),getAll("service")
    ]);
    master=new Map(m.map(x=>[String(x.key??x.kode??x.id),x]));
    rets=r.map(normalizeReturn);
    archives=a.map(normalizeReturn);
    services=s;
    toast("Terhubung ke Supabase. Data dimuat dari server.");
  }catch(e){
    console.error("Supabase init gagal:",e);
    toast("Gagal memuat Supabase: "+e.message);
    return;
  }
  await rollover(true);
  render();
  renderArchive();
  renderMasterCount();
  renderService();
  $("#scan").focus();
  setInterval(async()=>{
    await refreshAll();
    await rollover(false);
  },60000);
}

async function refreshAll(){
  try{
    const [m,r,a,s]=await Promise.all([
      getAll("master"),getAll("ret"),getAll("archive"),getAll("service")
    ]);
    master=new Map(m.map(x=>[String(x.key??x.kode??x.id),x]));
    rets=r.map(normalizeReturn);
    archives=a.map(normalizeReturn);
    services=s;
    render();
    renderArchive();
    renderMasterCount();
    renderService();
  }catch(e){
    console.error("Refresh Supabase gagal:",e);
  }
}

/* Input Return */
function lookup(){
  const v=$("#scan").value.trim(),box=$("#item"),sug=$("#suggestions");
  if(!v){
    cur=null;
    sug.classList.add("hide");
    sug.innerHTML="";
    box.className="item";
    box.innerHTML='<span class="k">Barang akan tampil di sini setelah kode di-scan atau dipilih dari pencarian.</span>';
    upd();
    return;
  }

  const direct=master.get(v)||master.get(v.toUpperCase());
  cur=direct||null;

  if(cur){
    sug.classList.add("hide");
    sug.innerHTML="";
    box.className="item";
    box.innerHTML='<div class="k">Kode '+esc(cur.kode)+'</div><div class="n">'+esc(cur.nama)+'</div>';
  }else{
    const q=v.toLowerCase();
    const seen=new Set(),found=[];
    for(const x of master.values()){
      const kode=String(x.kode??""),nama=String(x.nama??"");
      const key=kode+"|"+nama;
      if(!seen.has(key)&&(kode+" "+nama).toLowerCase().includes(q)){
        seen.add(key);
        found.push(x);
      }
      if(found.length>=12)break;
    }
    sug.innerHTML=found.map(x=>
      '<button type="button" class="suggest" data-k="'+esc(x.key||x.kode)+
      '"><strong>'+esc(x.nama)+'</strong><span>'+esc(x.kode)+'</span></button>'
    ).join("");
    sug.classList.toggle("hide",!found.length);
    box.className="item bad";
    box.innerHTML=master.size
      ?'<div class="n">Pilih barang dari hasil pencarian</div><div class="k">Ketik sebagian nama atau kode barang.</div>'
      :'<div class="n">Master barang masih kosong</div><div class="k">Import file Excel di tab Master Barang.</div>';
  }
  upd();
}

function getJumlah(){
  const n=Number.parseInt($("#jumlah").value,10);
  return Number.isFinite(n)&&n>=1?n:0;
}
function upd(){
  $("#simpan").disabled=!(cur&&jenis&&getJumlah()>=1);
}

$("#scan").addEventListener("input",lookup);
$("#scan").addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    lookup();
    if(cur)$("#jumlah").focus();
  }
});
$("#suggestions").onclick=e=>{
  const b=e.target.closest("[data-k]");
  if(!b)return;
  const x=master.get(b.dataset.k);
  if(!x)return;
  cur=x;
  $("#scan").value=x.kode;
  $("#suggestions").classList.add("hide");
  $("#suggestions").innerHTML="";
  lookup();
  $("#jumlah").focus();
};
$("#jumlah").addEventListener("input",upd);
$("#jumlah").addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    $("#ket").focus();
  }
});
$("#ket").addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    simpan();
  }
});
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{
  jenis=b.dataset.j;
  document.querySelectorAll(".seg button").forEach(x=>
    x.setAttribute("aria-pressed",x===b));
  upd();
});
$("#simpan").onclick=simpan;

async function simpan(){
  if(!cur||!jenis)return;
  const jumlah=getJumlah();
  if(jumlah<1){toast("Jumlah minimal 1");return}
  const r={
    ts:new Date().toISOString(),
    kode:cur.kode,
    nama:cur.nama,
    jumlah,
    jenis,
    status:"Belum Diambil",
    ket:$("#ket").value.trim()
  };
  try{
    const saved=await insertRow("ret",r);
    Object.assign(r,saved);
    rets.push(r);
    toast("Tersimpan: "+r.nama);
    $("#scan").value="";
    $("#jumlah").value="1";
    $("#ket").value="";
    lookup();
    render();
    $("#scan").focus();
  }catch(e){
    toast("Gagal menyimpan Return.");
    console.error(e);
  }
}

/* Data Return */
function render(){
  const q=$("#cari").value.trim().toLowerCase(),fj=$("#fj").value;
  const list=rets.filter(r=>
    (!fj||r.jenis===fj)&&
    (!q||(String(r.kode)+" "+String(r.nama)+" "+String(r.ket))
      .toLowerCase().includes(q))
  ).sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  const show=list.slice(0,300);
  $("#cnt").textContent=list.length
    ?list.length.toLocaleString("id-ID")+" data"+
      (list.length>show.length?", menampilkan 300 terbaru. Export memuat semua data.":"")
    :"Belum ada data Return.";

  $("#tb").innerHTML=show.map(r=>{
    const f=fmt(r.ts),status=r.status||"Belum Diambil";
    return "<tr><td>"+f.tgl+"</td><td>"+f.jam+"</td><td>"+esc(r.kode)+
      "</td><td>"+esc(r.nama)+"</td><td>"+
      Number(r.jumlah||1).toLocaleString("id-ID")+
      "</td><td><span class=\"tag "+
      (r.jenis==="Pecah Belah"?"p":"b")+"\">"+esc(r.jenis)+
      "</span></td><td><button class=\"check "+
      (status==="Sudah Diambil"?"done":"")+"\" data-check=\""+r.id+"\">"+
      (status==="Sudah Diambil"?"✓ Sudah Diambil":"☐ Belum Diambil")+
      "</button></td><td>"+esc(r.ket)+
      "</td><td><button class=\"x\" data-d=\""+r.id+"\">Hapus</button></td></tr>";
  }).join("");
}
$("#cari").oninput=render;
$("#fj").onchange=render;
$("#tb").onclick=async e=>{
  const cb=e.target.closest("[data-check]");
  if(cb){
    const id=Number(cb.dataset.check),r=rets.find(x=>Number(x.id)===id);
    if(!r)return;
    if(r.status==="Sudah Diambil"){
      toast("Barang ini sudah diambil dan status tidak dapat dikembalikan.");
      return;
    }
    r.status="Sudah Diambil";
    try{
      await updateRow("ret",r);
      render();
      toast("Status: Sudah Diambil");
    }catch(err){
      toast("Gagal menyimpan status.");
      console.error(err);
    }
    return;
  }
  const btn=e.target.closest("[data-d]");
  if(!btn)return;
  if(!btn.dataset.arm){
    document.querySelectorAll("[data-arm]").forEach(x=>{
      delete x.dataset.arm;
      x.textContent="Hapus";
    });
    btn.dataset.arm="1";
    btn.textContent="Yakin hapus?";
    setTimeout(()=>{
      if(btn.isConnected&&btn.dataset.arm){
        delete btn.dataset.arm;
        btn.textContent="Hapus";
      }
    },3000);
    return;
  }
  const n=Number(btn.dataset.d);
  try{
    await deleteRow("ret",n);
    rets=rets.filter(r=>Number(r.id)!==n);
    render();
    toast("Return dihapus");
  }catch(err){
    toast("Gagal menghapus Return.");
    console.error(err);
  }
};
/* Arsip otomatis */
async function rollover(showToast){
  const now=new Date(),today=dkey(now.toISOString());
  const shouldArchiveToday=now.getHours()>=DAY_CUTOFF_HOUR;
  const rows=rets.filter(r=>{
    const day=dkey(r.ts);
    return day&&(day<today||(shouldArchiveToday&&day===today));
  });
  if(!rows.length)return;
  try{
    const moved=[];
    for(const row of rows){
      const copy={...row,originalId:row.id,archivedAt:now.toISOString()};
      delete copy.id;
      const saved=await insertRow("archive",copy);
      moved.push({sourceId:row.id,archiveId:saved.id});
    }
    for(const item of moved)await deleteRow("ret",item.sourceId);
    const ids=new Set(moved.map(x=>Number(x.sourceId)));
    rets=rets.filter(r=>!ids.has(Number(r.id)));
    archives=await getAll("archive");
    if(showToast||rows.length)
      toast(rows.length.toLocaleString("id-ID")+" data dipindahkan ke Arsip");
    render();
    renderArchive();
  }catch(e){
    console.error("Rollover gagal:",e);
    toast("Arsip belum dipindahkan. Data Return tetap aman.");
  }
}

function archiveDayLabel(key){
  const [y,m,d]=key.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  return dt.toLocaleDateString("id-ID",{
    weekday:"long",day:"2-digit",month:"long",year:"numeric"
  });
}
function groupedByDay(rows){
  const groups=new Map();
  [...rows].sort((a,b)=>String(b.ts).localeCompare(String(a.ts))).forEach(r=>{
    const key=dkey(r.ts)||"tanpa-tanggal";
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(r);
  });
  return groups;
}
function exportReturnDay(rows,namePrefix){
  if(!rows.length){toast("Tidak ada data untuk diexport");return}
  const aoa=[["Tanggal","Jam","Kode Barang","Nama Barang","Jumlah","Jenis Return","Keterangan"]]
    .concat(rows.map(r=>{
      const f=fmt(r.ts);
      return[f.tgl,f.jam,String(r.kode),r.nama,Number(r.jumlah||1),r.jenis,r.ket||""];
    }));
  downloadXlsx(aoa,"Arsip Return",namePrefix,[12,10,16,44,10,22,50]);
}

function renderArchive(){
  const groups=groupedByDay(archives);
  const total=archives.length;
  $("#arcCnt").textContent=total
    ?total.toLocaleString("id-ID")+" data arsip dalam "+groups.size.toLocaleString("id-ID")+" hari"
    :"Belum ada arsip Return.";

  let html="";
  for(const [key,list] of groups){
    const open=archiveOpen.has(key);
    const bodyId="arc-day-"+key.replace(/[^0-9a-z_-]/gi,"_");
    html+='<div class="archive-folder card">'+
      '<div class="folder-head">'+
      '<div><strong>'+esc(archiveDayLabel(key))+'</strong><div class="note">'+
      list.length.toLocaleString("id-ID")+' data Return</div></div>'+
      '<button class="btn alt" data-open-archive="'+esc(key)+'">'+
      (open?'Tutup':'Lihat')+'</button></div>'+
      '<div id="'+bodyId+'" class="folder-body '+(open?'':'hide')+'">'+
      '<div class="tw"><table><thead><tr>'+
      '<th>Tanggal</th><th>Jam</th><th>Kode Barang</th><th>Nama Barang</th>'+
      '<th>Jumlah</th><th>Jenis Return</th><th>Status</th>'+
      '<th>Keterangan</th><th>Aksi</th></tr></thead><tbody>'+
      list.map(r=>{
        const f=fmt(r.ts);
        return '<tr><td>'+f.tgl+'</td><td>'+f.jam+'</td><td>'+
          esc(r.kode)+'</td><td>'+esc(r.nama)+'</td><td>'+
          Number(r.jumlah||1).toLocaleString("id-ID")+'</td><td>'+
          esc(r.jenis)+'</td><td>'+esc(r.status||"Belum Diambil")+
          '</td><td>'+esc(r.ket)+'</td><td><button class="x" data-ad="'+
          r.id+'">Hapus</button></td></tr>';
      }).join("")+
      '</tbody></table></div></div></div>';
  }
  $("#ta").innerHTML=html||'<p class="note">Belum ada arsip Return.</p>';
}

function renderArchiveExportPicker(){
  const picker=$("#archiveExportPicker"),groups=groupedByDay(archives);
  if(!groups.size){toast("Belum ada arsip untuk diexport");return}
  picker.innerHTML='<div class="picker-title">Pilih tanggal Arsip</div>'+
    [...groups.entries()].map(([key,list])=>
      '<button class="picker-item" data-export-archive="'+esc(key)+
      '"><span>'+esc(archiveDayLabel(key))+'</span><span>'+
      list.length+' data</span></button>'
    ).join("");
  picker.classList.remove("hide");
}
const exportArchiveBtn = $("#exportA");
if (exportArchiveBtn) {
  exportArchiveBtn.onclick = renderArchiveExportPicker;
}
$("#archiveExportPicker").onclick=e=>{
  const b=e.target.closest("[data-export-archive]");
  if(!b)return;
  const key=b.dataset.exportArchive;
  const rows=archives.filter(r=>(dkey(r.ts)||"tanpa-tanggal")===key)
    .sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
  const name=key==="tanpa-tanggal"
    ?"ARSIP RETURN TANPA TANGGAL.xlsx"
    :"ARSIP RETURN "+key+".xlsx";
  exportReturnDay(rows,name);
  $("#archiveExportPicker").classList.add("hide");
};

$("#ta").onclick=async e=>{
  const op=e.target.closest("[data-open-archive]");
  if(op){
    const key=op.dataset.openArchive;
    archiveOpen.has(key)?archiveOpen.delete(key):archiveOpen.add(key);
    renderArchive();
    return;
  }
  const b=e.target.closest("[data-ad]");
  if(!b)return;
  const id=Number(b.dataset.ad);
  if(!confirm("Hapus data arsip ini?"))return;
  try{
    await deleteRow("archive",id);
    archives=archives.filter(r=>Number(r.id)!==id);
    renderArchive();
    toast("Arsip dihapus");
  }catch(err){
    toast("Gagal menghapus arsip.");
    console.error(err);
  }
};

$("#clearA").onclick=async()=>{
  if(!archives.length)return;
  if(!confirm("Hapus SEMUA arsip? Data yang sudah diarsipkan tidak dapat dikembalikan."))return;
  try{
    await clearRows("archive");
    archives=[];
    archiveOpen.clear();
    renderArchive();
    toast("Semua arsip dihapus");
  }catch(err){
    toast("Gagal menghapus semua arsip.");
    console.error(err);
  }
};

function downloadXlsx(aoa,sheet,name,widths){
  if(!window.XLSX){toast("Library Excel belum tersedia.");return}
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  if(widths)ws["!cols"]=widths.map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheet);
  const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  const blob=new Blob([buf],{
    type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* Export Return */
async function exportXlsx(j,name){
  const rows=rets.filter(r=>r.jenis===j)
    .sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
  if(!rows.length){toast("Belum ada data untuk diexport");return}
  const aoa=[["Tanggal","Jam","Kode Barang","Nama Barang","Jumlah","Jenis Return","Keterangan"]]
    .concat(rows.map(r=>{
      const f=fmt(r.ts);
      return[f.tgl,f.jam,String(r.kode),r.nama,Number(r.jumlah||1),r.jenis,r.ket||""];
    }));
  downloadXlsx(aoa,"Return",name,[12,10,16,44,10,22,50]);
}
$("#exP").onclick=()=>exportXlsx("Pecah Belah","EXPORT RETURN PECAH BELAH.xlsx");
$("#exB").onclick=()=>exportXlsx("Bukan Pecah Belah","EXPORT RETURN BUKAN PECAH BELAH.xlsx");

/* Master Barang */
function renderMasterCount(){
  const e=$("#masterCount");
  if(e)e.textContent="Jumlah Master Barang: "+master.size.toLocaleString("id-ID")+" data";
}

$("#file").onchange=async e=>{
  const f=e.target.files[0];
  if(!f)return;
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
    const rows=XLSX.utils.sheet_to_json(
      wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""}
    );
    let h=rows.findIndex(r=>r.filter(c=>String(c).trim()!=="").length>=2);
    if(h<0)throw new Error("Header tidak ditemukan");
    pend={
      rows:rows.slice(h+1),
      head:rows[h].map((c,i)=>String(c).trim()||"Kolom "+(i+1))
    };
    const opt=(none)=>(none?'<option value="-1">Tidak dipakai</option>':"")+
      pend.head.map((c,i)=>'<option value="'+i+'">'+esc(c)+"</option>").join("");
    $("#mk").innerHTML=opt(false);
    $("#mnm").innerHTML=opt(false);
    $("#mb").innerHTML=opt(true);
    const g=(re,ex)=>pend.head.findIndex((c,i)=>re.test(c)&&i!==ex);
    const n=g(/nama|name|deskripsi|description/i,-1);
    const k=g(/kode|code|plu|sku/i,n);
    const b=g(/barcode|bar code/i,-1);
    $("#mnm").value=n>=0?n:Math.min(1,pend.head.length-1);
    $("#mk").value=k>=0?k:0;
    $("#mb").value=b>=0?b:-1;
    $("#mInfo").textContent=pend.rows.length.toLocaleString("id-ID")+
      " baris terbaca. Periksa kolom sebelum import.";
    $("#map").classList.remove("hide");
  }catch(err){
    console.error(err);
    toast("File tidak bisa dibaca. Pastikan format Excel/CSV.");
  }
};

$("#imp").onclick=async()=>{
  if(!pend)return;
  const ik=+$("#mk").value,inm=+$("#mnm").value,ib=+$("#mb").value;
  if(ik<0||inm<0){toast("Kolom kode dan nama wajib dipilih.");return}
  const m=new Map();
  pend.rows.forEach(r=>{
    const kode=String(r[ik]??"").trim(),nama=String(r[inm]??"").trim();
    if(!kode||!nama)return;
    m.set(kode,{key:kode,kode,nama});
    if(ib>=0){
      const bc=String(r[ib]??"").trim();
      if(bc&&!m.has(bc))m.set(bc,{key:bc,kode,nama});
    }
  });
  if(!m.size){toast("Tidak ada baris valid. Cek pilihan kolom.");return}
  try{
    const arr=[...m.values()];
    await bulkReplaceMaster(arr);
    master=m;
    pend=null;
    $("#map").classList.add("hide");
    $("#file").value="";
    renderMasterCount();
    lookup();
    toast(arr.length.toLocaleString("id-ID")+" data Master Barang masuk");
  }catch(err){
    console.error(err);
    toast("Import Master Barang gagal. Periksa koneksi Supabase.");
  }
};
/* Service */
function serviceDayLabel(key){
  if(key==="tanpa-tanggal")return "Tanpa Tanggal";
  return archiveDayLabel(key);
}

function renderService(){
  const groups=groupedByDay(services);
  $("#serviceCnt").textContent=services.length
    ?services.length.toLocaleString("id-ID")+" data Service dalam "+
      groups.size.toLocaleString("id-ID")+" hari"
    :"Belum ada data Service.";

  let html="";
  for(const [key,list] of groups){
    const open=serviceOpen.has(key);
    const bodyId="svc-day-"+key.replace(/[^0-9a-z_-]/gi,"_");
    html+='<div class="service-folder card">'+
      '<div class="folder-head">'+
      '<div><strong>'+esc(serviceDayLabel(key))+'</strong><div class="note">'+
      list.length.toLocaleString("id-ID")+' data Service</div></div>'+
      '<button class="btn alt" data-open-service="'+esc(key)+'">'+
      (open?'Tutup':'Lihat')+'</button></div>'+
      '<div id="'+bodyId+'" class="folder-body '+(open?'':'hide')+'">'+
      '<div class="tw"><table><thead><tr>'+
      '<th>Tanggal</th><th>Jam</th><th>Nama</th><th>Nomor HP</th>'+
      '<th>Nama Barang</th><th>Kode</th><th>Kendala</th>'+
      '<th>Keterangan</th><th>Aksi</th></tr></thead><tbody>'+
      list.map(r=>{
        const f=fmt(r.ts);
        return '<tr><td>'+f.tgl+'</td><td>'+f.jam+'</td><td>'+
          esc(r.nama)+'</td><td>'+esc(r.hp)+'</td><td>'+
          esc(r.barang)+'</td><td>'+esc(r.kode)+'</td><td>'+
          esc(r.kendala)+'</td><td>'+esc(r.ket)+
          '</td><td><div class="row action-row">'+
          '<button class="check done" data-sv-taken="'+r.id+
          '">✓ Sudah Diambil</button><button class="x" data-sd="'+
          r.id+'">Hapus</button></div></td></tr>';
      }).join("")+
      '</tbody></table></div></div></div>';
  }
  $("#ts").innerHTML=html||'<p class="note">Belum ada data Service.</p>';
}

function renderServiceExportPicker(){
  const picker=$("#serviceExportPicker"),groups=groupedByDay(services);
  if(!groups.size){toast("Belum ada data Service untuk diexport");return}
  picker.innerHTML='<div class="picker-title">Pilih tanggal Service</div>'+
    [...groups.entries()].map(([key,list])=>
      '<button class="picker-item" data-export-service="'+esc(key)+
      '"><span>'+esc(serviceDayLabel(key))+'</span><span>'+
      list.length+' data</span></button>'
    ).join("");
  picker.classList.remove("hide");
}

$("#exS").onclick=renderServiceExportPicker;
$("#serviceExportPicker").onclick=e=>{
  const b=e.target.closest("[data-export-service]");
  if(!b)return;
  const key=b.dataset.exportService;
  const rows=services.filter(r=>(dkey(r.ts)||"tanpa-tanggal")===key)
    .sort((a,b)=>String(a.ts).localeCompare(String(b.ts)));
  if(!rows.length){toast("Tidak ada data Service untuk tanggal itu.");return}
  const aoa=[["Tanggal","Jam","Nama","Nomor HP","Nama Barang","Kode Barang","Kendala","Keterangan"]]
    .concat(rows.map(r=>{
      const f=fmt(r.ts);
      return[f.tgl,f.jam,r.nama,r.hp,r.barang,r.kode,r.kendala,r.ket];
    }));
  const name=key==="tanpa-tanggal"
    ?"SERVICE TANPA TANGGAL.xlsx"
    :"SERVICE "+key+".xlsx";
  downloadXlsx(aoa,"Service",name,[12,10,24,18,32,18,36,36]);
  $("#serviceExportPicker").classList.add("hide");
};

$("#simpanService").onclick=simpanService;

async function simpanService(){
  const r={
    ts:new Date().toISOString(),
    nama:$("#svNama").value.trim(),
    hp:$("#svHp").value.trim(),
    barang:$("#svBarang").value.trim(),
    kode:$("#svKode").value.trim(),
    kendala:$("#svKendala").value.trim(),
    ket:$("#svKet").value.trim()
  };
  if(!r.nama||!r.hp||!r.barang||!r.kendala){
    toast("Nama, Nomor HP, Nama Barang, dan Kendala wajib diisi.");
    return;
  }
  try{
    const saved=await insertRow("service",r);
    Object.assign(r,saved);
    services.push(r);
    ["svNama","svHp","svBarang","svKode","svKendala","svKet"].forEach(id=>{
      $("#"+id).value="";
    });
    renderService();
    toast("Data Service tersimpan");
  }catch(e){
    console.error(e);
    toast("Gagal menyimpan Service.");
  }
}

$("#ts").onclick=async e=>{
  const op=e.target.closest("[data-open-service]");
  if(op){
    const key=op.dataset.openService;
    serviceOpen.has(key)?serviceOpen.delete(key):serviceOpen.add(key);
    renderService();
    return;
  }

  const taken=e.target.closest("[data-sv-taken]");
  if(taken){
    const id=Number(taken.dataset.svTaken);
    const r=services.find(x=>Number(x.id)===id);
    if(!r)return;
    if(!confirm("Konfirmasi: Service ini sudah diambil? Data akan langsung dihapus dan tidak bisa dikembalikan."))return;
    try{
      await deleteRow("service",id);
      services=services.filter(x=>Number(x.id)!==id);
      renderService();
      toast("Service sudah diambil dan dihapus dari data.");
    }catch(err){
      toast("Gagal menghapus Service.");
      console.error(err);
    }
    return;
  }

  const b=e.target.closest("[data-sd]");
  if(!b)return;
  const id=Number(b.dataset.sd);
  if(!confirm("Hapus data Service ini?"))return;
  try{
    await deleteRow("service",id);
    services=services.filter(r=>Number(r.id)!==id);
    renderService();
    toast("Data Service dihapus");
  }catch(err){
    toast("Gagal menghapus Service.");
    console.error(err);
  }
};

init();
