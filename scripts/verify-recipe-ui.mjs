import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const app3 = await readFile(new URL('../shared/app3.js', import.meta.url), 'utf8');
const management = await readFile(new URL('../shared/recipe-management.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle() { for (let i=0;i<10;i++) await tick(); }

async function setup(owner=false) {
  const dom=new JSDOM('<main id="app"></main>',{url:'https://test.example',runScripts:'outside-only'});
  const w=dom.window, calls=[],draws=[];let nextId=10,failUpload=false,delayUpload=false,releaseUpload,failLink=false,tracksStopped=0;
  const uid=owner?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';
  Object.assign(w,{
    BASE:'https://example.supabase.co',KEY:'publishable-test-only',
    S:{session:{user:{id:uid},access_token:'test-only'},tab:'Μεσημεριανά',view:'recipes',recipes:[],recentCommunity:[],plan:[],shopping:[],detailCache:{},catalogLoading:false,status:'',sel:null,creating:false},
    $:selector=>w.document.querySelector(selector), E:value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])),F:value=>String(value),
    recipeCategories:()=>['Μεσημεριανά','Πρωινά','Βραδινά','Σνακ'],recipeSubcategories:()=>['Κοτόπουλο'],recipeImage:row=>row?.photo_url||'',
    api:async(path,options={})=>{const data=options.body?JSON.parse(options.body):null;calls.push({path,data});if(path.endsWith('recipe_management_access'))return owner;
      if(path.endsWith('/save_recipe'))return data.p_recipe_id||nextId++;
      if(path.endsWith('/set_recipe_photo')){if(failLink){failLink=false;throw new Error('Link failed');}return data.p_path?'https://example.supabase.co/storage/v1/object/authenticated/recipe-photos/'+data.p_path:null;}return [];},
    sessionNeedsRefresh:()=>false,refreshSession:async()=>true,fetchCatalog:async()=>{},loadHomePool:async()=>{},loadRecentCommunity:async()=>{},loadTaxonomy:async()=>{},loadModeration:async()=>{},idbSet:async()=>{},
    fetch:async(url,options)=>{calls.push({url,options});if(url.includes('/object/sign/'))return {status:200,ok:true,text:async()=>JSON.stringify({signedURL:'/object/sign/test.jpg?token=mock'})};
      if(options.method==='POST'&&!url.includes('/sign/')){if(delayUpload)await new Promise(resolve=>releaseUpload=resolve);if(failUpload){failUpload=false;return {status:500,ok:false,text:async()=>JSON.stringify({message:'Upload failed'})};}}
      return {status:200,ok:true,text:async()=>'{}'};}
  });
  w.crypto.randomUUID=randomUUID;w.URL.createObjectURL=()=> 'blob:'+randomUUID();w.URL.revokeObjectURL=()=>{};
  w.Image=class {naturalWidth=2200;naturalHeight=1600;set src(value){Promise.resolve().then(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {fillRect(){},drawImage(...args){draws.push({width:canvas.width,height:canvas.height,args});},translate(){},rotate(){},fillStyle:''};};
  w.HTMLCanvasElement.prototype.toBlob=function(callback,type){callback(new w.Blob(['compressed-image'],{type}));};
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){tracksStopped++;}}]})}});
  w.eval(app3);
  w.render=function(){w.document.querySelector('#app').innerHTML='<section class="workspace"><main class="workspace-inner">'+w.modal()+'</main></section>';
    w.document.querySelector('[data-submit]')?.addEventListener('click',()=>w.submitRecipe());
    w.document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{w.S.creating=false;w.S.sel=null;w.render();});};
  w.eval(management);await settle();
  function click(selector){const button=w.document.querySelector(selector);assert(button,selector);button.click();}
  function input(selector,value){const field=w.document.querySelector(selector);assert(field,selector);field.value=value;}
  function fill(){input('#ct','Συνταγή δοκιμής');input('[data-ing-qty]','2');input('[data-ing-item]','Πατάτες');input('[data-step-text]','Μαγείρεψε.');}
  function choose(){const field=w.document.querySelector('[data-recipe-file]');Object.defineProperty(field,'files',{value:[new w.File(['image'],'photo.png',{type:'image/png'})],configurable:true});field.dispatchEvent(new w.Event('change',{bubbles:true}));}
  return {w,calls,draws,click,input,fill,choose,close:()=>dom.window.close(),uid,setFailUpload:()=>failUpload=true,setFailLink:()=>failLink=true,setDelayUpload:()=>delayUpload=true,release:()=>releaseUpload?.(),stopped:()=>tracksStopped};
}

