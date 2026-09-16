import { JSDOM } from 'jsdom';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle() { for (let i = 0; i < 20; i++) await tick(); }
const sample = {
  id: 1, title: 'Κοτόπουλο κοκκινιστό με ρύζι', meal: 'Μεσημεριανά',
  subcategory: 'Κοτόπουλο', recipe_origin: 'curated', moderation_status: 'approved',
  photo_url: null, servings: 1,
  recipe_ingredients: [
    { qty_min: 160, qty_max: 160, unit: 'γρ.', item: 'Κοτόπουλο', raw: '160 γρ. κοτόπουλο' },
    { qty_min: null, qty_max: null, unit: '', item: 'Αλάτι, πιπέρι', raw: 'Αλάτι, πιπέρι' }
  ],
  recipe_steps: [{ instruction: 'Μαγείρεψε το κοτόπουλο.' }]
};

const scenarios=['complete','imported-breakfast','metadata-and-photo','upload-retry','link-retry','validation-and-retry'];
const editions=process.argv.slice(2).length?process.argv.slice(2):(await readdir(new URL('apps/',root))).filter(name=>['web','mobile'].includes(name));
for (const edition of editions) for (const scenario of scenarios) {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://test.example', runScripts: 'outside-only' });
  const w = dom.window, calls = [], errors = [];
  const run = code => runInContext(code, dom.getInternalVMContext());
  let failUpload=scenario==='upload-retry',failLink=scenario==='link-retry';
  const objects=new Set();
  try {
    w.addEventListener('error', event => errors.push(event.error));
    w.crypto.randomUUID = randomUUID;
    w.URL.createObjectURL = () => 'blob:' + randomUUID();
    w.URL.revokeObjectURL = () => {};
    w.Image = class { naturalWidth = 1600; naturalHeight = 1200; set src(value) { Promise.resolve().then(() => this.onload()); } };
    w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {}, translate() {}, rotate() {} });
    w.HTMLCanvasElement.prototype.toBlob = callback => callback(new w.Blob(['image'], { type: 'image/jpeg' }));
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.fixture = structuredClone(['imported-breakfast','validation-and-retry'].includes(scenario)
      ? { ...sample, id: 1001, meal: 'Πρωινό', recipe_steps: [], source_text: 'Εκτέλεση:\\n1. Χτύπησε τα αυγά.\\n2. Ψήσε την ομελέτα.' }
      : sample);
    const server=structuredClone(w.fixture),before=JSON.stringify(server);
    const photoPrefix='https://ccvdkbdnykfhenhqkicm.supabase.co/storage/v1/object/authenticated/recipe-photos/';
    const failure=message=>({ok:false,status:400,text:async()=>JSON.stringify({message})});
    w.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      let data = [];
      if (String(url).endsWith('/recipe_management_access')) data = true;
      else if (String(url).endsWith('/save_recipe')) {
        const payload = JSON.parse(options.body);
        if (!payload.p_data.steps.length) return failure('Χρειάζονται 1–100 υλικά και βήματα.');
        assert(payload.p_data.ingredients.every(item=>String(item.qty_min).trim()||item.raw),'Preserve qualitative ingredients');
        data = payload.p_recipe_id;
        const {ingredients,steps,...fields}=payload.p_data;
        Object.assign(server,fields,{recipe_ingredients:ingredients,recipe_steps:steps});
      }
      else if (String(url).includes('/object/recipe-photos/')) {
        if(failUpload){failUpload=false;return failure('Δοκιμή: αποτυχία ανεβάσματος');}
        objects.add(String(url).split('/object/recipe-photos/')[1]);data={};
      }
      else if (String(url).endsWith('/object/recipe-photos')&&options.method==='DELETE') {
        JSON.parse(options.body).prefixes.forEach(path=>objects.delete(path));data={};
      }
      else if (String(url).endsWith('/set_recipe_photo')) {
        if(failLink){failLink=false;return failure('Δοκιμή: αποτυχία σύνδεσης φωτογραφίας');}
        const {p_path}=JSON.parse(options.body);assert(objects.has(p_path));
        server.photo_url=photoPrefix+p_path;data=server.photo_url;
      }
      else if (String(url).includes('/object/sign/')) data={signedURL:'/object/sign/fixture.jpg?token=test-only'};
      else if (String(url).startsWith('/api/recipe?')) data=[structuredClone(server)];
      else if (String(url).startsWith('/api/catalog?')) data=[structuredClone(server)];
      return { ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data };
    };
    for (const file of ['shared/app1.js', 'shared/app2.js', 'shared/app3.js']) run(await readFile(new URL(file, root), 'utf8'));
    run(`readSession=()=>null;idbGet=async()=>null;idbSet=async()=>{};`);
    run(await readFile(new URL('apps/'+edition+'/app4.js', root), 'utf8'));
    for (const file of ['ai', 'legal', 'moderation-edit', 'account-settings', 'enhancements']) run(await readFile(new URL('shared/' + file + '.js', root), 'utf8'));
    if (edition === 'mobile') run(await readFile(new URL('apps/mobile/mobile.js', root), 'utf8'));
    run(await readFile(new URL('shared/recipe-management.js', root), 'utf8'));
    run(`S.session={user:{id:'11111111-1111-4111-8111-111111111111'},access_token:'test-only',expires_at:9999999999};S.house={id:1,name:'Test'};S.view='recipes';S.__bootResolved=true;S.recipes=[fixture];S.taxonomyRows=[fixture];render();`);
    await settle();
    run('S.sel=fixture;render();');
    w.document.querySelector('[data-recipe-edit]').click();
    if(['metadata-and-photo','validation-and-retry'].includes(scenario))w.document.querySelector('#ct').value='Ενημερωμένος τίτλος';
    const file = w.document.querySelector('[data-recipe-file]');
    Object.defineProperty(file, 'files', { value: [new w.File(['image'], 'fixture.png', { type: 'image/png' })] });
    file.dispatchEvent(new w.Event('change', { bubbles: true }));
    await settle();
    assert.equal(w.document.querySelector('.recipe-photo-preview').hidden, false);
    w.document.querySelector('[data-recipe-save]').click();
    await settle();
    if(['upload-retry','link-retry','validation-and-retry'].includes(scenario)) {
      const footer=w.document.querySelector('.recipe-save-status');
      assert(footer?.textContent,edition+': error must be visible next to Save');
      assert.equal(w.document.querySelector('[data-recipe-save]').disabled,false,'Failure must allow retry');
      assert.equal(w.document.querySelector('.recipe-photo-preview').hidden,false,'Retain selected image');
      assert.equal(JSON.stringify(server),before,'Failed photo-only save must not change the recipe');
      if(scenario==='link-retry')assert.equal(objects.size,0,'Failed link must clean up the new object');
      if(scenario==='validation-and-retry') {
        assert.match(footer.textContent,/τουλάχιστον ένα/);
        assert(!calls.some(c=>c.url.endsWith('/save_recipe')),'Reject invalid recipe fields before RPC');
        w.document.querySelector('[data-add-step]').click();
        assert.equal(w.document.querySelectorAll('.step-row').length,1,'Edit-mode add-step handler works exactly once');
        w.document.querySelector('[data-step-text]').value='Ψήσε την ομελέτα.';
      }
      w.document.querySelector('[data-recipe-save]').click();await settle();
    }
    assert.deepEqual(errors, []);
    assert(calls.some(c => c.url.includes('/object/recipe-photos/')), edition + ': the image must be uploaded');
    assert(calls.some(c => c.url.endsWith('/set_recipe_photo')), edition + ': the image must be linked');
    assert.equal(w.document.querySelector('[data-recipe-save]'),null,'Successful save closes the editor');
    assert.equal(objects.size,1,'Exactly one photo is retained');
    const metadataChanged=['metadata-and-photo','validation-and-retry'].includes(scenario);
    assert.equal(calls.filter(c=>c.url.endsWith('/save_recipe')).length,metadataChanged?1:0,'Photo-only edits must not rewrite/validate recipe fields');
    if(!metadataChanged)assert.equal(JSON.stringify({...server,photo_url:null}),before,'Preserve original recipe, category and steps');
    // Re-open through the real detail loader after cache invalidation. Only the
    // HTTP boundary is mocked; all renderers and event handlers are production code.
    await run('openRecipe(fixture.id)');await settle();
    assert(w.document.querySelector('.recipe-detail-photo')?.getAttribute('src')?.includes('/object/sign/'),'Reopened recipe displays persisted photo');
    console.log('PASS',edition,scenario,'— upload, link and reopened image verified');
  } finally { w.close(); }
}
