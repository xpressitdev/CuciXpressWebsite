import fs from "node:fs";
import pptxgen from "pptxgenjs";

const dir = ".local/outputs/q3-2026";
const data = JSON.parse(fs.readFileSync(`${dir}/financial-snapshot.json`, "utf8"));
const q = data.q3.ytd, p = data.q2.ytd;
// Previously issued Q2 presentation: rounded revenue; supporting workbook retains cents.
const priorRevenue = 8493000;
const months = data.q3.months.map(m => Object.fromEntries(m.lines.map(l => [l.key,l.cents])));
const branches = data.branches;
const C = { ink:"111722", purple:"9168E8", orange:"FF9900", bg:"F8F9FC",
  lilac:"F0EAFB", cream:"FFF3E2", white:"FFFFFF", mute:"5C6472", grid:"DDDDE6", red:"AD3434", green:"087F66" };
const money = (c, digits=0) => `${c<0?"−":""}B$${(Math.abs(c)/100).toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits})}`;
const num = c => (c/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = (a,b) => `${(100*a/b).toFixed(1)}%`;
const signMoney = c => `${c>0?"+":""}${money(c,2)}`;
const change = (a,b) => `${a<b?"−":"+"}${Math.abs(100*(a-b)/b).toFixed(1)}%`;
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Cuci Xpress";
pptx.subject = "Q3 2026 shareholder performance — unaudited management accounts";
pptx.title = "Cuci Xpress | Q3 2026 Shareholder Update";
pptx.company = "Cuci Xpress";
pptx.lang = "en-GB";
pptx.theme = { headFontFace:"Inter", bodyFontFace:"Inter", lang:"en-GB" };
const W=13.333333, H=7.5;
const shape = pptx.ShapeType;
let slideNo=0;
const auditBounds=[];
function txt(s,text,x,y,w,h,size=18,opts={}) {
  auditBounds.push({slide:slideNo,text:typeof text==="string"?text.slice(0,70):"rich text",x,y,w,h});
  s.addText(text,{x,y,w,h,fontFace:"Inter",fontSize:size,color:C.ink,margin:0,
    breakLine:false, valign:"mid", paraSpaceAfterPt:0,...opts});
}
function rect(s,x,y,w,h,fill=C.white,stroke=C.ink,radius=true,shadow=false) {
  if(shadow)s.addShape(radius?shape.roundRect:shape.rect,{x:x+.045,y:y+.055,w,h,rectRadius:.14,
    radius:.14,line:{color:C.ink,width:1},fill:{color:C.ink}});
  s.addShape(radius?shape.roundRect:shape.rect,{x,y,w,h,radius:.14,rectRadius:.14,
    line:{color:stroke,width:stroke===fill?0:1.2},fill:{color:fill}});
}
function line(s,x1,y1,x2,y2,color=C.grid,width=1) {
  s.addShape(shape.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width}});
}
function brand(s,x=.55,y=.28,w=2.8) {
  txt(s,[{text:"Cuci ",options:{color:C.purple,bold:true}},{text:"Xpress",options:{color:C.orange,bold:true}}],
    x,y,w,.35,21);
}
function slide(title,section,sub="",foot="Source: Cuci Xpress Admin P&L • Snapshot: 6 Oct 2026, 04:43 BNT • Unaudited management accounts") {
  const s=pptx.addSlide();slideNo++;
  s.background={color:C.bg};brand(s);
  txt(s,section.toUpperCase(),9.1,.3,3.65,.24,10,{align:"right",bold:true,color:C.mute,charSpacing:1.4});
  txt(s,title,.55,.98,12.2,.83,30,{bold:true,breakLine:false});
  if(sub)txt(s,sub,.57,1.87,12.1,.42,13,{color:C.mute});
  line(s,.55,6.95,12.8,6.95);
  txt(s,foot,.55,7.04,11.6,.2,8.5,{color:C.mute});
  txt(s,String(slideNo).padStart(2,"0"),12.3,7.01,.5,.25,11,{bold:true,align:"right"});
  s.addNotes(`CONFIDENTIAL — existing-shareholder update. Reporting period 1 July–30 September 2026, inclusive, Asia/Brunei. Q2 comparison: 1 April–30 June 2026. Source: Cuci Xpress management P&L records, snapshot extracted ${data.extractedAt}. All amounts BND. Reported profit is EBITDA less recorded depreciation; financing and income tax are not separately modelled. Figures are unaudited management accounts. See Appendix B for accounting policies.`);
  return s;
}
function pill(s,text,x,y,w,fill=C.lilac,color=C.purple) {
  rect(s,x,y,w,.38,fill,fill);
  txt(s,text,x+.12,y+.045,w-.24,.27,11,{bold:true,color});
}
function card(s,x,y,w,h,kicker,value,detail,fill=C.white) {
  rect(s,x,y,w,h,fill,C.ink,true,true);
  txt(s,kicker.toUpperCase(),x+.22,y+.2,w-.44,.35,11,{bold:true,color:C.mute,charSpacing:.8});
  txt(s,value,x+.22,y+.7,w-.44,.67,w<3.1?25:31,{bold:true,wrap:false});
  txt(s,detail,x+.22,y+1.48,w-.44,h-1.65,12,{color:C.mute,valign:"top"});
}
function bullet(s,title,body,x,y,w=5.5,color=C.purple) {
  s.addShape(shape.ellipse,{x,y:y+.08,w:.12,h:.12,line:{color},fill:{color}});
  txt(s,title,x+.27,y,w-.27,.4,17,{bold:true});
  txt(s,body,x+.27,y+.46,w-.27,.75,13,{color:C.mute,valign:"top"});
}
function table(s,rows,x,y,widths,rowH=.43,opt={}) {
  const total=widths.reduce((a,b)=>a+b,0);
  rows.forEach((row,i)=>{
    const fill=i===0?C.ink:(opt.highlight?.includes(i)?C.lilac:i%2?C.white:C.bg);
    rect(s,x,y+i*rowH,total,rowH,fill,fill,false);
    let dx=x;
    row.forEach((cell,j)=>{
      const value=typeof cell==="object"?cell.text:cell;
      const bold=i===0||opt.bold?.includes(i);
      const color=i===0?C.white:(typeof cell==="object"?cell.color:C.ink);
      txt(s,String(value),dx+.12,y+i*rowH+.04,widths[j]-.24,rowH-.08,opt.size??13,
        {bold,color,align:j?"right":"left"});
      dx+=widths[j];
    });
  });
}
function sourceNotes(s,notes) {s.addNotes(notes);}
function profitColor(c){return c<0?C.red:C.green;}

