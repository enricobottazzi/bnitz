const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const DRAFT = 'bnitz-composer-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const blank = () => ({version:1,title:'',author:'',year:new Date().getFullYear(),text:'',canvas:{width:460,height:680},shapes:[]});
let article = blank(), slug = null, selectedId = null, selectedPoint = null, pendingRange = null;
let textDraft = '', editingText = true;
let preview = false, tool = 'select', gesture = null, fitScale = 1, history = [], historyIndex = -1;
const selected = () => article.shapes.find(shape => shape.id === selectedId);
const status = (message, error=false) => { $('status').textContent=message; $('status').classList.toggle('error',error); };
const el = (tag, attrs={}) => { const node=document.createElementNS(NS,tag); Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v)); return node; };
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

function confirmAction(title,message,label='Continue') {
  $('confirmTitle').textContent=title; $('confirmMessage').textContent=message; $('confirmYes').textContent=label;
  $('confirmDialog').showModal();
  return new Promise(resolve => {
    const finish = answer => { $('confirmDialog').close(); $('confirmYes').onclick=null; $('confirmNo').onclick=null; $('confirmDialog').oncancel=null; resolve(answer); };
    $('confirmYes').onclick=()=>finish(true); $('confirmNo').onclick=()=>finish(false);
    $('confirmDialog').oncancel=event=>{event.preventDefault();finish(false);};
  });
}
function persist() {
  try { localStorage.setItem(DRAFT,JSON.stringify({article,slug,textDraft,editingText})); $('draftState').textContent='Draft saved locally'; }
  catch { $('draftState').textContent='Draft storage full — download to keep it'; }
}
function commit() {
  const snapshot=JSON.stringify(article);
  if (history[historyIndex]!==snapshot) { history=history.slice(0,historyIndex+1); history.push(snapshot); if(history.length>60)history.shift(); historyIndex=history.length-1; }
  persist(); render();
}
function resetHistory() { history=[];historyIndex=-1;commit(); }
function undo(direction) {
  const next=historyIndex+direction; if(next<0||next>=history.length)return;
  const keepText=textDraft!==article.text;
  historyIndex=next;article=JSON.parse(history[next]);if(!keepText)textDraft=article.text;pendingRange=null;syncFields();persist();render();
}
function syncFields() {
  for(const key of ['title','author','year'])$(key).value=article[key];
  $('textInput').value=textDraft; $('canvasWidth').value=article.canvas.width; $('canvasHeight').value=article.canvas.height;
}
function textMode(edit) { editingText=edit; $('pastePanel').hidden=!edit; $('linkPanel').hidden=edit; $('editText').textContent=edit?'Cancel editing':'Edit text'; }
function hasDraftContent() { return Boolean(article.text.trim()||textDraft.trim()||article.title.trim()||article.author.trim()||article.shapes.length||article.year!==blank().year||article.canvas.width!==460||article.canvas.height!==680); }
function requireAppliedText() { if(textDraft!==article.text)throw Error('Choose “Use this text” to apply your text changes first.'); }
function selectShape(id) { selectedId=id;selectedPoint=null;pendingRange=null; render();$('canvas').focus({preventScroll:true}); }

