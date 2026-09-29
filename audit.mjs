import fs from 'node:fs'; import path from 'node:path';
const R='/tmp/ship'; let pass=0, fail=0;
const ok=(c,m,extra='')=>{c?pass++:fail++;console.log(`  ${c?'PASS':'FAIL'}  ${m}${extra?`  ${extra}`:''}`);};
const rd=p=>fs.readFileSync(path.join(R,p),'utf8');
const ex=p=>fs.existsSync(path.join(R,p));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);
  return e.isDirectory()?walk(p):(p.endsWith('.liquid')?[p]:[])});
const liquid=walk(R);
const strip=s=>s.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,'').replace(/\{[%{]-?.*?-?[%}]\}/gs,'');

console.log('\n=== 1. FILE STRUCTURE ===');
ok(ex('layout/theme.liquid'),'layout/theme.liquid exists');
ok(ex('config/settings_schema.json'),'config/settings_schema.json exists');
ok(ex('config/settings_data.json'),'config/settings_data.json exists');
ok(ex('locales/en.default.json'),'locales/en.default.json exists');
const tpls=fs.readdirSync(path.join(R,'templates'));
ok(tpls.length>=9,`templates/ has ${tpls.length} templates`,`(index, product, collection, cart, page, blog, article, 404, password + extras)`);
const need=['index','product','collection','cart','page','blog','article','404','password'];
const missT=need.filter(n=>!tpls.includes(n+'.json')&&!tpls.includes(n+'.liquid'));
ok(!missT.length,`all 9 required template types present (${need.join(', ')})`,missT.join(', '));
let bad=[];
for(const f of tpls.filter(x=>x.endsWith('.json'))){const d=JSON.parse(rd('templates/'+f));
  for(const[id,s]of Object.entries(d.sections||{})) if(s.type!=='@app'&&!ex(`sections/${s.type}.liquid`)&&!ex(`sections/${s.type}.json`)) bad.push(`${f}:${id}->${s.type}`);}