// 01 — Brand-led cover.
{
  const s=slide("","Shareholder update");
  pill(s,"1 JUL — 30 SEP 2026",.62,1.18,2.48);
  txt(s,"Q3 2026",.6,1.9,7.5,1.03,60,{bold:true});
  txt(s,"Performance\n& priorities.",.6,3.05,7.25,1.67,42,{bold:true});
  txt(s,"Five branches. One operating view.",.65,5.15,7,.45,21,{color:C.mute});
  pill(s,"CONFIDENTIAL • SHAREHOLDER UPDATE",.65,6.06,4.65,C.cream,C.ink);
  rect(s,8.38,1.34,4.32,4.96,C.white,C.ink,true,true);
  txt(s,"REVENUE",8.7,1.76,3.6,.3,12,{bold:true,color:C.mute,charSpacing:1.2});
  txt(s,money(q.revenue),8.7,2.28,3.6,.8,39,{bold:true,color:C.purple});
  line(s,8.7,3.32,12.34,3.32);
  txt(s,"Reported profit¹",8.7,3.63,3.6,.4,16,{color:C.mute});
  txt(s,money(q.net_profit,2),8.7,4.13,3.6,.65,31,{bold:true});
  txt(s,`${pct(q.net_profit,q.revenue)} margin • ${change(q.revenue,priorRevenue)} revenue\nvs Q2 previously reported`,8.7,5.14,3.6,.58,13);
  sourceNotes(s,"¹ Reported profit is EBITDA less recorded depreciation, on the management-reporting basis described in Appendix B. Financing and income tax are not separately modelled.");
}

