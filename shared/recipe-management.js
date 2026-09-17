/* Shared recipe editor, camera capture and private Supabase photo storage. */
(function () {
  'use strict';
  const bucket = 'recipe-photos';
  const photoPrefix = BASE + '/storage/v1/object/authenticated/' + bucket + '/';
  const baseRender = render, baseCreate = createModal, baseDetail = recipeModal, baseImage = recipeImage;
  let draft = null, photo = null, preview = '', photoRemoved = false, selection = 0;
  let cropSource = null, cropZoom = 1, cropX = 50, cropY = 50;
  let stream = null, cameraOpening = false, cameraGeneration = 0, saving = false, preparing = false, ownerRequest = '';
  let lastSession = '', signedTimer = null;
  const signed = new Map(), signing = new Set();
  S.recipeEdit = null; S.recipeManager = false;

  function mayManage(row) {
    return !!S.session && (S.recipeManager || (row?.recipe_origin === 'community' && row.created_by === S.session.user.id));
  }
  function photoPath(url) { return typeof url === 'string' && url.startsWith(photoPrefix) ? url.slice(photoPrefix.length) : ''; }
  function stopCamera() {
    ++cameraGeneration; cameraOpening = false;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    const panel = document.querySelector('.recipe-camera'); if (panel) panel.hidden = true;
  }
  function resetDraft() {
    stopCamera(); ++selection;
    if (preview) URL.revokeObjectURL(preview);
    draft = null; photo = null; preview = ''; photoRemoved = false; preparing = false; cropSource=null;cropZoom=1;cropX=50;cropY=50;
  }
  function message(text) {
    if (draft) draft.message = text;
    const statuses = document.querySelectorAll('.recipe-editor-status');
    if (statuses.length) statuses.forEach(status => { status.textContent = text; });
    else { S.status = text; render(); }
  }
  function editorRoot() { return document.querySelector('.recipe-manage-modal') || document.querySelector('.recipe-create-modal'); }
  // Compare only editable fields. Number inputs serialize null as '' and numbers as
  // strings; those representation changes must not turn a photo edit into a recipe rewrite.
  function editableSignature(value) {
    const number = input => input == null || String(input).trim() === '' ? null : Number(input);
    return JSON.stringify({
      title:value.title,meal:value.meal,subcategory:value.subcategory,description:value.description,
      servings:number(value.servings),prep_minutes:number(value.prep_minutes),cook_minutes:number(value.cook_minutes),
      ingredients:value.ingredients.map(item => ({qty:number(item.qty_min),unit:item.unit,item:item.item})),
      steps:value.steps.map(step => step.instruction)
    });
  }
  function updateEditorState() {
    const root=editorRoot();if(!root)return;
    root.setAttribute('aria-busy',String(saving));
    root.querySelectorAll('input,textarea,select,button').forEach(field=>field.disabled=saving);
    const submit=root.querySelector('[data-submit],[data-recipe-save]');
    if(submit){submit.disabled=saving||preparing;if(saving)submit.textContent='Αποθήκευση…';}
  }
  function captureDraft() {
    const root = editorRoot(); if (!root || !draft) return;
    for (const [key, id] of Object.entries({title:'ct',meal:'cm',subcategory:'cs',prep_minutes:'cprep',cook_minutes:'ccook',description:'cdescription',servings:'cservings'})) {
      const field = root.querySelector('#' + id); if (field) draft[key] = field.value;
    }
    const previousIngredients = draft.ingredients;
    draft.ingredients = [...root.querySelectorAll('.ingredient-row')].map(row => {
      const previous = previousIngredients.find(item => item.key === row.dataset.ingredientKey) || {};
      const qty = row.querySelector('[data-ing-qty]').value;
      const max = previous.qty_max != null && +previous.qty_max !== +previous.qty_min ? Math.max(+qty, +previous.qty_max) : qty;
      const unit=row.querySelector('[data-ing-unit]').value,item=row.querySelector('[data-ing-item]').value;
      const sameQty=(String(qty).trim()===''&&(previous.qty_min==null||String(previous.qty_min).trim()===''))||String(qty)===String(previous.qty_min);const raw=sameQty&&unit===previous.unit&&item===previous.item?previous.raw:null;
      return {...previous,raw,key:row.dataset.ingredientKey || crypto.randomUUID(),qty_min:qty,qty_max:max,unit,item};
    });
    draft.steps = [...root.querySelectorAll('.step-row')].map(row => ({instruction:row.querySelector('[data-step-text]').value}));
  }
  function freshDraft(row) {
    const value={id:row?.id || null,title:row?.title || '',meal:row?.meal || S.tab || 'Μεσημεριανά',subcategory:row?.subcategory || '',
      description:row?.description || '',servings:row?.servings || 1,prep_minutes:row?.prep_minutes ?? '',cook_minutes:row?.cook_minutes ?? '',
      photo_url:row?.photo_url || '',ingredients:row?.recipe_ingredients?.map(item => ({...item,key:crypto.randomUUID(),qty_min:item.qty_min ?? '',unit:item.unit || '',item:item.item || ''})) || [{qty_min:'',unit:'',item:''}],
      steps:row?.recipe_steps?.map(step => ({instruction:step.instruction || ''})) || [{instruction:''}]};
    value.savedFields=row?.id?editableSignature(value):null;
    return value;
  }
  function photoControls() {
    return `<section class="form-section recipe-photo-controls"><h3>Φωτογραφία συνταγής</h3>
      <p class="muted">Πρόσθεσε μια δική σου φωτογραφία του φαγητού.</p>
      <div class="recipe-photo-actions">
        <label class="btn ghost recipe-file-label">Ανέβασμα φωτογραφίας<input class="recipe-file-input" type="file" accept="image/jpeg,image/png,image/webp" data-recipe-file aria-label="Ανέβασμα φωτογραφίας"></label>
        <button class="btn ghost" type="button" data-recipe-camera>Λήψη με κάμερα</button>
        <input class="recipe-native-camera" type="file" accept="image/*" capture="environment" data-recipe-capture aria-label="Λήψη φωτογραφίας με την κάμερα συσκευής" hidden>
        <button class="btn ghost" type="button" data-photo-rotate hidden>Περιστροφή</button>
        <button class="btn ghost danger" type="button" data-photo-remove hidden>Αφαίρεση φωτογραφίας</button>
      </div>
      <img class="recipe-photo-preview" alt="Προεπισκόπηση φωτογραφίας συνταγής σε αναλογία 4 προς 3" hidden>
      <div class="recipe-crop-controls" hidden><p>Το κάδρο της κάρτας σου · 4:3</p>
        <label>Μεγέθυνση<input type="range" min="1" max="3" step="0.05" value="1" data-crop-zoom></label>
        <label>Οριζόντια θέση<input type="range" min="0" max="100" value="50" data-crop-x></label>
        <label>Κάθετη θέση<input type="range" min="0" max="100" value="50" data-crop-y></label>
        <button class="btn ghost" type="button" data-crop-reset>Κεντράρισμα</button>
        <small>Αποθήκευση ως JPG, 1200 × 900 px. Κράτησε το πιάτο μέσα στο κάδρο.</small></div>
      <div class="recipe-camera" hidden><video autoplay playsinline muted aria-label="Προεπισκόπηση κάμερας"></video>
        <div class="recipe-photo-actions"><button class="btn" type="button" data-camera-shot>Τράβηξε φωτογραφία</button><button class="btn ghost" type="button" data-camera-close>Κλείσιμο κάμερας</button></div></div>
      <p class="recipe-editor-status" role="status" aria-live="polite"></p></section>`;
  }
  function extraFields() {
    return '<div class="fields"><label class="field full"><span>Περιγραφή</span><textarea class="input" id="cdescription" maxlength="5000" rows="3"></textarea></label><label class="field"><span>Μερίδες</span><input class="input" id="cservings" type="number" min="0.5" max="100" step="0.5" value="1"></label></div>';
  }
  createModal = function () {
    if (!draft) draft = freshDraft();
    return baseCreate().replace('<section class="form-section"><h3>Υλικά</h3>', extraFields() + photoControls() + '<section class="form-section"><h3>Υλικά</h3>')
      .replace('Υποβολή για έγκριση</button>', (S.recipeManager ? 'Δημοσίευση συνταγής' : 'Υποβολή για έγκριση') + '</button>')
      .replace(/(<button class="btn submit-recipe"[^>]*>[\s\S]*?<\/button>)/,'<div class="recipe-save-actions"><p class="recipe-editor-status recipe-save-status" role="status" aria-live="polite"></p>$1</div>');
  };
  recipeModal = function () {
    const html = baseDetail(); if (!S.sel || S.sel.__loading || !mayManage(S.sel)) return html;
    return html.replace(/<\/section><\/div>$/, `<div class="recipe-management-actions"><button class="btn ghost" type="button" data-recipe-edit>Επεξεργασία συνταγής & φωτογραφίας</button><button class="btn ghost danger" type="button" data-recipe-delete>Διαγραφή συνταγής</button></div></section></div>`);
  };
  function editModal() {
    const html = createModal().replace('recipe-create-modal','recipe-create-modal recipe-manage-modal').replace('<h2>Νέα συνταγή</h2>','<h2>Επεξεργασία συνταγής</h2>')
      .replace('data-close','data-recipe-edit-close').replace('data-submit','data-recipe-save')
      .replace(/(?:Δημοσίευση συνταγής|Υποβολή για έγκριση)<\/button>/,'Αποθήκευση αλλαγών</button>');
    return html;
  }
  function restoreDraft() {
    const root = editorRoot(); if (!root || !draft) return;
    for (const [key,id] of Object.entries({title:'ct',meal:'cm',prep_minutes:'cprep',cook_minutes:'ccook',description:'cdescription',servings:'cservings'})) {
      const field=root.querySelector('#'+id);
      if(key==='meal'&&field&&draft.meal&&![...field.options].some(option=>option.value===draft.meal))field.add(new Option(draft.meal,draft.meal));
      if(field)field.value=draft[key] ?? '';
    }
    const sub=root.querySelector('#cs');
    if(sub) { const values=recipeSubcategories(draft.meal); if(draft.subcategory&&!values.includes(draft.subcategory))values.push(draft.subcategory);
      sub.innerHTML='<option value="">Χωρίς υποκατηγορία</option>'+values.map(value=>`<option value="${E(value)}">${E(value)}</option>`).join(''); sub.value=draft.subcategory; }
    root.querySelector('#ingredientRows').innerHTML=draft.ingredients.map((_,i)=>ingredientRowHTML(i+1)).join('');
    root.querySelectorAll('.ingredient-row').forEach((row,i)=>{const item=draft.ingredients[i];row.dataset.ingredientKey=item.key || (item.key=crypto.randomUUID());row.querySelector('[data-ing-qty]').value=item.qty_min;const unit=row.querySelector('[data-ing-unit]');if(![...unit.options].some(option=>option.value===item.unit))unit.insertAdjacentHTML('beforeend',`<option value="${E(item.unit)}">${E(item.unit)}</option>`);unit.value=item.unit;row.querySelector('[data-ing-item]').value=item.item;});
    root.querySelector('#stepRows').innerHTML=draft.steps.map((_,i)=>stepRowHTML(i+1)).join('');
    root.querySelectorAll('[data-step-text]').forEach((field,i)=>field.value=draft.steps[i].instruction);
    bindRows(); updatePreview();
    // The edit modal is appended after the base renderer binds the create form.
    if(root.matches('.recipe-manage-modal')) {
      root.querySelector('[data-add-ing]').onclick=addIng;
      root.querySelector('[data-add-step]').onclick=addStep;
      root.querySelector('#cm').onchange=refreshCreateSubcats;
    }
    if(stream) { const panel=root.querySelector('.recipe-camera');panel.hidden=false;panel.querySelector('video').srcObject=stream; }
    updateEditorState();
    root.querySelectorAll('.recipe-editor-status').forEach(status=>status.textContent=draft.message || '');
  }
  function updatePreview() {
    const root=editorRoot(); if(!root) return;
    const image=root.querySelector('.recipe-photo-preview');
    const source=preview || (!photoRemoved ? recipeImage({photo_url:draft?.photo_url}) : '');
    image.hidden=!source; if(source)image.src=source;else image.removeAttribute('src');
    root.querySelector('[data-photo-remove]').hidden=!(preview || (!photoRemoved && draft?.photo_url));
    root.querySelector('[data-photo-rotate]').hidden=!cropSource;
    const controls=root.querySelector('.recipe-crop-controls');controls.hidden=!cropSource;
    root.querySelector('[data-crop-zoom]').value=cropZoom;root.querySelector('[data-crop-x]').value=cropX;root.querySelector('[data-crop-y]').value=cropY;
  }
  async function loadImage(blob) {
    const url=URL.createObjectURL(blob); const image=new Image();
    try { await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Χρησιμοποίησε φωτογραφία JPG, PNG ή WebP.'));image.src=url;}); return image; }
    finally { URL.revokeObjectURL(url); }
  }
  async function makeCropSource(blob) {
    if(!blob || !blob.size || blob.size>20*1024*1024 || !blob.type.startsWith('image/'))throw new Error('Επίλεξε φωτογραφία έως 20 MB.');
    const image=await loadImage(blob),scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;
  }
  async function renderCrop(request=++selection) {
    if(!cropSource||saving)return;preparing=true;const submit=editorRoot()?.querySelector('[data-submit],[data-recipe-save]');if(submit)submit.disabled=true;
    const width=Math.min(cropSource.width,cropSource.height*4/3)/cropZoom,height=width*3/4;
    const x=(cropSource.width-width)*cropX/100,y=(cropSource.height-height)*cropY/100;
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,1200,900);context.drawImage(cropSource,x,y,width,height,0,0,1200,900);
    try { const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
      if(request!==selection||!draft)return;if(!result||result.size>5*1024*1024)throw new Error('Δεν μπορέσαμε να ετοιμάσουμε τη φωτογραφία.');
      if(preview)URL.revokeObjectURL(preview);photo=result;preview=URL.createObjectURL(result);photoRemoved=false;updatePreview();message('Αυτό το κάδρο θα εμφανίζεται στις συνταγές. Αποθήκευσε όταν είσαι έτοιμος.');
    } catch(error){if(request===selection)message(error.message);}
    finally{if(request===selection){preparing=false;const currentSubmit=editorRoot()?.querySelector('[data-submit],[data-recipe-save]');if(currentSubmit)currentSubmit.disabled=saving;}}
  }
  async function selectPhoto(blob) {
    if(saving)return;const request=++selection;preparing=true;editorRoot()?.querySelector('[data-submit],[data-recipe-save]')?.setAttribute('disabled','');message('Ετοιμάζεται η φωτογραφία…');
    try { const source=await makeCropSource(blob);if(request!==selection||!draft)return;cropSource=source;cropZoom=1;cropX=50;cropY=50;await renderCrop(request); }
    catch(error){if(request===selection)message(error.message);}
    finally{if(request===selection){preparing=false;const submit=editorRoot()?.querySelector('[data-submit],[data-recipe-save]');if(submit)submit.disabled=saving;}}
  }
  function rotateCrop() {
    if(!cropSource||saving)return;const canvas=document.createElement('canvas');canvas.width=cropSource.height;canvas.height=cropSource.width;
    const context=canvas.getContext('2d');context.translate(canvas.width,0);context.rotate(Math.PI/2);context.drawImage(cropSource,0,0);cropSource=canvas;cropZoom=1;cropX=50;cropY=50;renderCrop();
  }
  async function openCamera() {
    if(saving||cameraOpening||stream)return;
    if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||!navigator.mediaDevices?.getUserMedia){editorRoot()?.querySelector('[data-recipe-capture]').click();return;}
    cameraOpening=true;const generation=++cameraGeneration;
    try { const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(generation!==cameraGeneration||!editorRoot()){camera.getTracks().forEach(track=>track.stop());return;}
      stream=camera;const panel=editorRoot().querySelector('.recipe-camera');panel.hidden=false;panel.querySelector('video').srcObject=stream;message('Όταν είσαι έτοιμος, τράβηξε τη φωτογραφία.'); }
    catch(error){message(error.name==='NotAllowedError'?'Επίτρεψε την κάμερα από τις ρυθμίσεις του browser ή ανέβασε φωτογραφία.':'Δεν βρέθηκε διαθέσιμη κάμερα. Μπορείς να ανεβάσεις φωτογραφία.');}
    finally{cameraOpening=false;}
  }
  async function cameraShot() {
    const video=editorRoot()?.querySelector('.recipe-camera video');if(!video?.videoWidth)return message('Περίμενε να ανοίξει η κάμερα.');
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));stopCamera();await selectPhoto(blob);
  }
  async function storageRequest(path,options={},retry=true) {
    if(!S.session)throw new Error('Χρειάζεται σύνδεση.');
    if(sessionNeedsRefresh()&&!await refreshSession())throw new Error('Συνδέσου ξανά για να αποθηκεύσεις τη φωτογραφία.');
    const response=await fetch(BASE+'/storage/v1/'+path,{...options,headers:{apikey:KEY,Authorization:'Bearer '+S.session.access_token,...options.headers}});
    if(response.status===401&&retry&&await refreshSession())return storageRequest(path,options,false);
    const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{data=null;}
    if(!response.ok)throw new Error(data?.message||data?.error||'Η αποθήκευση φωτογραφίας απέτυχε.');return data;
  }
  async function resolvePhoto(path) {
    if(!S.session||signing.has(path))return;const uid=S.session.user.id;signing.add(path);
    try { const result=await storageRequest('object/sign/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})});
      if(S.session?.user.id!==uid)return;const url=result?.signedURL||result?.signedUrl;
      if(url)signed.set(path,{url:url.startsWith('https://')?url:BASE+'/storage/v1'+url,expires:Date.now()+50*60*1000});
      else signed.set(path,{url:'',expires:Date.now()+30000}); }
    catch{signed.set(path,{url:'',expires:Date.now()+30000});}
    finally{signing.delete(path);if(S.session?.user.id===uid)render();}
  }
  recipeImage=function(row) {
    if(row?.photo_url===null)return ''; // Explicit removal also suppresses recovered demo artwork.
    const path=photoPath(row?.photo_url);if(!path)return baseImage(row);
    const entry=signed.get(path);if(!entry||entry.expires<Date.now())resolvePhoto(path);return entry?.expires>Date.now()?entry.url:'';
  };
  async function removeStoredPhoto(path) {
    if(!path)return;await storageRequest('object/'+bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});signed.delete(path);
  }
  async function persistPhoto(id) {
    const previous=photoPath(draft.photo_url);
    if(photo) {
      const path=S.session.user.id+'/'+id+'/'+crypto.randomUUID()+'.jpg';
      message('Ανέβασμα φωτογραφίας…');
      await storageRequest('object/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false','cache-control':'max-age=3600'},body:photo});
      message('Σύνδεση φωτογραφίας με τη συνταγή…');
      try { draft.photo_url=await api('/rest/v1/rpc/set_recipe_photo',{method:'POST',body:JSON.stringify({p_recipe_id:id,p_path:path})}); }
      catch(error){try{await removeStoredPhoto(path);}catch{}throw error;}
      if(previous)try{await removeStoredPhoto(previous);}catch{S.status='Η φωτογραφία αποθηκεύτηκε. Η παλιά φωτογραφία δεν αφαιρέθηκε από τον χώρο αποθήκευσης.';}
    } else if(photoRemoved) {
      await api('/rest/v1/rpc/set_recipe_photo',{method:'POST',body:JSON.stringify({p_recipe_id:id,p_path:null})});draft.photo_url=null;
      if(previous)try{await removeStoredPhoto(previous);}catch{S.status='Η φωτογραφία αφαιρέθηκε από τη συνταγή. Δεν αφαιρέθηκε από τον χώρο αποθήκευσης.';}
    }
  }
  async function refreshRecipes() {
    S.detailCache={};S.homePool=null;S.homeRecipes=null;S.taxonomyRows=null;await idbSet('bootstrap',null);
    while(S.catalogLoading)await new Promise(resolve=>setTimeout(resolve,40));
    await Promise.allSettled([fetchCatalog(true),loadHomePool(),loadRecentCommunity(),loadTaxonomy(),loadModeration(),loadOwnRecipes()]);
  }
  async function saveRecipe() {
    if(saving||!draft)return;if(preparing)return message('Περίμενε να ετοιμαστεί η φωτογραφία.');
    let completed=false;
    try {
      captureDraft();stopCamera();
      const signature=editableSignature(draft),fieldsChanged=!draft.id||signature!==draft.savedFields;
      if(fieldsChanged) {
        if(!draft.title.trim())return message('Συμπλήρωσε τον τίτλο της συνταγής.');
        if(!draft.ingredients.length||draft.ingredients.some(item=>!item.item.trim()||(!String(item.qty_min).trim()&&!String(item.raw||'').trim())))return message('Συμπλήρωσε όνομα και ποσότητα ή περιγραφή για κάθε υλικό.');
        if(!draft.steps.length||draft.steps.some(step=>!step.instruction.trim()))return message('Για αλλαγή στα στοιχεία της συνταγής χρειάζεται τουλάχιστον ένα συμπληρωμένο βήμα. Για αλλαγή μόνο φωτογραφίας, κράτησε τα υπόλοιπα πεδία όπως ήταν.');
      } else if(!photo&&!photoRemoved)return message('Δεν υπάρχουν αλλαγές για αποθήκευση.');
      const selectedAtStart=selection;
      saving=true;S.busy=true;updateEditorState();
      if(fieldsChanged) {
        message('Αποθήκευση συνταγής…');
        const fields={title:draft.title,meal:draft.meal,subcategory:draft.subcategory,description:draft.description,servings:draft.servings,prep_minutes:draft.prep_minutes,cook_minutes:draft.cook_minutes,ingredients:draft.ingredients,steps:draft.steps};
        const id=await api('/rest/v1/rpc/save_recipe',{method:'POST',body:JSON.stringify({p_recipe_id:draft.id,p_data:fields})});
        if(!Number.isInteger(id))throw new Error('Δεν επιστράφηκε ο κωδικός της συνταγής.');
        draft.id=id;draft.savedFields=signature;
      }
      if(selectedAtStart!==selection)throw new Error('Η φωτογραφία άλλαξε. Αποθήκευσε ξανά.');
      await persistPhoto(draft.id);S.creating=false;S.recipeEdit=null;S.sel=null;resetDraft();completed=true;
      S.status=S.recipeManager?'Οι αλλαγές αποθηκεύτηκαν.':'Οι αλλαγές υποβλήθηκαν για έγκριση.';
    } catch(error){S.status=(error?.message||'Η αποθήκευση απέτυχε.')+' Τα πεδία και η φωτογραφία σου διατηρήθηκαν· μπορείς να δοκιμάσεις ξανά.';message(S.status);}
    finally {
      const attempted=saving;saving=false;S.busy=false;
      if(attempted)render();
    }
    // Refresh is separate from persistence: a slow catalogue must not lock Save.
    if(completed)refreshRecipes().then(()=>render()).catch(()=>{S.status='Οι αλλαγές αποθηκεύτηκαν. Ανανέωσε τη σελίδα για να ενημερωθεί ο κατάλογος.';render();});
  }
  submitRecipe=saveRecipe;
  async function editRecipe() {
    if(!mayManage(S.sel))return;const row=S.sel;resetDraft();draft=freshDraft(row);S.recipeEdit=row;S.sel=null;S.creating=false;render();
  }
  async function deleteRecipe() {
    if(saving||!mayManage(S.sel))return;
    const root=document.querySelector('.recipe-detail-modal');
    if(root.querySelector('.recipe-delete-confirm'))return;
    root.insertAdjacentHTML('beforeend','<div class="recipe-delete-confirm" role="alert"><p>Να αφαιρεθεί η συνταγή από τον κατάλογο; Θα μπορείς να αναιρέσεις τη διαγραφή. Τα υπάρχοντα πλάνα διατηρούνται.</p><button class="btn danger" type="button" data-recipe-delete-confirm>Διαγραφή</button><button class="btn ghost" type="button" data-recipe-delete-cancel>Ακύρωση</button></div>');
  }
  async function confirmDelete() {
    if(saving||!S.sel)return;const id=S.sel.id;saving=true;
    try { await api('/rest/v1/rpc/delete_recipe',{method:'POST',body:JSON.stringify({p_recipe_id:id})});S.sel=null;S.recipeUndo=id;S.status='Η συνταγή αφαιρέθηκε από τον κατάλογο.';await refreshRecipes(); }
    catch(error){S.status=error.message;}finally{saving=false;render();}
  }
  async function undoDelete() {
    try{await api('/rest/v1/rpc/restore_recipe',{method:'POST',body:JSON.stringify({p_recipe_id:S.recipeUndo})});S.recipeUndo=null;S.status='Η συνταγή επανήλθε.';await refreshRecipes();render();}catch(error){message(error.message);}
  }
  async function loadOwnRecipes() {
    if(!S.session)return;
    try{S.ownRecipes=await api('/rest/v1/recipes?select=id,title,moderation_status,recipe_origin&'+(S.recipeManager?'recipe_origin=eq.community':'created_by=eq.'+S.session.user.id)+'&order=created_at.desc&limit=200');}catch{S.ownRecipes=[];}
  }
  function managementPanel() {
    if(S.view!=='recipes'||!S.session||S.recipeManager)return;
    const workspace=document.querySelector('.workspace-inner');if(!workspace)return;
    const rows=S.ownRecipes||[];
    workspace.insertAdjacentHTML('beforeend',`<section class="panel recipe-own-list"><h2>${S.recipeManager?'Διαχείριση υποβολών χρηστών':'Οι συνταγές μου'}</h2>${rows.length?rows.map(row=>`<div class="item"><div><b>${E(row.title)}</b><span class="tag">${E(({pending:'Σε αναμονή',approved:'Δημοσιευμένη',rejected:'Δεν εγκρίθηκε'})[row.moderation_status]||row.moderation_status)}</span></div><button class="btn ghost" type="button" data-own-recipe="${row.id}">Προβολή & επεξεργασία</button></div>`).join(''):'<p class="muted">Δεν έχεις προσθέσει συνταγές ακόμη.</p>'}</section>`);
  }
  render=function() {
    const uid=S.session?.user.id||'';
    if(lastSession!==uid){resetDraft();S.recipeEdit=null;S.recipeManager=false;S.ownRecipes=[];S.recipeUndo=null;S.creating=false;signed.clear();signing.clear();lastSession=uid;ownerRequest='';clearTimeout(signedTimer);signedTimer=null;}
    captureDraft();if(!S.creating&&!S.recipeEdit&&draft&&!saving)resetDraft();
    document.querySelectorAll('.recipe-own-list,.recipe-manage-root,.recipe-undo').forEach(node=>node.remove());
    baseRender.apply(this,arguments);
    if(S.recipeEdit&&draft)document.body.insertAdjacentHTML('beforeend','<div class="recipe-manage-root">'+editModal()+'</div>');
    restoreDraft();managementPanel();
    if(S.recipeUndo)document.body.insertAdjacentHTML('beforeend','<div class="recipe-undo" role="status">Η συνταγή διαγράφηκε. <button class="btn ghost" type="button" data-recipe-undo>Αναίρεση</button></div>');
    if(uid&&ownerRequest!==uid){ownerRequest=uid;api('/rest/v1/rpc/recipe_management_access',{method:'POST',body:'{}'}).then(async allowed=>{if(S.session?.user.id!==uid)return;S.recipeManager=allowed===true;await loadOwnRecipes();render();}).catch(()=>{});}
    if(uid&&!signedTimer)signedTimer=setTimeout(()=>{signedTimer=null;if(S.session)render();},5*60*1000);
  };
  document.addEventListener('input',event=>{if(!cropSource||saving)return;const field=event.target;if(field.matches('[data-crop-zoom]'))cropZoom=Number(field.value);else if(field.matches('[data-crop-x]'))cropX=Number(field.value);else if(field.matches('[data-crop-y]'))cropY=Number(field.value);else return;renderCrop();});
  document.addEventListener('change',event=>{if(event.target.matches('[data-recipe-file],[data-recipe-capture]')){const file=event.target.files[0];event.target.value='';if(file)selectPhoto(file);}});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-recipe-camera],[data-camera-shot],[data-camera-close],[data-photo-remove],[data-photo-rotate],[data-crop-reset],[data-recipe-edit],[data-recipe-edit-close],[data-recipe-save],[data-recipe-delete],[data-recipe-delete-confirm],[data-recipe-delete-cancel],[data-recipe-undo],[data-own-recipe]');
    if(!button)return;
    if(button.hasAttribute('data-recipe-camera'))openCamera();
    else if(button.hasAttribute('data-camera-shot'))cameraShot();
    else if(button.hasAttribute('data-camera-close'))stopCamera();
    else if(button.hasAttribute('data-photo-rotate'))rotateCrop();
    else if(button.hasAttribute('data-crop-reset')){cropZoom=1;cropX=50;cropY=50;renderCrop();}
    else if(button.hasAttribute('data-photo-remove')){++selection;preparing=false;const submit=editorRoot()?.querySelector('[data-submit],[data-recipe-save]');if(submit)submit.disabled=saving;if(preview)URL.revokeObjectURL(preview);photo=null;preview='';photoRemoved=true;cropSource=null;updatePreview();message('Η φωτογραφία θα αφαιρεθεί όταν αποθηκεύσεις.');}
    else if(button.hasAttribute('data-recipe-edit'))editRecipe();
    else if(button.hasAttribute('data-recipe-edit-close')){if(saving)return;S.recipeEdit=null;resetDraft();render();}
    else if(button.hasAttribute('data-recipe-save'))saveRecipe();
    else if(button.hasAttribute('data-recipe-delete'))deleteRecipe();
    else if(button.hasAttribute('data-recipe-delete-confirm'))confirmDelete();
    else if(button.hasAttribute('data-recipe-delete-cancel'))button.closest('.recipe-delete-confirm').remove();
    else if(button.hasAttribute('data-recipe-undo'))undoDelete();
    else if(button.hasAttribute('data-own-recipe'))openRecipe(button.dataset.ownRecipe);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&S.recipeEdit&&!saving){S.recipeEdit=null;resetDraft();render();}});
  document.addEventListener('keydown',event=>{if(saving&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();}},true);
  window.addEventListener('pagehide',stopCamera);
  render();
})();