function renderText() {
  const ranges=selected()?.ranges || [];
  const bounds=[...new Set([0,article.text.length,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
  const fragment=document.createDocumentFragment();
  for(let i=0;i<bounds.length-1;i++) {
    const start=bounds[i],end=bounds[i+1];
    const matches=ranges.filter(r=>r.start<=start&&r.end>=end);
    const text=article.text.slice(start,end);
    if(!matches.length)fragment.append(document.createTextNode(text));
    else { const mark=document.createElement('mark');mark.className=matches.some(r=>r.grade==='primary')?'strong':'soft';mark.textContent=text;fragment.append(mark); }
  }
  const scroll=$('textPreview').scrollTop; $('textPreview').replaceChildren(fragment);$('textPreview').scrollTop=scroll;
  $('selectionHint').textContent=pendingRange?`${pendingRange.end-pendingRange.start} characters selected` : selected()?'Select wording, then choose a highlight strength.':'Select a shape, then select its wording.';
  $('linkStrong').disabled=$('linkSoft').disabled=!selected()||!pendingRange;
}
function geometry(shape) {
  switch(shape.type) {
    case 'ellipse': return el('ellipse',{cx:.5,cy:.5,rx:.5,ry:.5});
    case 'polygon': case 'polyline': case 'freehand': return el(shape.type==='polygon'?'polygon':'polyline',{points:shape.points.map(p=>p.join(',')).join(' ')});
    case 'curve': {const p=shape.points;return el('path',{d:`M${p[0]} C${p[1]} ${p[2]} ${p[3]}`});}
    case 'path': return el('path',{d:shape.path});
  }
}
function shapeTransform(shape) {return `translate(${shape.x} ${shape.y}) rotate(${shape.rotation||0} ${shape.width/2} ${shape.height/2}) scale(${shape.width} ${shape.height})`;}
function worldPoint(shape,p) {
  const angle=(shape.rotation||0)*Math.PI/180, x=(p[0]-.5)*shape.width, y=(p[1]-.5)*shape.height;
  return {x:shape.x+shape.width/2+x*Math.cos(angle)-y*Math.sin(angle), y:shape.y+shape.height/2+x*Math.sin(angle)+y*Math.cos(angle)};
}
function localPoint(shape,p) {
  const angle=-(shape.rotation||0)*Math.PI/180,x=p.x-shape.x-shape.width/2,y=p.y-shape.y-shape.height/2;
  return [(x*Math.cos(angle)-y*Math.sin(angle))/shape.width+.5,(x*Math.sin(angle)+y*Math.cos(angle))/shape.height+.5];
}
function renderCanvas() {
  $('canvas').setAttribute('viewBox',`0 0 ${article.canvas.width} ${article.canvas.height}`);
  const scale=fitScale*Number($('zoom').value)/100;
  $('canvas').style.width=`${article.canvas.width*scale}px`; $('canvas').style.height=`${article.canvas.height*scale}px`;
  $('canvasBackground').setAttribute('fill',$('grid').checked?'url(#dots)':'#fff');
  $('shapes').replaceChildren();$('handles').replaceChildren();
  for(const shape of article.shapes) {
    const group=el('g',{'data-shape':shape.id,transform:shapeTransform(shape),role:'button',tabindex:0,'aria-label':shape.name||'Shape','aria-pressed':shape.id===selectedId?'true':'false'});
    const ink=geometry(shape); if(!ink)continue;
    const highlighted=preview && shape.id===selectedId;
    const outline=shape.outline || ['polyline','curve','freehand'].includes(shape.type);
    const hit=ink.cloneNode();hit.setAttribute('fill',outline?'none':'transparent');hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','16');hit.setAttribute('vector-effect','non-scaling-stroke');hit.setAttribute('pointer-events',outline?'stroke':'all');
    ink.setAttribute('class','shape-ink'); ink.setAttribute('fill',highlighted&&!outline?'#deff00':shape.fill||'none');
    ink.setAttribute('stroke',highlighted&&outline?'#deff00':shape.stroke||'#333333');ink.setAttribute('stroke-width',highlighted&&outline?Math.max(4,shape.strokeWidth):shape.strokeWidth);
    ink.setAttribute('vector-effect','non-scaling-stroke');ink.setAttribute('stroke-linejoin','round');ink.setAttribute('stroke-linecap','round');ink.setAttribute('pointer-events','none');
    if(shape.dash)ink.setAttribute('stroke-dasharray',shape.dash);
    ink.setAttribute('opacity',shape.opacity??1);group.append(hit,ink);$('shapes').append(group);
  }
  const shape=selected(); if(shape&&!preview) {
    const corners=[[0,0],[1,0],[1,1],[0,1]].map(p=>worldPoint(shape,p));
    $('handles').append(el('polygon',{points:corners.map(p=>`${p.x},${p.y}`).join(' '),class:'selected-outline',fill:'none',stroke:'#999','stroke-dasharray':'3 4','stroke-width':.8,'pointer-events':'none'}));
    const radius=5/scale;
    const resize=worldPoint(shape,[1,1]);$('handles').append(el('circle',{cx:resize.x,cy:resize.y,r:radius*1.35,class:'handle resize-handle','data-handle':'resize',fill:'#deff00',stroke:'#555','stroke-width':1}));
    const rotate=worldPoint(shape,[.5,-28/shape.height]); const top=worldPoint(shape,[.5,0]);
    $('handles').append(el('line',{x1:top.x,y1:top.y,x2:rotate.x,y2:rotate.y,stroke:'#aaa','pointer-events':'none'}));
    $('handles').append(el('circle',{cx:rotate.x,cy:rotate.y,r:radius,class:'handle','data-handle':'rotate',fill:'#fff',stroke:'#555'}));
    if(shape.points && shape.type!=='freehand') {
      if(shape.type==='curve')$('handles').append(el('polyline',{points:shape.points.map(p=>{const w=worldPoint(shape,p);return `${w.x},${w.y}`;}).join(' '),fill:'none',stroke:'#bbb','stroke-dasharray':'2 3','pointer-events':'none'}));
      shape.points.forEach((point,index)=>{const p=worldPoint(shape,point);$('handles').append(el('circle',{cx:p.x,cy:p.y,r:radius*.85,class:'handle point-handle','data-point':index,fill:index===selectedPoint?'#deff00':'#fff',stroke:'#555'}));});
    }
  }
}
function renderInspector() {
  const shape=selected();$('shapeSettings').disabled=!shape; $('noShape').hidden=Boolean(shape);
  $('removeShape').disabled=!shape||preview;
  if(shape) {
    const values={shapeName:shape.name||'',shapeX:shape.x,shapeY:shape.y,shapeWidth:shape.width,shapeHeight:shape.height,shapeRotation:shape.rotation||0,shapeStroke:shape.stroke,shapeWeight:shape.strokeWidth,shapeDash:shape.dash||'',shapeFill:shape.fill==='none'?'#ffffff':shape.fill,shapeOpacity:shape.opacity??1,shapeSides:shape.sides||Math.max(3,shape.points?.length||5),innerRatio:shape.innerRatio||.45};
    Object.entries(values).forEach(([id,value])=>{if(document.activeElement!==$(id))$(id).value=typeof value==='number'?Math.round(value*100)/100:value;});
    $('rotationValue').textContent=`${Math.round(shape.rotation||0)}°`;$('noFill').checked=shape.fill==='none';$('outlineOnly').checked=Boolean(shape.outline);
    $('polygonControls').hidden=!shape.preset;$('starControls').hidden=shape.preset!=='star';
    $('pointActions').hidden=!['polygon','polyline'].includes(shape.type);
    $('removePoint').disabled=selectedPoint===null||shape.points?.length<=(shape.type==='polygon'?3:2);
  } else {$('polygonControls').hidden=true;$('pointActions').hidden=true;}
  $('connections').replaceChildren();
  if(!shape || !shape.ranges.length) {const p=document.createElement('p');p.className='hint';p.textContent=shape?'No text connected yet.':'No shape selected.';$('connections').append(p);}
  else shape.ranges.forEach((range,index)=> {
    const row=document.createElement('div');row.className='connection';
    const text=document.createElement('span');text.textContent=`${range.grade==='primary'?'Strong':'Soft'} · ${article.text.slice(range.start,range.end).slice(0,90)}`;
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Remove connection ${index+1}`);remove.onclick=()=>{shape.ranges.splice(index,1);commit();};row.append(text,remove);$('connections').append(row);
  });
  $('layers').replaceChildren();
  [...article.shapes].reverse().forEach(shape=>{const button=document.createElement('button');button.className='layer'+(shape.id===selectedId?' is-selected':'');button.textContent=shape.name||shape.type;button.onclick=()=>selectShape(shape.id);$('layers').append(button);});
}
function render() {
  if(!selected())selectedId=null;
  renderCanvas();renderText();renderInspector();
  $('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;
  $('tools').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',button.dataset.tool===tool?'true':'false'));
  $('canvasHint').textContent=preview?'Select a shape to read its connections.':tool==='freehand'?'Draw anywhere on the map. Release to finish.':'Drag a shape to move it. White handles reshape; lime resizes; the upper handle rotates.';
}
function fit() {
  fitScale=Math.min(($('canvasViewport').clientWidth-32)/article.canvas.width,($('canvasViewport').clientHeight-32)/article.canvas.height);
  fitScale=Math.max(.2,fitScale);$('zoom').value=100;renderCanvas();
}
function polygonPoints(sides,inner=null) {
  const count=inner?sides*2:sides;
  return Array.from({length:count},(_,i)=>{const angle=-Math.PI/2+2*Math.PI*i/count,r=inner&&i%2?inner*.5:.5;return [.5+Math.cos(angle)*r,.5+Math.sin(angle)*r];});
}
function createShape(kind) {
  const width=kind==='line'?160:kind==='star'?70:120,height=kind==='line'?50:kind==='curve'?110:120;
  const shape={id:'s-'+crypto.randomUUID(),name:kind[0].toUpperCase()+kind.slice(1),type:kind,x:(article.canvas.width-width)/2,y:(article.canvas.height-height)/2,width,height,rotation:0,stroke:'#333333',strokeWidth:1.8,fill:'none',opacity:1,outline:false,ranges:[]};
  if(['triangle','polygon','star'].includes(kind)) {shape.type='polygon';shape.preset=kind;shape.sides=kind==='triangle'?3:kind==='star'?6:5;shape.innerRatio=.45;shape.points=polygonPoints(shape.sides,kind==='star'?.45:null);}
  if(kind==='line'){shape.type='polyline';shape.points=[[0,0],[1,1]];shape.outline=true;}
  if(kind==='curve'){shape.points=[[0,1],[0,0],[1,0],[1,1]];shape.outline=true;}
  return shape;
}
$('tools').onclick=event=> {
  const kind=event.target.closest('[data-tool]')?.dataset.tool;if(!kind)return;
  if(kind==='select'||kind==='freehand'){tool=kind;render();return;}
  const shape=createShape(kind);article.shapes.push(shape);selectedId=shape.id;selectedPoint=null;tool='select';commit();$('canvas').focus({preventScroll:true});
};
function canvasPoint(event) {const point=new DOMPoint(event.clientX,event.clientY).matrixTransform($('canvas').getScreenCTM().inverse());return {x:point.x,y:point.y};}
function snap(value) {return $('snap').checked?Math.round(value/14)*14:value;}
$('canvas').addEventListener('pointerdown',event=> {
  if(event.button!==0)return;
  const p=canvasPoint(event),target=event.target;
  const id=target.closest('[data-shape]')?.dataset.shape;
  if(preview){if(id){selectShape(id);const mark=$('textPreview').querySelector('mark');if(mark)$('textPreview').scrollTop=mark.offsetTop-$('textPreview').offsetTop-40;}return;}
  if(tool==='freehand'){gesture={mode:'draw',points:[p]};$('canvas').setPointerCapture(event.pointerId);event.preventDefault();return;}
  const shape=selected();
  if(target.hasAttribute('data-point')&&shape){selectedPoint=Number(target.dataset.point);gesture={mode:'point',shape,point:selectedPoint};}
  else if(target.dataset.handle&&shape){gesture={mode:target.dataset.handle,shape,before:clone(shape),start:p};}
  else if(id){selectedId=id;selectedPoint=null;pendingRange=null;gesture={mode:'move',shape:selected(),before:clone(selected()),start:p};}
  else{selectedId=null;selectedPoint=null;render();return;}
  $('canvas').setPointerCapture(event.pointerId);event.preventDefault();render();$('canvas').focus({preventScroll:true});
});
$('canvas').addEventListener('pointermove',event=> {
  if(!gesture)return;const p=canvasPoint(event),g=gesture;
  if(g.mode==='draw'){
    const last=g.points[g.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)<2)return;g.points.push(p);
    $('handles').replaceChildren(el('polyline',{points:g.points.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#333','stroke-width':1.8,'stroke-linejoin':'round','pointer-events':'none'}));return;
  }
  if(g.mode==='move'){g.shape.x=snap(g.before.x+p.x-g.start.x);g.shape.y=snap(g.before.y+p.y-g.start.y);}
  if(g.mode==='point'){g.shape.points[g.point]=localPoint(g.shape,p);delete g.shape.preset;}
  if(g.mode==='rotate'){const center={x:g.before.x+g.before.width/2,y:g.before.y+g.before.height/2};let angle=Math.round(Math.atan2(p.y-center.y,p.x-center.x)*180/Math.PI+90);if(event.shiftKey)angle=Math.round(angle/15)*15;g.shape.rotation=((angle+180)%360+360)%360-180;}
  if(g.mode==='resize'){
    const anchor=worldPoint(g.before,[0,0]);g.shape.x=g.before.x;g.shape.y=g.before.y;
    const local=localPoint(g.before,p);g.shape.width=Math.max(2,snap(local[0]*g.before.width));g.shape.height=Math.max(2,snap(local[1]*g.before.height));
    if(event.shiftKey)g.shape.height=g.shape.width*g.before.height/g.before.width;
    const moved=worldPoint(g.shape,[0,0]);g.shape.x+=anchor.x-moved.x;g.shape.y+=anchor.y-moved.y;
  }
  renderCanvas();renderInspector();
});
function endGesture() {
  if(!gesture)return;const g=gesture;gesture=null;
  if(g.mode==='draw') {
    if(g.points.length<2){render();return;}
    const xs=g.points.map(p=>p.x),ys=g.points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(2,Math.max(...xs)-x),height=Math.max(2,Math.max(...ys)-y);
    const shape={...createShape('freehand'),x,y,width,height,outline:true,points:g.points.map(p=>[(p.x-x)/width,(p.y-y)/height])};article.shapes.push(shape);selectedId=shape.id;tool='select';
  }
  commit();
}
$('canvas').addEventListener('pointerup',endGesture);$('canvas').addEventListener('pointercancel',endGesture);
$('canvas').addEventListener('keydown',event=> {
  const id=event.target.closest('[data-shape]')?.dataset.shape;
  if(id&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectShape(id);return;}
  const shape=selected();if(!shape||preview)return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {event.preventDefault();const d=event.shiftKey?10:1;shape.x+=event.key==='ArrowRight'?d:event.key==='ArrowLeft'?-d:0;shape.y+=event.key==='ArrowDown'?d:event.key==='ArrowUp'?-d:0;commit();$('canvas').focus({preventScroll:true});}
});
function captureSelection() {
  const selection=window.getSelection();if(!selection.rangeCount||selection.isCollapsed)return;
  const range=selection.getRangeAt(0).cloneRange(),container=$('textPreview');
  if(preview||$('linkPanel').hidden)return;
  const contents=document.createRange();contents.selectNodeContents(container);
  // A drag can finish outside the panel, especially after the final paragraph.
  if(!range.intersectsNode(container))return;
  if(range.compareBoundaryPoints(Range.START_TO_START,contents)<0)range.setStart(contents.startContainer,contents.startOffset);
  if(range.compareBoundaryPoints(Range.END_TO_END,contents)>0)range.setEnd(contents.endContainer,contents.endOffset);
  if(range.collapsed||!range.toString().trim())return;
  const prefix=contents.cloneRange();prefix.setEnd(range.startContainer,range.startOffset);
  const start=prefix.toString().length;
  pendingRange={start,end:start+range.toString().length};
  $('selectionHint').textContent=`${pendingRange.end-pendingRange.start} characters selected`;
  $('linkStrong').disabled=$('linkSoft').disabled=!selected();
}
// Keep captured offsets when clicking a highlight button collapses the selection.
document.addEventListener('selectionchange',captureSelection);
document.addEventListener('pointerup',captureSelection);
$('textPreview').addEventListener('keyup',captureSelection);
function link(grade) {if(!selected()||!pendingRange)return;selected().ranges.push({...pendingRange,grade});pendingRange=null;window.getSelection().removeAllRanges();commit();status('Text connected. Select another passage or another shape.');}
$('linkStrong').onclick=()=>link('primary');$('linkSoft').onclick=()=>link('secondary');
$('textInput').addEventListener('input',()=>{textDraft=$('textInput').value;persist();});
$('editText').onclick=async()=>{
  if(editingText) {
    if(textDraft!==article.text&&!await confirmAction('Discard text changes?','Your last applied text and its connections will be kept.','Discard changes'))return;
    textDraft=article.text;$('textInput').value=textDraft;textMode(!article.text);
  } else textMode(true);
  persist();
};
$('applyText').onclick=async()=> {
  const text=$('textInput').value;if(!text.trim()){status('Paste some article text first.',true);return;}
  if(text!==article.text&&article.shapes.some(s=>s.ranges.length)&&!await confirmAction('Update the text?','Your shapes will stay, but their text connections will be cleared so you can reconnect them to the updated text.','Update text'))return;
  if(text!==article.text)article.shapes.forEach(shape=>{shape.ranges=[];});article.text=text;textDraft=text;pendingRange=null;textMode(false);commit();status('Add a shape, then select wording to connect it.');
};
for(const key of ['title','author','year']) {
  const update=()=>{article[key]=key==='year'?Number($(key).value):$(key).value;};
  $(key).addEventListener('input',()=>{update();persist();});
  $(key).addEventListener('change',()=>{update();commit();});
}
const fields={shapeName:['name',String],shapeX:['x',Number],shapeY:['y',Number],shapeWidth:['width',v=>Math.max(2,Number(v))],shapeHeight:['height',v=>Math.max(2,Number(v))],shapeRotation:['rotation',Number],shapeStroke:['stroke',String],shapeWeight:['strokeWidth',v=>clamp(Number(v),.5,16)],shapeDash:['dash',String],shapeFill:['fill',String],shapeOpacity:['opacity',Number]};
Object.entries(fields).forEach(([id,[key,parse]])=>$(id).addEventListener('change',()=>{const shape=selected();if(!shape)return;const value=parse($(id).value);if(typeof value==='number'&&!Number.isFinite(value))return;shape[key]=value;if(key==='fill')$('noFill').checked=false;commit();}));
$('shapeRotation').addEventListener('input',()=>{$('rotationValue').textContent=`${$('shapeRotation').value}°`;});
$('noFill').onchange=()=>{if(selected()){selected().fill=$('noFill').checked?'none':$('shapeFill').value;commit();}};
$('outlineOnly').onchange=()=>{if(selected()){selected().outline=$('outlineOnly').checked;commit();}};
function regenerate() {const shape=selected();if(!shape?.preset)return;shape.sides=clamp(Math.round(Number($('shapeSides').value))||5,3,24);shape.innerRatio=Number($('innerRatio').value);shape.points=polygonPoints(shape.sides,shape.preset==='star'?shape.innerRatio:null);commit();}
$('shapeSides').onchange=regenerate;$('innerRatio').onchange=regenerate;
function deleteSelected() {if(!selected()||preview)return;article.shapes=article.shapes.filter(s=>s.id!==selectedId);selectedId=null;selectedPoint=null;pendingRange=null;commit();$('canvas').focus({preventScroll:true});status('Shape deleted. Use Undo to restore it.');}
$('removeShape').onclick=deleteSelected;
document.addEventListener('keydown',event=>{
  if(!['Delete','Backspace'].includes(event.key)||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||preview||!selected())return;
  if(event.target.closest('input,textarea,select,[contenteditable="true"],dialog,#textPreview')||document.querySelector('dialog[open]')||!window.getSelection().isCollapsed)return;
  event.preventDefault();deleteSelected();
});
$('duplicate').onclick=()=>{if(!selected())return;const shape=clone(selected());shape.id='s-'+crypto.randomUUID();shape.name+=' copy';shape.x+=20;shape.y+=20;article.shapes.push(shape);selectedId=shape.id;commit();};
function flip(axis) {const shape=selected();if(!shape)return;if(shape.points)shape.points=shape.points.map(p=>axis==='x'?[1-p[0],p[1]]:[p[0],1-p[1]]);else if(shape.type==='path'){status('Use rotation for this imported shape; draw a new polygon to edit its points.');return;}commit();}
$('flipH').onclick=()=>flip('x');$('flipV').onclick=()=>flip('y');
function layer(direction) {const i=article.shapes.findIndex(s=>s.id===selectedId),j=i+direction;if(i<0||j<0||j>=article.shapes.length)return;[article.shapes[i],article.shapes[j]]=[article.shapes[j],article.shapes[i]];commit();}
$('bringForward').onclick=()=>layer(1);$('sendBackward').onclick=()=>layer(-1);
$('addPoint').onclick=()=>{const s=selected();if(!s?.points)return;const i=selectedPoint??s.points.length-1,a=s.points[i],b=s.points[(i+1)%s.points.length];s.points.splice(i+1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2]);delete s.preset;selectedPoint=i+1;commit();};
$('removePoint').onclick=()=>{const s=selected();if(s?.points&&selectedPoint!==null&&s.points.length>(s.type==='polygon'?3:2)){s.points.splice(selectedPoint,1);delete s.preset;selectedPoint=null;commit();}};
for(const [id,key,max] of [['canvasWidth','width',2000],['canvasHeight','height',2400]])$(id).onchange=()=>{article.canvas[key]=clamp(Number($(id).value)||460,200,max);syncFields();commit();fit();};
$('undo').onclick=()=>undo(-1);$('redo').onclick=()=>undo(1);
$('zoom').oninput=renderCanvas;$('grid').onchange=renderCanvas;$('fit').onclick=fit;
$('previewButton').onclick=()=>{try{requireAppliedText();preview=!preview;document.body.classList.toggle('preview',preview);$('previewButton').textContent=preview?'Back to composer':'Preview';if(preview)textMode(false);persist();render();requestAnimationFrame(fit);}catch(error){status(error.message,true);}};
function validate(data,complete=true) {
  if(data?.version!==1||!data.canvas||!Array.isArray(data.shapes)||typeof data.text!=='string'||typeof data.title!=='string'||typeof data.author!=='string'||!Number.isFinite(data.year))throw Error('This file could not be opened as an article.');
  if(complete&&(!data.title.trim()||!data.author.trim()||!Number.isInteger(data.year)||data.year<1||data.year>9999||!data.text.trim()))throw Error('Add a title, author, year and article text before exporting.');
  if(!Number.isFinite(data.canvas.width)||!Number.isFinite(data.canvas.height)||data.canvas.width<200||data.canvas.height<200)throw Error('Invalid canvas size.');
  const ids=new Set();
  for(const s of data.shapes) {
    if(!s||!['ellipse','polygon','polyline','curve','freehand','path'].includes(s.type)||typeof s.id!=='string'||ids.has(s.id)||![s.x,s.y,s.width,s.height,s.rotation,s.strokeWidth].every(Number.isFinite)||s.width<=0||s.height<=0||!Array.isArray(s.ranges))throw Error('This article contains an invalid shape.');
    if(s.points!==undefined&&(!Array.isArray(s.points)||s.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))throw Error('This article contains invalid shape points.');
    if(['polygon','polyline','curve','freehand'].includes(s.type)&&(!Array.isArray(s.points)||(s.type==='curve'?s.points.length!==4:s.points.length<(s.type==='polygon'?3:2))))throw Error('This article contains invalid shape points.');
    if(s.type==='path'&&typeof s.path!=='string')throw Error('This article contains an invalid shape.');
    if(s.ranges.some(r=>!r||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end>data.text.length||r.start>=r.end||!['primary','secondary'].includes(r.grade)))throw Error('This article contains an invalid text connection.');ids.add(s.id);
  }
}
function loadArticle(data,newSlug=null) {validate(data);article=clone(data);textDraft=article.text;slug=newSlug;selectedId=null;selectedPoint=null;pendingRange=null;preview=false;document.body.classList.remove('preview');$('previewButton').textContent='Preview';syncFields();textMode(false);resetHistory();fit();status('Article opened. Select a shape to edit its connections.');}
async function api(url,options={}) {const response=await fetch(url,options);const result=await response.json();if(!response.ok){const error=Error(result.error||'Could not complete this action.');error.code=response.status;throw error;}return result;}
$('exportArticle').onclick=async()=> {
  try {
    requireAppliedText();
    validate(article);$('exportArticle').disabled=true;
    const send=overwrite=>api('/api/articles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article,slug:slug||undefined,overwrite})});
    let result;try {result=await send(Boolean(slug));}catch(error){if(error.code!==409)throw error;if(!await confirmAction('Replace the existing article?','An article with this name is already in your library.','Replace article'))return;result=await send(true);}
    slug=result.slug;persist();status('Exported to the library. Refresh the reader to see your article.');
  } catch(error){status(error.message,true);}finally{$('exportArticle').disabled=false;}
};
$('downloadArticle').onclick=()=>{try{requireAppliedText();validate(article);const url=URL.createObjectURL(new Blob([JSON.stringify(article,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=(article.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'article')+'.bnitz';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Article downloaded. You can import it again to continue editing.');}catch(error){status(error.message,true);}};
$('importArticle').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async()=>{const file=$('fileInput').files[0];if(!file)return;try{const data=JSON.parse(await file.text());validate(data);if(hasDraftContent()&&!await confirmAction('Open another article?','Your current draft will be replaced. Export or download it first if you want to keep it.','Open article'))return;loadArticle(data);}catch(error){status(error.message,true);}finally{$('fileInput').value='';}};
$('openArticle').onclick=async()=>{try{const result=await api('/api/articles');$('libraryList').replaceChildren();if(!result.articles.length)$('libraryList').textContent='Your library is empty. Export your first article to add it.';for(const item of result.articles){const button=document.createElement('button');button.className='library-item';button.textContent=`${item.title} — ${item.author}, ${item.year}`;button.onclick=async()=>{try{if(hasDraftContent()&&!await confirmAction('Open another article?','Your current draft will be replaced. Export or download it first if you want to keep it.','Open article'))return;const data=await api('/api/articles/'+encodeURIComponent(item.slug));loadArticle(data.article,data.slug);$('libraryDialog').close();}catch(error){status(error.message,true);}};$('libraryList').append(button);}$('libraryDialog').showModal();}catch{status('Start the local composer to open your library.',true);}};
$('closeLibrary').onclick=()=>$('libraryDialog').close();
$('newArticle').onclick=async()=>{if(hasDraftContent()&&!await confirmAction('Start a new article?','Your current draft will be replaced. Export or download it first if you want to keep it.','New article'))return;article=blank();textDraft='';slug=null;selectedId=null;selectedPoint=null;pendingRange=null;preview=false;document.body.classList.remove('preview');$('previewButton').textContent='Preview';syncFields();textMode(true);resetHistory();fit();status('Paste an article, then give its ideas a shape.');};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();undo(event.shiftKey?1:-1);}if(event.key==='Escape'&&!$('confirmDialog').open&&!$('libraryDialog').open){selectedId=null;pendingRange=null;tool='select';render();}});
try{const stored=JSON.parse(localStorage.getItem(DRAFT));if(stored?.article){validate(stored.article,false);article=stored.article;slug=typeof stored.slug==='string'?stored.slug:null;textDraft=typeof stored.textDraft==='string'?stored.textDraft:article.text;editingText=textDraft!==article.text||!article.text||(typeof stored.editingText==='boolean'?stored.editingText:false);}}catch{status('The previous draft could not be restored.',true);}
syncFields();textMode(editingText);resetHistory();requestAnimationFrame(fit);
new ResizeObserver(()=>{if(!gesture)fit();}).observe($('canvasViewport'));