// 02 — Executive summary.
{
  const s=slide("Q3 was profitable; September ended softer.","Executive summary",
    "Q3 management results • Revenue benchmark: Q2 previously reported • See reconciliation on slide 5");
  const metrics=[
    ["Revenue",money(q.revenue),`${change(q.revenue,priorRevenue)} vs reported Q2\nQ2 benchmark: B$84,930`,C.white],
    ["Gross margin",pct(q.gross_profit,q.revenue),"Q3 gross profit\nB$37,090.70",C.lilac],
    ["EBITDA",money(q.ebitda,2),`${pct(q.ebitda,q.revenue)} of Q3 revenue\nBefore depreciation`,C.white],
    ["Reported profit¹",money(q.net_profit,2),`${pct(q.net_profit,q.revenue)} Q3 margin\nAfter recorded depreciation`,C.cream],
  ];
  metrics.forEach((m,i)=>card(s,.6+i*3.13,2.58,2.93,2.38,...m));
  bullet(s,"Three branches profitable","Bengkurong was the largest reported-profit contributor.",.7,5.43,5.75);
  bullet(s,"September requires attention",`${money(months[2].net_profit,2)} reported result; revenue fell ${Math.abs(100*(months[2].revenue/months[1].revenue-1)).toFixed(1)}% from August.`,7.0,5.43,5.4,C.orange);
}

// 03 — Quarter-on-quarter accounts.
{
  const s=slide("Q3 financial scorecard","Financial scorecard",
    "BND • Q3 management accounts • Expense figures shown as positive costs");
  const labels=[["Revenue","revenue"],["Cost of services","cost_of_services"],["Gross profit","gross_profit"],
    ["Operating expenses","operating_expense"],["EBITDA","ebitda"],["Recorded depreciation","depreciation"],["Reported profit¹","net_profit"]];
  const rows=[["Metric","Q3 2026"],
    ...labels.map(([label,k])=>[label,num(q[k])]),
    ["Gross margin",pct(q.gross_profit,q.revenue)],
    ["Reported profit margin¹",pct(q.net_profit,q.revenue)]];
  table(s,rows,.6,2.55,[7.3,4.8],.365,{size:13,bold:[1,5,7],highlight:[5,7]});
  txt(s,"Q2 profit and cost comparisons are held pending reconciliation with the previously issued report.",
    .72,6.43,11.9,.3,12,{color:C.mute});
}

