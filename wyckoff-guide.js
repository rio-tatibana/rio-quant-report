/* ワイコフ入門：共通ページの処理と変数を分けて管理します。 */
(()=>{
'use strict';
const lesson=document.getElementById('wyckoffLesson');
if(!lesson)return;

'use strict';
const SOURCE_W='https://www.wyckoffanalytics.com/wyckoff-method/';
const SOURCE_S='https://chartschool.stockcharts.com/table-of-contents/market-analysis/wyckoff-analysis-articles/the-wyckoff-method-a-tutorial';
const SOURCE_I='https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders';
let printing=false;
const mobile=()=>!printing&&lesson.clientWidth<=680;
const state={quiz:null,future:null};
const buyPath=[1210,1160,1115,1050,990,1040,1090,1045,1005,1040,1090,1050,1015,1045,1095,1135,1115,1105,1115,1120,1160,1200,1240,1280];
const buyVol=[45,54,70,85,115,75,65,48,35,33,31,29,27,25,28,88,52,30,25,48,72,85,75,68];
const fakePath=[1040,1070,1100,1050,1010,1060,1090,1050,1020,1080,1110,1140,1105,1080,1050,1010,980,950];
const topPath=[1110,1160,1230,1290,1370,1410,1340,1300,1370,1400,1345,1310,1350,1380,1330,1310,1280,1300,1285,1240,1190,1160];
const springPath=[1160,1100,1030,1000,1060,1100,1050,1010,1080,1040,1010,965,1020,1060,1040,1080,1115,1100,1140];
function chart(values,opt={}){
 const m=mobile(),W=m?500:920,H=opt.volume?(m?420:460):(m?350:390),L=m?58:72,R=W-(m?36:52),T=48,B=opt.volume?(m?276:300):H-58;
 const lo=opt.min??Math.floor((Math.min(...values,...(opt.lines||[]).map(l=>l.value))-25)/50)*50;
 const hi=opt.max??Math.ceil((Math.max(...values,...(opt.lines||[]).map(l=>l.value))+25)/50)*50;
 const total=opt.total||values.length,xx=i=>L+i*(R-L)/(total-1),yy=v=>T+(hi-v)*(B-T)/(hi-lo);
 const color=r=>`var(--${r||'ink'})`,fs=m?18:20;
 let out=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.alt||'学習用の架空チャート。縦軸は価格、横軸は時間。'}"><title>${opt.alt||'学習用の架空チャート'}</title>`;
 const tick=(hi-lo)>600?200:100;
 for(let v=Math.ceil(lo/tick)*tick;v<=hi;v+=tick){let y=yy(v);out+=`<line class="grid" x1="${L}" y1="${y}" x2="${R}" y2="${y}"/><text x="${L-12}" y="${y+6}" text-anchor="end" font-size="${fs-2}">${v.toLocaleString()}</text>`}
 for(const z of opt.zones||[]){let x=xx(z.from),w=xx(z.to)-x;out+=`<rect x="${x}" y="${T}" width="${w}" height="${B-T}" fill="${color(z.role+'-soft')}"/><text x="${x+w/2}" y="${T+24}" text-anchor="middle" style="fill:${color(z.role)}" font-size="${m?17:20}" font-weight="800">${z.label||''}</text>`}
 for(const l of opt.lines||[]){let y=yy(l.value);out+=`<line x1="${L}" y1="${y}" x2="${R}" y2="${y}" stroke="${color(l.role||'neutral')}" stroke-width="2" stroke-dasharray="8 7"/>`}
 out+=`<line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${B}"/><line class="axis" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/><text x="${L}" y="23" font-size="${fs-1}">価格（円）</text>`;
 if(opt.futureShade){const x=xx(values.length-1)+8;out+=`<rect x="${x}" y="${T}" width="${R-x}" height="${B-T}" fill="var(--bg)"/><text x="${(x+R)/2}" y="${T+(B-T)/2}" text-anchor="middle" font-size="${fs}" font-weight="700">${m?'未来':'この先は？'}</text>`}
 out+=`<polyline class="price" points="${values.map((v,i)=>`${xx(i)},${yy(v)}`).join(' ')}"/>`;
 if(opt.average){let a=values.map((v,i)=>values.slice(Math.max(0,i-4),i+1).reduce((s,n)=>s+n,0)/Math.min(5,i+1));out+=`<polyline points="${a.map((v,i)=>`${xx(i)},${yy(v)}`).join(' ')}" fill="none" stroke="var(--sell)" stroke-width="3" stroke-dasharray="7 5"/>`}
 for(const p of opt.markers||[]){let px=xx(p.i),py=yy(values[p.i]),x=px+(p.dx||0),y=py+(p.dy||0);if(p.dx||p.dy)out+=`<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="${color(p.role||'buy')}" stroke-width="2"/>`;out+=`<circle cx="${x}" cy="${y}" r="${m?13:18}" fill="var(--surface)" stroke="${color(p.role||'buy')}" stroke-width="3"/><text x="${x}" y="${y+6}" text-anchor="middle" style="fill:${color(p.role||'buy')}" font-size="${m?18:20}" font-weight="800">${p.n}</text>`}
 if(opt.volume){const VY=B+50,VH=m?48:64,vol=opt.volume,max=Math.max(...vol);out+=`<text x="${L}" y="${VY-12}" font-size="${fs-2}">出来高（相対値）</text>`;vol.forEach((v,i)=>{let h=v/max*VH;out+=`<rect x="${xx(i)-Math.max(3,(R-L)/total*.28)}" y="${VY+VH-h}" width="${Math.max(6,(R-L)/total*.56)}" height="${h}" fill="${opt.highlightVolume?.includes(i)?color(opt.volumeRole||'buy'):color('neutral')}" opacity=".8"/>`});out+=`<line class="axis" x1="${L}" y1="${VY+VH}" x2="${R}" y2="${VY+VH}"/>`}
 out+=`<text x="${R}" y="${H-12}" text-anchor="end" font-size="${fs-1}">時間の経過</text></svg>`;
 const lineLabels=(opt.lines||[]).map(l=>`<span style="color:${color(l.role||'muted')}">${m?(l.short||l.label):l.label}</span>`).join('');
 return `<figure class="chart-wrap">${out}${lineLabels?`<div class="line-label-list">${lineLabels}</div>`:''}<figcaption class="chart-caption">学習用の架空データ・模式図。実在銘柄の推奨価格ではありません。</figcaption></figure>`;
}
const header=(chapter,title,lead='')=>`<header class="slide-heading"><p class="chapter">${chapter}</p><h2>${title}</h2>${lead?`<p class="lead">${lead}</p>`:''}</header>`;
const step=(n,title,copy,role='buy')=>`<div class="step"><span class="num ${role==='sell'?'sell-number':role==='risk'?'risk-number':''}">${n}</span><div><h3>${title}</h3><p>${copy}</p></div></div>`;
const foot=t=>`<p class="takeaway">${t}</p>`;
const levels=[{value:1100,label:'上値の目安 1,100円',short:'上値 1,100円',role:'sell'},{value:1000,label:'下値の目安 1,000円',short:'下値 1,000円',role:'buy',below:true}];
const slides=[
['図でわかるワイコフ理論',()=>`<p class="chapter">投資初心者のための図解教室</p><div class="cover-grid"><div class="cover-copy"><h1>図でわかる<br>ワイコフ理論</h1><p class="lead">買う・売る・待つを、<br>チャートで考える練習。</p><div class="pill-legend"><span><i class="legend-dot"></i>買いの候補</span><span><i class="legend-dot sell-dot"></i>保有株の売却候補</span><span><i class="legend-dot risk-dot"></i>損切り・要注意</span></div><p class="cover-meta">全21枚。矢印キー、または「次へ」で進みます。<br>図の価格はすべて学習用です。</p></div>${chart(buyPath,{lines:[levels[0]],markers:[{i:19,n:1},{i:21,n:2,role:'sell'}],alt:'横ばいを抜けて押し戻した後に買いを検討し、上昇後に利益確定を検討する架空例'})}</div>${foot('最安値や最高値を当てるより、判断の理由を持つ。')}`],
['チャートの読み方',()=>`${header('01 / 基礎','上の線は価格、下の棒は出来高','価格と、成立した売買の量をセットで見ます。')}<div class="columns">${chart([1010,1030,1020,1060,1050,1090,1130,1120,1160,1190,1170,1220],{volume:[20,25,18,30,22,32,45,28,48,60,30,55],highlightVolume:[8,9,11],markers:[{i:6,n:1}],alt:'上段の価格線と、同じ時刻の下段の出来高棒を対応させて読む架空例'})}<div class="copy">${step(1,'価格：いくらで取引されたか','線が上なら高い価格、右へ進むほど後の時刻です。')}<div><h3>出来高：どれだけ取引されたか</h3><p>棒が高いほど、多くの株が売買されています。単純に「買う人の数」を表す棒ではありません。</p></div><p class="note">ここでは見やすさを優先して価格を線で表示。実際のチャートではローソク足なども使います。</p></div></div>${foot('価格だけでなく、出来高が普段より多いかも見る。')}`],
['相場の4つの局面',()=>`${header('02 / 全体像','相場を4つの局面で眺める','同じ横ばいでも、その前の値動きで見方が変わります。')}<div class="wide-chart">${chart([1170,1100,1020,1040,1010,1060,1030,1080,1150,1220,1280,1360,1320,1370,1310,1350,1300,1240,1180,1090],{zones:[{from:1,to:6,role:'buy',label:'① 蓄積'},{from:6,to:11,role:'buy',label:'② 上昇'},{from:11,to:16,role:'sell',label:'③ 分配'},{from:16,to:19,role:'sell',label:'④ 下落'}],alt:'下落後の横ばい、上昇、高値の横ばい、下落という理想化した4局面'})}</div><div class="phase-row"><div><h3>① 買い集める局面</h3><p>下落の後に横ばい。<br>蓄積と呼びます。</p></div><div><h3>② 上がる局面</h3><p>高値も安値も<br>切り上がっていく。</p></div><div><h3>③ 売り渡す局面</h3><p>上昇の後に横ばい。<br>分配と呼びます。</p></div><div><h3>④ 下がる局面</h3><p>高値も安値も<br>切り下がっていく。</p></div></div>${foot('これは観察のためのモデル。必ずこの順番・形になるわけではありません。')}`],
['下値と上値の目安',()=>`${header('03 / 基準になる線','何度も止まる価格帯に注目','買う場所を考える前に、値動きの「床」と「天井」を探します。')}<div class="columns">${chart([1050,1100,1060,1000,1040,1095,1050,1005,1030,1100,1060,1010,1050],{lines:levels,markers:[{i:3,n:1},{i:9,n:2,role:'sell'}]})}<div class="copy">${step(1,'床：下がっても戻りやすい','下値の目安をサポートと呼びます。図では1,000円付近。')}${step(2,'天井：上がっても戻されやすい','上値の目安をレジスタンスと呼びます。図では1,100円付近。','sell')}<p class="note">実際はぴったり1円単位の線ではなく、ある程度の幅がある価格帯として考えます。</p></div></div>${foot('床も天井も、何度でも効くとは限りません。')}`],
['蓄積を考える場面',()=>`${header('04 / 買う前の観察','下落が止まり、横ばいが続いたら','「蓄積かもしれない」という仮説を立て、確かめていきます。')}<div class="columns">${chart(buyPath.slice(0,15),{volume:buyVol.slice(0,15),lines:levels,markers:[{i:4,n:1},{i:12,n:2}]})}<div class="copy">${step(1,'まず、下落が止まる','急落後の反発や、下値を割りにくくなる動きを観察します。')}${step(2,'次に、下値を試す動きを見る','再び下げたとき、前より下げ幅や出来高が小さくなるかを比べます。')}<div class="callout"><strong>横ばいだけでは買いの根拠が弱い</strong><p>この後に上がるか、もう一度下がるかは、まだ分かりません。</p></div></div>${foot('「安くなったから」だけで買う前に、下げ止まりを確認する。')}`],
['買い候補① 上値を抜ける',()=>`${header('05 / 買いの候補','上値を抜ける動きに、参加が伴うか','ブレイクアウトとは、それまでの上値の目安を超えること。')}<div class="columns">${chart(buyPath.slice(0,17),{volume:buyVol.slice(0,17),lines:levels,highlightVolume:[15],markers:[{i:15,n:1},{i:16,n:2,role:'risk',dy:50}]})}<div class="copy">${step(1,'1,100円を上に抜ける','横ばいの上限を超え、出来高も直前より増えた例です。')}${step(2,'抜けた直後は、まだ不確か','すぐ横ばいの中へ戻る「だまし」もあります。抜けたことだけで成功とは判断しません。','risk')}<p class="note">このタイミングで検討する方法もありますが、次のページでは、もう一段確認する考え方を見ます。</p></div></div>${foot('抜けた瞬間の勢いと、抜けた後の持続を分けて観察する。')}`],
['買い候補② 戻しても崩れない',()=>`${header('06 / 買いの候補','上値だった場所が、支えに変わる','この図では③の反発確認後が、買いを検討する候補です。')}<div class="columns">${chart(buyPath,{volume:buyVol,lines:[levels[0],{value:1080,label:'崩れたと判断する例 1,080円',short:'損切りの目安 1,080円',role:'risk',below:true}],highlightVolume:[15,19,20],markers:[{i:15,n:1},{i:17,n:2},{i:19,n:3}],zones:[{from:18,to:20,role:'buy',label:'買い候補'}]})}<div class="copy">${step(1,'上値を抜ける','出来高の増加も合わせて見る。')}${step(2,'押し戻すが、下がり続けない','1,100円付近を試し、出来高は減った例。')}${step(3,'反発を確認して検討する','例：1,120円で検討。1,080円を下回るなら、仮説が崩れたと考える。')}<p class="note">後の上昇は説明用の一例です。この時点で将来の上昇が決まるわけではありません。</p></div></div>${foot('買う理由と一緒に、「どこまで下がったら撤退するか」を決める。')}`],
['買いを見送る場面',()=>`${header('07 / 要注意','上に抜けても、中へ戻ることがある','上昇に見えても、動きが続かない例です。')}<div class="columns">${chart(fakePath,{lines:levels,markers:[{i:11,n:1},{i:13,n:2,role:'risk'}],zones:[{from:11,to:14,role:'risk',label:'追いかけ注意'}]})}<div class="copy">${step(1,'上値を一時的に超える','この瞬間だけを見ると、強そうに見えます。')}${step(2,'すぐに横ばいの中へ戻る','抜けた価格帯を維持できず、さらに下げる例。見送る、または決めていた撤退条件を適用します。','risk')}<div class="callout red-box"><strong>損切りの目安を遠ざけない</strong><p>「戻るはず」と考えて許容損失を広げると、損失が膨らみます。</p></div></div>${foot('「買わずに待つ」ことも、判断の一つです。')}`],
['スプリングを知る',()=>`${header('08 / 補足のパターン','下値を少し割って、すぐ戻る','蓄積の途中に現れることがあるスプリングという動き。')}<div class="columns">${chart(springPath,{lines:levels,markers:[{i:11,n:1,role:'risk'},{i:12,n:2},{i:16,n:3}]})}<div class="copy">${step(1,'下値の目安を一時的に割る','この時点では、本当に崩れた可能性もあります。','risk')}${step(2,'横ばいの中へ戻る','下値割れが続かなかった、という事実を確認します。')}${step(3,'その後の反発や再確認を見る','形の似た一瞬だけで飛びつかず、買いが続くかを観察します。')}<p class="note">スプリングは必須ではありません。現れずに上昇へ移る場合もあります。</p></div></div>${foot('「下値を割った」だけでは、反発のサインとは言えません。')}`],
['高値での変化に気づく',()=>`${header('09 / 売る前の観察','上がり続けた後、伸びにくくなる','分配の可能性を考える場面。保有株をどうするかを検討します。')}<div class="columns">${chart(topPath,{lines:[{value:1400,label:'上値の目安 1,400円',short:'上値 1,400円',role:'sell'},{value:1300,label:'下値の目安 1,300円',short:'下値 1,300円',role:'risk',below:true}],markers:[{i:5,n:1,role:'sell'},{i:15,n:2,role:'risk'},{i:18,n:3,role:'sell'}]})}<div class="copy">${step(1,'高値で何度も止まる','買いの勢いが、価格の上昇につながりにくくなります。','sell')}${step(2,'下値の目安を割る','高値圏の横ばいが下向きに崩れた例。','risk')}${step(3,'戻しても、元の下値を回復できない','弱い反発を確認し、保有株の売却を検討する候補です。','sell')}</div></div>${foot('高値圏の横ばいでも再上昇はあります。崩れる動きと合わせて判断する。')}`],
['利益を確定する売り',()=>`${header('10 / 売る場面①','買う前に、利益確定の候補を考える','利益確定は、含み益のある保有株を売って利益に変えること。')}<div class="columns">${chart(buyPath,{lines:[{value:1200,label:'利益確定を考える例 1,200円',short:'利益確定候補 1,200円',role:'sell'},{value:1120,label:'購入した例 1,120円',short:'購入 1,120円',role:'buy',below:true}],markers:[{i:19,n:1},{i:21,n:2,role:'sell'}],zones:[{from:20.5,to:22,role:'sell',label:'売却候補'}]})}<div class="copy"><div><p class="mini-title blue">① 1,120円で100株を買った例</p><p>買った時点で、1,200円を利益確定の候補として決めていたとします。</p></div><div class="callout orange-box"><h3>② 1,200円に到達</h3><p>全部または一部を売るか検討。100株なら、差額は<strong>8,000円</strong>です。</p></div><p class="note">1,200円は学習用に置いた目標です。ワイコフの図の形から自動的に求まる価格ではありません。税金・手数料は計算に含めていません。</p></div></div>${foot('売った後にさらに上がっても、事前の計画に沿ったかを振り返る。')}`],
['損失を抑える売り',()=>`${header('11 / 売る場面②','想定が崩れたときの、撤退する売り','損切りは、損失のある保有株を売り、損失の拡大を抑える判断です。')}<div class="columns">${chart([...buyPath.slice(0,20),1100,1080,1050,1020],{lines:[{value:1120,label:'購入した例 1,120円',short:'購入 1,120円',role:'buy'},{value:1080,label:'撤退を考える例 1,080円',short:'撤退目安 1,080円',role:'risk',below:true}],markers:[{i:19,n:1},{i:21,n:2,role:'risk'}],zones:[{from:20.5,to:22,role:'risk',label:'撤退の判断'}]})}<div class="copy">${step(1,'1,120円で買った後、反発が続かない','1,100円付近で支えられる、という想定が弱くなっています。')}${step(2,'事前の撤退条件に達する','例：1,080円で100株売れたなら、損失は4,000円。決めた条件を後から都合よく動かさない。','risk')}<p class="note">急落時は想定した価格で売れず、損失が大きくなる場合があります。逆指値を使っても、約定価格は保証されません。</p></div></div>${foot('利益を狙う前に、うまくいかなかった場合を考えておく。')}`],
['出来高と値動きの組み合わせ',()=>`${header('12 / 出来高の使い方','取引が多いのに、価格が伸びない？','出来高という「労力」と、値動きという「結果」を比べます。')}<div class="two"><div><p class="mini-title blue">例A：出来高が増え、価格も上がる</p>${chart([1020,1030,1020,1040,1060,1110,1160,1200],{volume:[20,22,18,23,30,55,75,85],highlightVolume:[5,6,7],min:950,max:1300})}<p class="compact">値上がりに参加が伴う例。それでも、その後に動きが続くか確認します。</p></div><div><p class="mini-title orange">例B：出来高が増えても、価格は横ばい</p>${chart([1100,1150,1200,1220,1200,1220,1210,1215],{volume:[20,25,32,45,50,70,80,90],highlightVolume:[5,6,7],volumeRole:'sell',min:950,max:1300})}<p class="compact">売買が活発なのに進めない例。上値で売りに押し返されている可能性を考えます。</p></div></div>${foot('「出来高が増えた＝買い」と決めつけず、価格がどう動いたかを見る。')}`],
['他の指標は補助に使う',()=>`${header('13 / 判断の補助','移動平均線で、大きな向きを見る','移動平均線は、一定期間の価格の平均をつないだ線です。')}<div class="columns">${chart(buyPath,{average:true,lines:[levels[0]],markers:[{i:19,n:1}]})}<div class="copy"><div class="pill-legend"><span>実線：価格</span><span class="orange">破線：5点の平均の例</span></div><div><h3>平均の線も、上を向いているか</h3><p>価格が上値を抜け、平均の線も上向きなら、上昇方向の見方と整合します。</p></div><div class="callout orange-box"><strong>線は価格の後を追います</strong><p>指標を増やすだけで、失敗がなくなるわけではありません。価格と出来高を先に観察します。</p></div><p class="note">平均期間「5」は説明用です。日足や週足を混ぜず、比べる時間軸をそろえます。</p></div></div>${foot('指標をたくさん重ねる前に、自分が何を確認したいかを明確にする。')}`],
['数量と損失の練習',()=>`${header('14 / リスクの計算','買う株数で、損失の大きさが変わる','下の数字を変えると、100株単位での計算例を確認できます。')}<div class="two"><div><form class="calc-form" id="risk-form"><label>買う価格（円）<input id="entry" type="number" min="1" step="1" value="1120" inputmode="numeric"></label><label>損切り価格（円）<input id="stop" type="number" min="1" step="1" value="1080" inputmode="numeric"></label><label>想定する損失上限（円）<input id="budget" type="number" min="0" step="100" value="5000" inputmode="numeric"></label><label>利益確定の目標（円）<input id="target" type="number" min="1" step="1" value="1200" inputmode="numeric"></label></form><div class="calc-result" id="calc-output" aria-live="polite"></div></div><div class="copy"><p class="statement">1株の値下がり幅<br><span class="blue">× 株数</span><br>＝ 想定損失</p><p>同じ場所で買っても、数量が2倍なら損失額も2倍になります。</p><p class="note">学習用の単純計算です。購入代金が用意できるか、手数料・税金・急落による価格差も別に確認します。表示額は損失を保証する上限ではありません。</p></div></div>${foot('候補の価格を決めてから、無理のない数量かを考える。')}`],
['練習：どこで買いを考える？',()=>`${header('15 / 自分で考える','この時点なら、どこを観察したい？','未来の値動きは隠しています。先に、自分の理由を考えてみてください。')}<div class="columns">${chart(buyPath.slice(0,20),{total:24,futureShade:true,volume:buyVol.slice(0,20),lines:[levels[0],{value:1080,label:'撤退を考える例 1,080円',short:'撤退目安 1,080円',role:'risk',below:true}],markers:[{i:8,n:1},{i:15,n:2},{i:19,n:3}],highlightVolume:[15,19],min:950,max:1300})}<div class="copy"><div class="quiz-choices" id="quiz-choices"><button type="button" data-choice="1" aria-pressed="${state.quiz===1}">① 横ばいの途中。安く見える場所</button><button type="button" data-choice="2" aria-pressed="${state.quiz===2}">② 上値を勢いよく抜けた直後</button><button type="button" data-choice="3" aria-pressed="${state.quiz===3}">③ 押し戻した後、反発を確認した場所</button></div><div class="feedback" id="quiz-feedback">${quizFeedback()}</div></div></div>${foot('どこを候補にしても、撤退条件を一緒に考えます。')}`],
['練習：うまくいく場合と崩れる場合',()=>`${header('16 / 結果を比べる','同じ買い候補にも、2つの続きがある','値動きの先を切り替えて、判断と結果を分けて振り返ります。')}<div class="columns">${futureChart()}<div class="copy"><div class="quiz-actions"><button type="button" data-future="up" aria-pressed="${state.future==='up'}">上昇した例</button><button type="button" data-future="down" aria-pressed="${state.future==='down'}">崩れた例</button></div><div class="feedback">${state.future==='up'?'反発が続き、1,200円に到達する例。事前に決めた利益確定を検討します。':state.future==='down'?'反発が続かず、1,080円の撤退目安に達する例。買いの仮説を見直します。':'上のボタンで、2つの架空の続きを見比べられます。実際の相場の予測ではありません。'}</div><p>後の結果だけで「買えばよかった」と考えると、当時は見えていなかった未来まで判断に混ざります。</p><p class="note">見送る判断も含め、その時点の根拠と許容損失を記録します。</p></div></div>${foot('大切なのは、失敗する場合も含めて計画できていたか。')}`],
['見る順番のチェックリスト',()=>`${header('17 / 振り返り','チャートを見るときの5つの確認','迷ったら、この順番で整理できます。')}<div class="two"><ul class="check-list"><li><label><input type="checkbox"><span>いまは上昇・下落・横ばいのどれ？<small>まず大きな向きを確認。</small></span></label></li><li><label><input type="checkbox"><span>上値と下値の目安はどこ？<small>何度も止まる価格帯を探す。</small></span></label></li><li><label><input type="checkbox"><span>価格の変化に、出来高も伴っている？<small>直前だけでなく、前の同じ動きとも比較。</small></span></label></li><li><label><input type="checkbox"><span>何が起きたら、判断を変える？<small>買う前に撤退条件を具体化。</small></span></label></li><li><label><input type="checkbox"><span>その株数で、損失に耐えられる？<small>購入金額と損失額を分けて計算。</small></span></label></li></ul><div class="copy"><p class="big-word blue">理由が<br>説明できる<br>ところまで待つ。</p><p>大口の意図を当てることより、自分が確認できる値動きと、取れるリスクを言葉にします。</p><button class="no-print" type="button" id="print-checklist">この資料を印刷・PDF保存</button></div></div>${foot('チェックが付いたから必ず勝てる、という意味ではありません。')}`],
['補足：A〜Eの5フェーズ',()=>`${header('補足 01 / 詳しく学ぶとき','A〜Eは、横ばいの中を詳しく見る区分','4つの局面と、A〜Eという細かな段階は別の整理です。')}<div class="phase-table" role="table" aria-label="蓄積と分配のAからEまでの比較"><div class="phase-table-head" role="row"><strong role="columnheader">段階</strong><strong class="blue" role="columnheader">蓄積側で見る例</strong><strong class="orange" role="columnheader">分配側で見る例</strong></div>${[['A','下落が止まり始める','上昇が止まり始める'],['B','横ばいで売買が続く','横ばいで売買が続く'],['C','下値を試すことがある','上値を試すことがある'],['D','買いの優勢が見え始める','売りの優勢が見え始める'],['E','横ばいを離れて上昇','横ばいを離れて下落']].map(r=>`<div class="phase-table-row" role="row"><strong role="rowheader">${r[0]}</strong><span role="cell">${r[1]}</span><span role="cell">${r[2]}</span></div>`).join('')}</div><p class="compact"><strong class="blue">蓄積側のC：スプリングなど</strong>は下値を割って戻る例。<br><strong class="orange">分配側のC：UT / UTADなど</strong>は上値を超えて戻る例です。<br>どちらも必須ではなく、リアルタイムでの判別は難しい場合があります。</p>${foot('初めはA〜Eを暗記するより、上値・下値での動きを観察する。')}`],
['補足：用語をやさしく',()=>`${header('補足 02 / 用語帳','専門用語を、普通の言葉に置き換える')}<div class="two"><div><div class="definition"><strong>レンジ</strong><p>ある価格帯を行き来する横ばいの状態。</p></div><div class="definition"><strong>押し目</strong><p>上昇の途中で、一時的に下がる動き。</p></div><div class="definition"><strong>戻り</strong><p>下落の途中で、一時的に上がる動き。</p></div><div class="definition"><strong>コンポジットマン</strong><p>多数の大口の行動を、一人の売買として考える説明上のモデル。実在の一人の意図を見抜けるという意味ではありません。</p></div></div><div><details><summary>MACD・RSI</summary><p>MACDは移動平均の差で勢いを見る指標。RSIは一定期間の上昇と下落のバランスを見る指標。どちらも価格を加工した補助情報です。</p></details><details><summary>ボリンジャーバンド・OBV</summary><p>ボリンジャーバンドは平均価格の周囲に値動きの幅を示すもの。OBVは価格の前日比に応じて出来高を足し引きするもの。これだけで売買の成功や資金の流入出を断定しません。</p></details><details><summary>SOS・LPS・SOW・LPSY</summary><p>SOSは上昇の強さの兆し、LPSはその後に下げが支えられる場面。SOWは価格の弱さの兆し、LPSYはその後の弱い反発を指す用語です。初めは日本語で動きを説明できれば十分です。</p></details><details><summary>売る、の意味</summary><p>この資料の実践例は、保有している株の利益確定や損切りを扱います。売却候補という表示は、保有株をどう減らすかを考える目印です。</p></details></div></div>${foot('名前が思い出せなくても、値動きの説明ができれば理解は進んでいます。')}`],
['出典と読み方の注意',()=>`${header('補足 03 / 出典','この資料の出典と、読み方の注意','価格と出来高の見方を、初心者向けの図解で学べるように整理しました。')}<div class="two"><ul class="source-list"><li><a href="${SOURCE_W}" target="_blank" rel="noopener noreferrer">Wyckoff Analytics / Wyckoff Method</a><p>4局面、蓄積・分配、A〜E、価格と出来高の解釈。</p></li><li><a href="${SOURCE_S}" target="_blank" rel="noopener noreferrer">StockCharts ChartSchool / The Wyckoff Method</a><p>スプリング、UTAD、コンポジットマンなどの照合。</p></li><li><a href="${SOURCE_I}" target="_blank" rel="noopener noreferrer">米SEC Investor.gov / Types of Orders</a><p>逆指値・成行注文の価格が保証されない点。</p></li><li><p>図と価格はすべて学習用の架空例です。<br>確認・再構成：2026年10月24日</p></li></ul><div><details><summary>用語と解釈についての補足</summary><p>蓄積側のスプリングと分配側のUT / UTADは、試す方向が逆です。どちらも、必ず現れるパターンではありません。</p><p>価格や出来高から、大口投資家の意図を直接確かめることはできません。複数の指標を組み合わせても、将来の値動きや利益は保証されません。</p></details><details open><summary>図の読み方</summary><p>図・価格・出来高・買い候補・売却候補は、すべて説明用の架空例です。将来の値動き、利益、最適な売買価格を示すものではありません。</p><p>相場の形は毎回違います。型が似ていても失敗し、ニュースや市場全体の変化で大きく動く場合があります。</p></details></div></div>${foot('価格の動き、出来高、撤退条件。この3つを自分の言葉で説明する練習に。')}`]
];

function quizFeedback(){return state.quiz===1?'①は、下がり続けなくなった点には注目できます。ただし、この時点では上値を超える強さはまだ確認できていません。':state.quiz===2?'②は、上値を抜ける強さが見える候補です。すぐ横ばいに戻る可能性があるため、失敗時の撤退条件が必要です。':state.quiz===3?'③は、この説明で重視した買い候補です。抜けた後の下げ止まりと反発を確認。ただし、後の上昇が保証されるわけではありません。':'①〜③のどれかを選ぶと、その場所を見るときの注意点を表示します。';}
function futureChart(){let data=buyPath.slice(0,20);if(state.future==='up')data=[...data,1160,1200,1240,1280];if(state.future==='down')data=[...data,1100,1080,1050,1020];return chart(data,{total:24,futureShade:!state.future,lines:[{value:1200,label:'利益確定の候補 1,200円',short:'利益確定候補 1,200円',role:'sell'},{value:1080,label:'撤退の目安 1,080円',short:'撤退目安 1,080円',role:'risk',below:true}],markers:[{i:19,n:1},...(state.future?[{i:21,n:2,role:state.future==='up'?'sell':'risk'}]:[])],min:950,max:1350});}

let current=Math.max(0,Math.min(slides.length-1,(parseInt(location.hash.replace('#slide-',''),10)||1)-1));
const deck=lesson.querySelector('#deck');
function render(){
 const checked=[...deck.querySelectorAll('.check-list input')].map(x=>x.checked);
 const calcValues=[...deck.querySelectorAll('#risk-form input')].map(x=>x.value);
 deck.innerHTML=slides.map((s,i)=>`<section class="slide${i===current?' active':''}" id="slide-${i+1}" aria-label="${i+1}枚目 ${s[0]}" aria-hidden="${i!==current}" tabindex="-1">${s[1]()}</section>`).join('');
 deck.querySelectorAll('.check-list input').forEach((x,i)=>x.checked=checked[i]||false);
 if(calcValues.length)deck.querySelectorAll('#risk-form input').forEach((x,i)=>x.value=calcValues[i]);
 updateCalc();updateNavigation();
 fitSlide();
}
function fitSlide(){
 lesson.style.setProperty('--wyckoff-nav-left',`${Math.max(0,lesson.getBoundingClientRect().left)}px`);
 deck.style.height='';deck.style.overflow='';deck.style.paddingBottom='';
 for(const slide of deck.children){slide.style.transform='';slide.style.transformOrigin='';}
 if(printing||lesson.clientWidth<=1000)return;
 const slide=deck.children[current];
 const available=innerHeight-lesson.querySelector('.topbar').getBoundingClientRect().bottom-lesson.querySelector('.controls').offsetHeight-24;
 const scale=Math.min(1,Math.max(.45,available/slide.offsetHeight));
 slide.style.transformOrigin='top center';slide.style.transform=`scale(${scale})`;
 deck.style.paddingBottom='0';deck.style.height=`${slide.offsetHeight*scale+16}px`;deck.style.overflow='hidden';
}
function updateNavigation(){
 lesson.querySelector('#prev').disabled=current===0;
 lesson.querySelector('#next').disabled=current===slides.length-1;
 lesson.querySelector('#count').textContent=`${current+1} / ${slides.length}`;
 lesson.querySelector('#jump').value=current;
 lesson.querySelector('.progress-fill').style.width=`${(current+1)/slides.length*100}%`;
 lesson.querySelector('[role="progressbar"]').setAttribute('aria-valuemax',slides.length);
 lesson.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',current+1);
 document.title=`${current+1}. ${slides[current][0]}｜ワイコフ入門 | rioの勝手にクオンツ分析`;
}
function go(index,focus=true){
 index=Math.max(0,Math.min(slides.length-1,index));
 deck.children[current]?.classList.remove('active');deck.children[current]?.setAttribute('aria-hidden','true');
 current=index;deck.children[current].classList.add('active');deck.children[current].setAttribute('aria-hidden','false');
 history.replaceState(null,'',`#slide-${current+1}`);updateNavigation();
 fitSlide();
 lesson.querySelector('#announcer').textContent=`${current+1}枚目 ${slides[current][0]}`;
 if(focus)deck.children[current].focus({preventScroll:true});
 window.scrollTo({top:0,behavior:'instant'});
}
function updateCalc(){
 const number=id=>Number(lesson.querySelector('#'+id).value);
 const entry=number('entry'),stop=number('stop'),budget=number('budget'),target=number('target');
 const output=lesson.querySelector('#calc-output');if(!output)return;
 if(![entry,stop,budget,target].every(Number.isFinite)||entry<=0||stop<=0||budget<0||stop>=entry||target<=entry){output.innerHTML='<strong>価格の関係を確認してください。</strong><p class="compact">損切り価格 ＜ 買う価格 ＜ 利益確定の目標、損失上限は0円以上で入力します。</p>';return;}
 const loss=entry-stop,shares=Math.floor(budget/loss/100)*100,gain=target-entry,f=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:2});
 output.innerHTML=`<span>100株単位の計算例</span><strong class="result-big">${f(shares)}株</strong><span>1株の損失幅 ${f(loss)}円 × ${f(shares)}株<br>＝ 想定損失 <strong>${f(loss*shares)}円</strong></span><span class="compact">購入代金 ${f(entry*shares)}円<br>目標までの利益 ${f(gain*shares)}円 ／ 利益幅 ÷ 損失幅 ${f(gain/loss)}倍</span>${shares===0?'<p class="red compact">この条件では100株を買うと、想定する損失上限を超えます。</p>':''}`;
}
lesson.querySelector('#jump').innerHTML=slides.map((s,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')}　${s[0]}</option>`).join('');
lesson.querySelector('#jump').addEventListener('change',e=>go(Number(e.target.value)));
lesson.querySelector('#prev').addEventListener('click',()=>go(current-1));
lesson.querySelector('#next').addEventListener('click',()=>go(current+1));
document.addEventListener('keydown',e=>{if(document.activeElement.closest('.sidebar,.mobile-bar,footer'))return;if(/INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY/.test(document.activeElement.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(['ArrowRight','PageDown','ArrowLeft','PageUp','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:e.key==='End'?slides.length-1:current+(['ArrowRight','PageDown'].includes(e.key)?1:-1));}});
deck.addEventListener('click',e=>{const choice=e.target.closest('[data-choice]'),future=e.target.closest('[data-future]');if(choice){state.quiz=Number(choice.dataset.choice);render();lesson.querySelector(`[data-choice="${state.quiz}"]`).focus({preventScroll:true});}if(future){state.future=future.dataset.future;render();lesson.querySelector(`[data-future="${state.future}"]`).focus({preventScroll:true});}if(e.target.closest('#print-checklist'))window.print();});
deck.addEventListener('input',e=>{if(e.target.closest('#risk-form'))updateCalc();});
deck.addEventListener('submit',e=>e.preventDefault());
lesson.querySelector('#theme').addEventListener('click',()=>{const modes=['auto','light','dark'],mode=modes[(modes.indexOf(lesson.dataset.theme)+1)%3];lesson.dataset.theme=mode;lesson.querySelector('#theme').textContent='配色：'+{auto:'自動',light:'明るい',dark:'暗い'}[mode];});
lesson.querySelector('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await lesson.requestFullscreen();}catch{lesson.querySelector('#announcer').textContent='このブラウザでは全画面表示を開始できませんでした。';}});
lesson.querySelector('#print').addEventListener('click',()=>window.print());
let savedTheme;
window.addEventListener('beforeprint',()=>{savedTheme=lesson.dataset.theme;lesson.dataset.theme='light';printing=true;render();deck.querySelectorAll('details').forEach(d=>d.open=true);});
window.addEventListener('afterprint',()=>{printing=false;lesson.dataset.theme=savedTheme;render();});
window.addEventListener('hashchange',()=>go((parseInt(location.hash.replace('#slide-',''),10)||1)-1,false));
matchMedia('(max-width:680px)').addEventListener('change',()=>render());
window.addEventListener('resize',()=>requestAnimationFrame(fitSlide));
render();

document.fonts.ready.then(fitSlide);
let lastWidth=lesson.clientWidth;
new ResizeObserver(()=>{const width=lesson.clientWidth;if(Math.abs(width-lastWidth)>1){lastWidth=width;render();}}).observe(lesson);
document.addEventListener('fullscreenchange',()=>{render();lesson.querySelector('#fullscreen').textContent=document.fullscreenElement?'全画面を終了':'全画面';});
})();
