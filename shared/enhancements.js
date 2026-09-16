/* PoT & Thyme — progressive UX enhancements (additive overlay).
   Wraps the existing render() without modifying the base app files. */
(function(){
  if(window.__potEnhanced||typeof render!=='function')return;
  window.__potEnhanced=true;
  var baseRender=render,statusTimer=null;

  function skeletonGrid(n){
    var card='<article class="card skel">'+
      '<div class="skel-line skel-tag"></div>'+
      '<div class="skel-line skel-title"></div>'+
      '<div class="skel-line skel-sub"></div>'+
      '<div class="skel-actions"><span class="skel-btn"></span><span class="skel-btn"></span></div>'+
      '</article>';
    return '<div class="grid skeleton-grid">'+new Array(n+1).join(card)+'</div>';
  }

  function postRender(){
    if(typeof S==='undefined')return;

    /* 1) Recipe grid: real skeletons while loading, friendly copy on empty search */
    var main=document.querySelector('.layout > main');
    if(main&&S.view==='recipes'){
      var loading=main.querySelector('.catalog-loading');
      if(loading){
        var searching=(S.search&&S.search.trim())||S.cat;
        loading.outerHTML=searching
          ?'<div class="empty">Δεν βρέθηκαν συνταγές για την αναζήτησή σου. Δοκίμασε άλλον όρο.</div>'
          :skeletonGrid(6);
      }
    }

    /* 2) Empty plan -> call to action */
    var empties=document.querySelectorAll('.empty');
    for(var i=0;i<empties.length;i++){
      var el=empties[i];
      if(el.getAttribute('data-cta')||el.querySelector('button'))continue;
      if(el.textContent.indexOf('Δεν έχεις γεύματα')>-1){
        el.setAttribute('data-cta','1');
        el.appendChild(document.createElement('br'));
        var b=document.createElement('button');
        b.className='btn ghost';b.type='button';b.textContent='Δες συνταγές';
        b.addEventListener('click',function(){S.view='recipes';render();});
        el.appendChild(b);
      }
    }

    /* 3) Invite-code copy feedback */
    var copy=document.querySelector('[data-copy]');
    if(copy&&!copy.getAttribute('data-fb')){
      copy.setAttribute('data-fb','1');
      copy.addEventListener('click',function(){
        var btn=this;
        if(btn.getAttribute('data-reverting'))return;
        var prev=btn.textContent;
        btn.setAttribute('data-reverting','1');
        btn.textContent='Αντιγράφηκε ✓';
        setTimeout(function(){btn.textContent=prev;btn.removeAttribute('data-reverting');},1500);
      });
    }

    /* 4) Auto-dismiss the status banner */
    clearTimeout(statusTimer);
    if(S.status){
      statusTimer=setTimeout(function(){if(S.status){S.status='';render();}},4500);
    }
  }

  render=function(){baseRender.apply(this,arguments);try{postRender();}catch(e){}};

  /* 5) Escape closes any open modal / overlay */
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||typeof S==='undefined')return;
    var changed=false;
    if(S.sel){S.sel=null;changed=true;}
    if(S.creating){S.creating=false;changed=true;}
    if(S.privacyOpen){S.privacyOpen=false;changed=true;}
    if(S.adminEdit){S.adminEdit=null;changed=true;}
    if(changed)render();
  });

  try{render();}catch(e){}
})();