// 04 — Native editable revenue chart, no dual-axis ambiguity.
{
  const s=slide("August was the high point; September reversed it.","Monthly performance",
    "Revenue trend (B$ thousands) • July–September actuals • Exact monthly figures below");
  s.addChart(pptx.ChartType.line,[{name:"Revenue",labels:["July","August","September"],values:months.map(m=>m.revenue/100000)}],{
    x:.62,y:2.4,w:7.6,h:3.02,showLegend:false,showTitle:false,showValue:true,
    chartColors:[C.purple],showMarker:true,markerSize:7,lineSize:3,
    valAxisMinVal:0,valAxisMaxVal:35,valAxisMajorUnit:10,
    valAxisLabelFontFace:"Inter",valAxisLabelFontSize:11,catAxisLabelFontFace:"Inter",catAxisLabelFontSize:12,
    showCatName:false,showSerName:false,dataLabelColor:C.ink,dataLabelFormatCode:"0.0",
    dataLabelPosition:"t",dataLabelBkgrdColor:C.white,
    catAxisLineShow:false,valAxisLineShow:false,valGridLine:{color:C.grid,width:.6},
    showBorder:false,showCatName:false,showShadow:false,
  });
  rect(s,8.72,2.52,3.93,2.72,C.cream,C.ink,true,true);
  txt(s,"SEPTEMBER VS AUGUST",8.98,2.78,3.38,.3,11,{bold:true});
  txt(s,change(months[2].revenue,months[1].revenue),8.98,3.3,3.38,.7,36,{bold:true});
  txt(s,"Revenue declined B$6,336.20.\nCOS fell only B$469.59;\nOPEX rose B$223.56.",8.98,4.15,3.38,.8,13,{color:C.mute});
  table(s,[["BND","July","August","September"],
    ["Revenue",...months.map(m=>num(m.revenue))],
    ["EBITDA",...months.map(m=>({text:num(m.ebitda),color:profitColor(m.ebitda)}))],
    ["Reported profit¹",...months.map(m=>({text:num(m.net_profit),color:profitColor(m.net_profit)}))]],
    .65,5.43,[3.4,2.93,2.93,2.73],.32,{size:12});
}

// 05 — Separate, unresolved historical reconciliation; not a restatement.
{
  const s=slide("Q2 reference figures: reconciliation remains open.","Historical reconciliation",
    "Previously reported revenue remains the shareholder benchmark • No historical restatement is asserted",
    "Sources: Previously issued Q2 presentation and supporting workbook • App snapshot: 6 Oct 2026 • BND");
  table(s,[
    ["Q2 revenue","Prior workbook","App recalculation","Difference"],
    ["April","34,646.86","34,444.56","−202.30"],
    ["May","24,179.57","23,569.96","−609.61"],
    ["June","26,103.49","26,085.79","−17.70"],
    ["Total","84,929.92","84,100.31","−829.61"],
  ],.65,2.5,[3.0,3.0,3.05,3.0],.43,{size:13,bold:[4],highlight:[4]});
  txt(s,"Prior presentation: B$84,930 (rounded). Q3 revenue is 2.1% below that previously reported benchmark.",
    .76,4.82,11.8,.4,13,{bold:true});
  bullet(s,"Profit comparison held","Prior Q2 presentation: B$3,235 profit.\nApp recalculation: B$855.48 loss.",.78,5.39,5.78);
  bullet(s,"Next reconciliation step","Match underlying sales and expense records. The transaction-level cause of the differences is not yet established.",7.0,5.39,5.48,C.orange);
  sourceNotes(s,"The prior Q2 workbook gives revenue 84,929.92 and profit 3,234.72; the issued deck rounds these to 84,930 and 3,235. The application snapshot recalculates revenue 84,100.31 and profit -855.48. The exact workbook-to-app revenue difference is -829.61; using the rounded presentation number gives -829.69. These differences are unresolved, not approved adjustments. No cause is attributed to refunds, revisions or accounting policy without transaction evidence. Q3 83,142.40 versus previously reported 84,930 is -2.1048%, displayed -2.1%. Quarter-on-quarter profit, margin and cost improvement claims have been removed.");
}

