import {writeFile} from 'node:fs/promises';
const base=process.env.APP_URL || 'http://localhost:3001';
const {documents}=await(await fetch(base+'/api/library')).json();
const id=name=>documents.find(d=>d.title.toLowerCase().includes(name))?.id;
const cases=[
 {id:'pnp',question:'Is P equal to NP? Explain in plain English in under 100 words.',mode:'off'},
 {id:'napoleon',question:'What happened to Napoleon? Give me a short, readable explanation.',mode:'off'},
 {id:'godot',question:'How do I make a slow-motion mechanic in Godot 4? Give me a small GDScript example and explain how to use it.',mode:'prefer',ids:[id('godot')]},
 {id:'godot-followup',question:'What does slow_motion_scale mean? Explain it simply, without repeating the code.',mode:'prefer',ids:[id('godot')],parent:'godot'},
 {id:'klaviyo-sauce',question:'Show me how to create a draft email campaign in Klaviyo using Python. Explain the steps, include a small example, and do not send the campaign.',mode:'prefer',ids:[id('klaviyo')]},
 {id:'klaviyo-web',question:'Show me how to create a draft email campaign in Klaviyo using Python. Explain the steps, include a small example, and do not send the campaign.',mode:'off'},
 {id:'klaviyo-followup',question:'Would that code send the email, or only create a draft? Explain in two sentences without repeating the code.',mode:'prefer',ids:[id('klaviyo')],parent:'klaviyo-sauce'}
];
const results=[];
for(const c of cases){
 const parent=results.find(r=>r.id===c.parent);
 const history=parent?.result?[{role:'user',content:parent.question},{role:'assistant',content:parent.result.answer.slice(0,8000)}]:[];
 const started=Date.now(),progress=[];let result,error,firstEventMs;
 console.log('START '+c.id);
 try{
 const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:c.question,libraryMode:c.mode,documentIds:c.ids||[],history}),signal:AbortSignal.timeout(245000)});
 if(!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
 let buffer='';const decoder=new TextDecoder();
 for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const event=JSON.parse(line);firstEventMs??=Date.now()-started;if(event.type==='progress'){progress.push({ms:Date.now()-started,message:event.message});console.log(c.id+' '+(Date.now()-started)+'ms '+event.message);}if(event.type==='result')result=event;if(event.type==='error')error=event.message;}}
 }catch(e){error=e.message;}
 const record={...c,elapsedMs:Date.now()-started,firstEventMs,progress,result,error};results.push(record);
 await writeFile(process.env.RESULTS_PATH || '/tmp/sauce-quality-results.json',JSON.stringify(results,null,2));
 console.log('DONE '+JSON.stringify({id:c.id,ms:record.elapsedMs,words:result?.answer.split(/\s+/).length,kinds:result?.blocks.map(b=>b[0].kind),sources:result?.sources.length,omitted:result?.omittedClaims,error}));
}