const a=await setup();
try {
  a.w.S.creating=true;a.w.render();a.fill();a.choose();await settle();
  assert.equal(a.w.document.querySelector('.recipe-photo-preview').hidden,false);
  const initial=a.draws.at(-1);assert.equal(initial.width,1200);assert.equal(initial.height,900);assert(Math.abs(initial.args[3]/initial.args[4]-4/3)<1e-10);
  const zoom=a.w.document.querySelector('[data-crop-zoom]');zoom.value='2';zoom.dispatchEvent(new a.w.Event('input',{bubbles:true}));await settle();
  assert.equal(a.draws.at(-1).args[3],initial.args[3]/2);
  const position=a.w.document.querySelector('[data-crop-x]');position.value='100';position.dispatchEvent(new a.w.Event('input',{bubbles:true}));await settle();
  const moved=a.draws.at(-1);assert.equal(moved.args[1],2200-moved.args[3]);
  a.click('[data-crop-reset]');await settle();assert.equal(a.draws.at(-1).args[3],initial.args[3]);
  a.click('[data-photo-rotate]');await settle();assert(Math.abs(a.draws.at(-1).args[3]/a.draws.at(-1).args[4]-4/3)<1e-10);
  assert.equal(a.w.document.querySelector('[data-submit]').disabled,false);
  a.w.render();assert.equal(a.w.document.querySelector('#ct').value,'Συνταγή δοκιμής');
  a.setFailUpload();a.click('[data-submit]');await settle();
  assert.equal(a.w.document.querySelector('#ct').value,'Συνταγή δοκιμής');assert.equal(a.w.S.creating,true);
  a.click('[data-submit]');await settle();
  const saves=a.calls.filter(call=>call.path?.endsWith('/save_recipe'));
  assert.equal(saves.length,1,'Photo retry must not rewrite the already saved recipe');
  assert(a.calls.filter(call=>call.url?.includes('/object/recipe-photos/')).every(call=>call.url.includes('/10/')),'Retry reuses the created recipe');
  const upload=a.calls.find(call=>call.url?.includes('/object/recipe-photos/'));
  assert(upload.url.includes('/'+a.uid+'/10/'));assert.equal(upload.options.headers['Content-Type'],'image/jpeg');
  assert.equal(upload.options.headers['x-upsert'],'false');assert.equal(a.w.S.creating,false);
  a.w.S.sel={id:2,title:'Αρχική',recipe_origin:'curated',photo_url:null};a.w.render();assert.equal(a.w.document.querySelector('[data-recipe-edit]'),null);
  a.w.S.sel={id:3,title:'Δική μου',recipe_origin:'community',created_by:a.uid,photo_url:null,recipe_ingredients:[{qty_min:1,item:'Υλικό',unit:''}],recipe_steps:[{instruction:'Βήμα'}]};a.w.render();a.click('[data-recipe-edit]');
  assert.equal(a.w.document.querySelector('#ct').value,'Δική μου');a.click('[data-recipe-edit-close]');
  a.w.S.sel={id:4,title:'Άλλη',recipe_origin:'community',created_by:'different-user'};a.w.render();assert.equal(a.w.document.querySelector('[data-recipe-edit]'),null);
}finally{a.close();}

const b=await setup(true);
try {
  b.w.S.sel={id:2,title:'Αρχική',meal:'Μεσημεριανά',recipe_origin:'curated',photo_url:'https://example.supabase.co/storage/v1/object/authenticated/recipe-photos/'+b.uid+'/2/old.jpg',recipe_ingredients:[{qty_min:1,qty_max:3,item:'Υλικό',unit:'κιλά',category:'Κατηγορία',option_code:'A',raw:'1–3 κιλά Υλικό'}],recipe_steps:[{instruction:'Βήμα'}]};
  b.w.render();await settle();b.click('[data-recipe-edit]');b.input('#ct','Ενημερωμένη');b.click('[data-photo-remove]');b.click('[data-recipe-save]');await settle();
  assert(b.calls.some(call=>call.path?.endsWith('/set_recipe_photo')&&call.data.p_path===null));
  assert(b.calls.some(call=>call.options?.method==='DELETE'&&call.options.body.includes('old.jpg')));
  const item=b.calls.find(call=>call.path?.endsWith('/save_recipe')).data.p_data.ingredients[0];assert.equal(item.option_code,'A');assert.equal(item.category,'Κατηγορία');assert.equal(item.qty_max,3);assert.equal(item.unit,'κιλά');assert.equal(item.raw,'1–3 κιλά Υλικό');
  b.w.S.sel={id:2,title:'Αρχική',recipe_origin:'curated',photo_url:null};b.w.render();b.click('[data-recipe-delete]');assert(!b.calls.some(call=>call.path?.endsWith('/delete_recipe')));
  b.click('[data-recipe-delete-confirm]');await settle();assert.equal(b.w.S.recipeUndo,2);b.click('[data-recipe-undo]');await settle();assert.equal(b.w.S.recipeUndo,null);
  b.w.S.creating=true;b.w.render();b.fill();b.click('[data-recipe-camera]');await settle();
  assert.equal(b.w.document.querySelector('.recipe-camera').hidden,false);const video=b.w.document.querySelector('video');Object.defineProperties(video,{videoWidth:{value:1200},videoHeight:{value:800}});b.click('[data-camera-shot]');await settle();assert.equal(b.stopped(),1);assert.equal(b.w.document.querySelector('.recipe-photo-preview').hidden,false);b.click('[data-photo-rotate]');await settle();b.click('[data-recipe-camera]');await settle();b.click('[data-close]');assert.equal(b.stopped(),2);
  b.w.S.creating=true;b.w.render();b.fill();b.choose();await settle();b.setFailLink();b.click('[data-submit]');await settle();
  assert(b.calls.some(call=>call.options?.method==='DELETE'&&!call.options.body.includes('old.jpg')),'Failed link cleans up new object');
}finally{b.close();}
console.log('UI checks pass: photo upload and retry, draft preservation, owner permissions, metadata preservation, removal, undo and camera cleanup.');