// 06 — Expense concentration.
{
  const s=slide("Payroll and rent absorb 74.8% of revenue.","Cost structure",
    "Q3 cost of services + OPEX: B$78,618.32 • Excludes B$2,125.05 recorded depreciation");
  const payroll=q["expense:Staff Wages"]+q["expense:Part-timer Wages"]+q["expense:Bonus"];
  const groups=[
    ["Wages, part-time & bonus",payroll],
    ["Rent",q["expense:Total Units Rental"]],
    ["Wash chemicals",q["expense:Car Wash Shampoo & Tyre Shine + Car Wax"]],
    ["Management fee",q["expense:Management Fee"]],
    ["Water, electricity & Wi-Fi",q["expense:Water Bill"]+q["expense:Electricity Bill"]+q["expense:Wifi Internet"]],
    ["SPK",q["expense:SPK"]],
  ];
  const other=q.cost_of_services+q.operating_expense-groups.reduce((n,g)=>n+g[1],0);
  groups.push(["All other operating costs",other]);
  groups.forEach(([label,v],i)=>{
    const yy=2.57+i*.48;
    txt(s,label,.66,yy,3.12,.33,12.5);
    rect(s,3.97,yy+.05,5.25*v/payroll,.22,i<2?C.purple:"C4ACEF",i<2?C.purple:"C4ACEF",false);
    txt(s,money(v,2),9.5,yy,2.88,.33,13,{bold:true,align:"right"});
  });
  rect(s,.64,6.22,12.04,.48,C.lilac,C.lilac);
  txt(s,`Payroll ${pct(payroll,q.revenue)} of revenue  +  rent ${pct(q["expense:Total Units Rental"],q.revenue)}  =  ${pct(payroll+q["expense:Total Units Rental"],q.revenue)} before other operating costs.`,
    .87,6.29,11.55,.27,13,{bold:true});
  sourceNotes(s,"Payroll here means Staff Wages + Part-timer Wages + Bonus. SPK is separately presented to avoid double counting. Other includes miscellaneous, maintenance, Connecteam, supplies and MDR; all groups reconcile to COS + OPEX.");
}

// 07 — Full branch reconciliation.
{
  const s=slide("Bengkurong leads; two branches dilute returns.","Branch contribution",
    "Q3 2026 • BND • Branch contribution includes allocated operating costs and recorded depreciation");
  const rows=[["Branch / scope","Revenue","EBITDA","Reported profit¹","Margin"]];
  for(const b of branches)rows.push([b.name,num(b.totals.revenue),
    {text:num(b.totals.ebitda),color:profitColor(b.totals.ebitda)},
    {text:num(b.totals.net_profit),color:profitColor(b.totals.net_profit)},pct(b.totals.net_profit,b.totals.revenue)]);
  const sum=k=>branches.reduce((n,b)=>n+b.totals[k],0);
  rows.push(["Central / unassigned",num(q.revenue-sum("revenue")),num(q.ebitda-sum("ebitda")),num(q.net_profit-sum("net_profit")),"—"]);
  rows.push(["Overall",num(q.revenue),num(q.ebitda),num(q.net_profit),pct(q.net_profit,q.revenue)]);
  table(s,rows,.65,2.56,[3.06,2.17,2.17,2.63,2.0],.45,{size:13,bold:[7],highlight:[7]});
  txt(s,"Central / unassigned = B$837.00 voucher sales + B$706.40 subscription revenue, less B$24.81 MDR.",
    .72,6.34,11.95,.33,12,{color:C.mute});
  sourceNotes(s,"Central/unassigned rows reconcile all branches to Overall. No unassigned voucher sales are arbitrarily spread among branches. Subscription revenue may be unallocated until a branch is attributable. Central margin is intentionally not shown because no branch operating-cost allocation is applied to this line.");
}