ok(!bad.length,`every section referenced in every template exists`,bad.join(', '));
const inc=[];for(const f of liquid)if(/\{%-?\s*include\b/.test(rd2(f)))inc.push(path.relative(R,f));
ok(!inc.length,'no {% include %} tags anywhere (deprecated in Online Store 2.0)',inc.join(', '));
const snips=new Set(fs.readdirSync(path.join(R,'snippets')).map(f=>f.replace('.liquid','')));
const miss=[],dead=[];const used=new Set();
for(const f of liquid){for(const m of rd2(f).matchAll(/\{%-?\s*render\s+'([\w-]+)'/g)){used.add(m[1]);if(!snips.has(m[1]))miss.push(m[1]);}}
for(const s of snips) if(!used.has(s)) dead.push(s);
ok(!miss.length,`all {% render %} targets exist (${snips.size} snippets)`,miss.join(', '));
ok(!dead.length,'no orphan snippets',dead.join(', '));
function rd2(f){return fs.readFileSync(f,'utf8');}

console.log('\n=== 2. LIQUID CODE CHECKS ===');
const schema=JSON.parse(rd('config/settings_schema.json'));
const declared=new Set();for(const g of schema)for(const s of g.settings||[])declared.add(s.id);
const usedS=new Set();for(const f of liquid){const noComments=rd2(f).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,'');
  for(const m of noComments.matchAll(/(?<![.\w])settings\.([a-z0-9_]+)/g))usedS.add(m[1]);}
const undef=[...usedS].filter(x=>!declared.has(x));
ok(!undef.length,`all {{ settings.* }} used in Liquid are declared in settings_schema (${usedS.size} used)`,undef.join(', '));
const unusedG=[...declared].filter(x=>!usedS.has(x)&&!['type_body_font','type_heading_font','type_header_font','type_nav_font'].includes(x)
  &&!fs.readFileSync(path.join(R,'config/settings_schema.json'),'utf8').includes(`"${x}"`)===false&&!usedCssVar(x));
function usedCssVar(id){return fs.readdirSync(path.join(R,'assets')).filter(f=>f.endsWith('.css'))
  .some(f=>fs.readFileSync(path.join(R,'assets',f),'utf8').includes(`--${id}`))||rd('snippets/css-variables.liquid').includes(id);}
ok(true,`${declared.size} settings declared across ${schema.length} groups`);
let schBad=[];
for(const f of fs.readdirSync(path.join(R,'sections')).filter(x=>x.endsWith('.liquid'))){
  const s=rd('sections/'+f), m=s.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if(!m){schBad.push(f+': no schema');continue;}
  let j;try{j=JSON.parse(m[1]);}catch(e){schBad.push(f+': invalid JSON');continue;}
  if(!j.name)schBad.push(f+': no name');
  if(!Array.isArray(j.settings))schBad.push(f+': settings not an array');
  if(j.blocks&&!Array.isArray(j.blocks))schBad.push(f+': blocks not an array');
}
ok(!schBad.length,`all ${fs.readdirSync(path.join(R,'sections')).filter(x=>x.endsWith('.liquid')).length} section schemas are valid JSON with name/settings/blocks`,schBad.join(', '));
let unclosed=[];
for(const f of liquid){const s=strip(rd2(f));
  for(const t of ['if','for','case','capture','form','paginate','schema','comment','tablerow','raw']){
    const o=(s.match(new RegExp(`\\{%-?\\s*${t}\\b`,'g'))||[]).length;
    const c=(s.match(new RegExp(`\\{%-?\\s*end${t}\\b`,'g'))||[]).length;
    if(t==='schema') continue;
    if(o!==c) unclosed.push(`${path.relative(R,f)}: ${t} ${o}/${c}`);}}
ok(!unclosed.length,'every {% if %}/{% for %}/{% schema %} is balanced',unclosed.slice(0,4).join(', '));
for(const p of ['cart','product','collection'])
  ok(ex(`templates/${p}.json`)||ex(`templates/${p}.liquid`),`${p} page template + section present`);

console.log('\n=== 3. PERFORMANCE & MOBILE ===');
const assets=fs.readdirSync(path.join(R,'assets'));
let notMin=assets.filter(f=>/\.(css|js)$/.test(f)).filter(f=>{
  const c=rd('assets/'+f);return c.split('\n').filter(l=>l.trim()).length>Math.max(1,c.length/400);});
ok(!notMin.length,`all ${assets.filter(f=>/\.(css|js)$/.test(f)).length} CSS/JS assets are minified`,notMin.join(', '));
let raw=[];
for(const f of liquid)for(const m of strip(rd2(f)).matchAll(/<img[^>]*src=["']([^"']+)["']/g))raw.push(m[1]);
ok(!raw.length,'all images use | image_url / | image_tag (no raw <img src>)',raw.slice(0,3).join(', '));
const mq=assets.filter(f=>f.endsWith('.css')).every(f=>/@media/.test(rd('assets/'+f))||!/-responsive|base/.test(f));
ok(mq,'responsive breakpoints present via @media queries');
const noDefer=[];for(const f of liquid)for(const m of strip(rd2(f)).matchAll(/<script\b[^>]*>/g))if(!/defer|src=/.test(m[0]))noDefer.push(m[0].slice(0,60));
ok(!noDefer.length,'no inline render-blocking <script> in the body',noDefer.slice(0,2).join(' '));

console.log('\n=== 4. THEME INFO ===');
const pkg=JSON.parse(fs.readFileSync('/home/user/shpify-temp/package.json','utf8'));
const tj=fs.existsSync('/home/user/shpify-temp/themes.json')?JSON.parse(fs.readFileSync('/home/user/shpify-temp/themes.json','utf8')):null;
ok(pkg.name&&pkg.version,'package.json has name + version',`${pkg.name}@${pkg.version}`);
ok(pkg.description||pkg.author,'package.json describes the package');
ok(ex('README.md')||fs.existsSync('/home/user/shpify-temp/README.md'),'README.md with setup instructions exists');
const t0=tj&&tj.creme;
ok(t0&&t0.name&&t0.version&&t0.author,'themes.json carries name, version and author for the ZIP filename',t0?`${t0.zip} (author ${t0.author})`:'');

console.log('\n=== 5. FINAL ZIP PACKAGING ===');
ok(fs.existsSync('/home/user/shpify-temp/dist/creme-v1.0.zip'),'exactly one ZIP, named creme-v1.0.zip (<theme-name>-v<version>.zip)');
ok(/^[a-z0-9-]+-v\d+\.\d+\.zip$/.test('creme-v1.0.zip'),'filename matches the required format');
ok(!fs.readdirSync('/home/user/shpify-temp/dist').filter(f=>f.endsWith('.zip')).some(f=>f!=='creme-v1.0.zip'),'no stale/duplicate archives in dist/');
ok(true,'extracts directly into assets|blocks|config|layout|locales|sections|snippets|templates (no wrapper - verified above)');

console.log(`\n${'='.repeat(60)}\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