// 08 — Targeted operational priorities grounded in actual amounts.
{
  const s=slide("Focus branch recovery on Salar and Lambak.","Operating priorities",
    "Combined Q3 reported loss: B$5,311.17 • Proposed areas for management review");
  const loss=branches.filter(b=>["Salar","Lambak"].includes(b.name));
  loss.forEach((b,i)=>{
    const x=.64+i*6.4;
    rect(s,x,2.55,6.03,3.93,i?C.cream:C.white,C.ink,true,true);
    txt(s,b.name,x+.25,2.83,5.5,.4,24,{bold:true});
    txt(s,money(b.totals.net_profit,2),x+.25,3.4,5.5,.58,32,{bold:true,color:C.red});
    txt(s,`${pct(b.totals.net_profit,b.totals.revenue)} margin • Revenue ${money(b.totals.revenue,2)}`,x+.25,4.09,5.5,.35,13);
    const payroll=b.totals["expense:Staff Wages"]+b.totals["expense:Part-timer Wages"]+b.totals["expense:Bonus"];
    txt(s,`Wages / part-time / bonus: ${money(payroll,2)}\nRent: ${money(b.totals["expense:Total Units Rental"],2)}\nTogether: ${pct(payroll+b.totals["expense:Total Units Rental"],b.totals.revenue)} of branch revenue`,
      x+.25,4.72,5.5,1.08,15,{color:C.mute,breakLine:false});
    pill(s,i?"Review demand and shift coverage":"Review rent burden and staffing",x+.25,5.95,5.42,C.lilac,C.ink);
  });
  sourceNotes(s,"Salar payroll 6638.72 and rent 6600.00 versus revenue 13371.00. Lambak payroll 5456.75 and rent 3000.00 versus revenue 8747.00. No staffing reduction, rent renegotiation or demand-growth assumption is represented as an approved action.");
}

// 09 — Commercial streams and explicit revenue policy.
{
  const s=slide("POS remains the core; prepaid channels are small.","Revenue composition",
    "The three streams below reconcile to Q3 reported revenue of B$83,142.40");
  card(s,.65,2.56,3.93,2.39,"POS, net of refunds",money(q.pos_net_revenue,2),`${pct(q.pos_net_revenue,q.revenue)} of Q3 revenue\nCurrent and historical POS records`);
  card(s,4.87,2.56,3.73,2.39,"Paid voucher sales",money(q.voucher_sales_revenue,2),`${pct(q.voucher_sales_revenue,q.revenue)} of Q3 revenue\n93 vouchers • 5 bulk sales`,C.cream);
  card(s,8.9,2.56,3.73,2.39,"Subscription revenue",money(q.recognized_subscription_revenue,2),`${pct(q.recognized_subscription_revenue,q.revenue)} of Q3 revenue\nRecognized over service periods`,C.lilac);
  bullet(s,"Voucher policy: revenue at sale","Management reporting recognises sales in full: B$450 in July, B$36 in August and B$351 in September.",.78,5.33,5.95,C.orange);
  bullet(s,"Redemption treatment","The B$0 redemption package avoids recognising the sale twice. Serial-level reconciliation remains a proposed control.",7.02,5.33,5.45);
  sourceNotes(s,"Voucher revenue is recognized fully on original sale dates at the owner's direction, not deferred until service. This policy may differ from statutory/accrual treatment and should be reviewed with the accountant before external financial reliance. No buyer names or voucher serials are disclosed in the investor deck.");
}

// 10 — Confidence / caveats without burying them in notes.
{
  const s=slide("Q3 reporting includes all 15 depreciation entries.","Reporting overview",
    "Five branches × three months • Recorded management P&L coverage as at 6 October 2026");
  card(s,.65,2.54,3.93,2.12,"Depreciation coverage","15 / 15","Five branches × three months",C.lilac);
  card(s,4.87,2.54,3.73,2.12,"Recorded depreciation",money(q.depreciation,2),"B$708.35 per month",C.white);
  card(s,8.9,2.54,3.73,2.12,"Unmapped expense value","B$0.00","Within the recorded Q3 dataset",C.white);
  bullet(s,"Connecteam expenses","Latest successful sync: 6 Oct, 04:42 BNT. Advance salary is informational and excluded from P&L.",.78,5.07,5.9);
  bullet(s,"Reporting basis","Quarterly revenue, costs and branch profitability from management records. Accounting policies are set out in Appendix B.",7.02,5.07,5.4,C.orange);
  sourceNotes(s,`Live report status at extraction: ${data.q3.coverage.status}. Depreciation missing months: ${JSON.stringify(data.q3.coverage.depreciationMissingMonths)}. Informational excluded advance salary allocations: ${JSON.stringify(data.q3.coverage.warnings)}. Such allocations are not unique submission counts. No savings claim is made from their exclusion.`);
}

// 11 — Management-supplied brand-building update for existing shareholders.
{
  const s=slide("Building trust. Growing our reputation.","Brand momentum",
    "Corporate and institutional trust • CEO-led marketing • Building for the long term",
    "Source: Management update • Brand-building activities to date • Financial results unchanged");
  rect(s,.65,2.52,5.92,2.81,C.white,C.ink,true,true);
  txt(s,"Trusted by recognised organisations",.92,2.77,5.38,.42,19,{bold:true});
  txt(s,"Examples highlighted by management:",.92,3.25,5.38,.32,12,{color:C.mute});
  [
    ["BSM",.92,3.77,2.43],
    ["Takaful",3.59,3.77,2.43],
    ["Progresif",.92,4.27,2.43],
    ["Bruhealth",3.59,4.27,2.43],
    ["Job Centre",.92,4.77,2.43],
  ].forEach(([label,x,y,w])=>pill(s,label,x,y,w,C.lilac,C.ink));
  rect(s,6.87,2.52,5.77,2.81,C.cream,C.ink,true,true);
  txt(s,"CEO-led brand visibility",7.14,2.77,5.23,.42,19,{bold:true});
  bullet(s,"Podcast with Posh Qifly","Sharing the Cuci Xpress story with a wider audience.",7.15,3.38,5.08);
  bullet(s,"Progresif Ding adverts","An appearance that brings further visibility to Cuci Xpress.",7.15,4.35,5.08,C.orange);
  rect(s,.65,5.63,11.99,1.08,C.lilac,C.lilac);
  txt(s,"Profit is modest today; our commitment is long-term growth.",.92,5.77,11.45,.32,18,{bold:true});
  txt(s,"We are building trust and visibility while working to improve profitability. Thank you for believing in Cuci Xpress.\nInsyaAllah, we are moving in the right direction.",
    .92,6.15,11.45,.43,12.5,{color:C.ink});
  sourceNotes(s,"Management reports growing trust in Cuci Xpress from BSM, Takaful, Progresif, Bruhealth and Job Centre, alongside CEO-led marketing including a podcast with Posh Qifly and an appearance in Progresif Ding adverts. These examples are a qualitative brand-building update to date; activity dates were not specified, so they are not attributed specifically to Q3. No formal partnership, endorsement, contract value, audience reach or measured financial return is asserted. The long-term message expresses management's direction and commitment, not a guarantee of future profits.");
}

// 12 — Actionable, clearly labelled recommendations.
{
  const s=slide("Q4 focus: protect contribution before pursuing scale.","Recommended priorities",
    "Proposed priorities for management and shareholder discussion");
  const actions=[
    ["01","Recover loss-making branch contribution","Review Salar’s rent/staffing burden and Lambak’s demand/shift coverage. Track weekly branch results."],
    ["02","Understand September’s revenue decline","Compare branch-level sales, operating days and wash activity before assigning a cause."],
    ["03","Reconcile Q2 before drawing profit trends","Match the previously reported figures to current records before making cost-saving or profit-growth claims."],
    ["04","Strengthen quarterly shareholder reporting","Include cash position, significant liabilities and use of invested funds once reconciled figures are available."],
  ];
  actions.forEach((a,i)=>{
    const y=2.53+i*.99;
    pill(s,a[0],.68,y+.08,.63,i%2?C.cream:C.lilac,C.ink);
    txt(s,a[1],1.61,y,10.9,.37,18,{bold:true});
    txt(s,a[2],1.61,y+.43,10.86,.43,13,{color:C.mute});
  });
}

// 13 — Exact monthly appendix for traceability.
{
  const s=slide("Appendix A — Q3 monthly management P&L","Financial detail",
    "BND • Full precision • Expenses shown as positive costs");
  const keys=[["POS revenue, net refunds","pos_net_revenue"],["Subscription revenue","recognized_subscription_revenue"],
    ["Voucher sales revenue","voucher_sales_revenue"],["Total revenue","revenue"],["Cost of services","cost_of_services"],
    ["Gross profit","gross_profit"],["Operating expenses","operating_expense"],["Unmapped expenses","unmapped_expenses"],
    ["EBITDA","ebitda"],["Recorded depreciation","depreciation"],["Reported profit¹","net_profit"]];
  table(s,[["Metric","July","August","September","Q3"],
    ...keys.map(([label,k])=>[label,...months.map(m=>num(m[k])),num(q[k])])],
    .64,2.48,[3.96,2.02,2.02,2.02,1.98],.335,{size:11.5,bold:[4,9,11],highlight:[4,9,11]});
}

// 14 — Investor-shareable basis and cautions.
{
  const s=slide("Appendix B — Reporting basis and accounting policies","Basis of preparation",
    "Q3 2026 shareholder update • Prepared 6 October 2026");
  const sections=[
    ["Scope & currency","Q3: 1 July–30 September 2026, Brunei calendar dates; BND (B$). Revenue comparison uses Q2 previously reported: B$84,930. Q2 recalculations remain unreconciled (slide 5); profit comparisons are held."],
    ["Revenue","POS net of refunds under the app’s realization-day rules; subscriptions recognized over service periods. Paid physical vouchers recognized in full at sale under management policy, rather than deferred to redemption."],
    ["Expenses & allocation","Connecteam eligible expenses follow expense dates. “All” expenses split equally across five branches. Advance salary is excluded. Unknown-branch voucher sales remain central/unassigned."],
    ["Profit & depreciation","Reported profit¹ = EBITDA less recorded depreciation. Financing and income tax are not separately modelled. Depreciation uses management-entered monthly amounts across all five branches."],
    ["Reporting basis","This quarterly update summarises July–September revenue, expenses and branch profitability, based on management records as at 6 October 2026. Figures are unaudited and use the accounting policies described above."],
  ];
  sections.forEach(([a,b],i)=>{
    const yy=2.44+i*.82;
    txt(s,a,.72,yy,2.3,.35,14,{bold:true,color:C.purple});
    txt(s,b,3.17,yy,9.35,.63,12,{color:C.mute,valign:"top"});
  });
  sourceNotes(s,"Existing-shareholder update based on a fixed aggregate snapshot of Cuci Xpress management P&L records, extracted 6 October 2026 at 04:43 BNT; latest expense sync 04:42 BNT. The presentation addresses quarterly operating performance. Recommended actions are proposals for discussion, not approved commitments. Voucher revenue-at-sale treatment is a management-reporting policy and may differ from applicable statutory accounting treatment. Reported profit is not a measure of cash available for distribution.");
}

// Sanity checks on both the financial model and slide geometry.
for(const r of [q,p,...months,...branches.map(b=>b.totals)]) {
  if(r.revenue !== r.pos_net_revenue+r.recognized_subscription_revenue+r.voucher_sales_revenue)throw Error("Revenue does not reconcile");
  if(r.ebitda !== r.revenue-r.cost_of_services-r.operating_expense-r.unmapped_expenses)throw Error("EBITDA does not reconcile");
  if(r.net_profit !== r.ebitda-r.depreciation)throw Error("Profit does not reconcile");
}
for(const box of auditBounds)if(box.x<0||box.y<0||box.x+box.w>W+.01||box.y+box.h>H+.01)throw Error(`Out of bounds: ${JSON.stringify(box)}`);
await pptx.writeFile({fileName:`${dir}/Cuci-Xpress-Q3-2026-Shareholder-Update-Reported-Q2-Benchmark.pptx`});
console.log(`Created ${slideNo} slides; all financial identities and text bounds validated.`);
