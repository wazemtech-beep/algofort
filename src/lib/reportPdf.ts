import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readableLabel } from "./inputHelpers";
type Options = { brandName:string; primary?:string; logo?:string|null; currency:string; from:string; to:string };
type Cell=string|number;
/** Branded, searchable PDF generated on the server, without a browser print dialog. */
export async function reportPdf(rows:Cell[][],options:Options):Promise<Buffer> {
  const doc=new PDFDocument({size:'A4',margins:{top:110,bottom:40,left:38,right:38},bufferPages:true,autoFirstPage:false,info:{Title:`${options.brandName} Financial Report`,Author:options.brandName,Creator:'Algofort Reports'}});
  const chunks:Buffer[]=[];
  const result=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  for(const [name,weight] of [['Body',400],['Bold',700]] as const)doc.registerFont(name,readFileSync(join(process.cwd(),'node_modules','@fontsource','manrope','files',`manrope-latin-${weight}-normal.woff`)));
  const brand=/^#[a-f\d]{6}$/i.test(options.primary||'')?options.primary!:'#285742',ink='#20362b',muted='#708078',line='#e2e8e1',paper='#f3f6f1';
  const width=595.28,left=38,contentWidth=width-76,bottom=777;
  const generated=new Date().toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  let y=115;
  const text=(value:Cell,x:number,top:number,w:number,size=9,bold=false,color=ink,align:'left'|'right'='left')=>{doc.font(bold?'Bold':'Body').fontSize(size).fillColor(color).text(String(value),x,top,{width:w,align,lineGap:2});};
  function newPage(){
    doc.addPage();doc.rect(0,0,width,6).fill(brand);let brandX=left;
    if(options.logo&&/^data:image\/(png|jpeg);base64,/.test(options.logo)){try{doc.image(Buffer.from(options.logo.split(',')[1],'base64'),left,26,{fit:[34,34]});brandX+=46;}catch{/* Optional invalid logos cannot prevent a report download. */}}
    text(options.brandName,brandX,29,contentWidth-(brandX-left)-145,18,true);text('FINANCIAL REPORT',width-190,32,152,10,true,brand,'right');
    text(`${options.from||'All dates'}  —  ${options.to||'Present'}`,left,76,contentWidth-120,9,false,muted);text(`Currency: ${options.currency}`,width-158,76,120,9,true,brand,'right');
    doc.moveTo(left,98).lineTo(width-left,98).strokeColor(line).lineWidth(.7).stroke();y=117;
  }
  function ensure(height:number){if(y+height>bottom)newPage();}
  function section(title:string,note:string){ensure(125);y+=9;text(title,left,y,contentWidth,13,true);y+=23;text(note,left,y,contentWidth,8,false,muted);y+=26;}
  function table(headers:Cell[],data:Cell[][],ratios:number[],numeric:number[]=[]){
    const widths=ratios.map(r=>r/ratios.reduce((a,b)=>a+b,0)*contentWidth);
    function heading(){doc.rect(left,y,contentWidth,36).fill(paper);let x=left;headers.forEach((value,i)=>{text(value,x+8,y+8,widths[i]-16,7.5,true,muted,numeric.includes(i)?'right':'left');x+=widths[i];});y+=36;}
    ensure(78);heading();if(!data.length){text('No records in this section.',left+10,y+15,contentWidth-20,9,false,muted);y+=49;return;}
    for(const [index,row] of data.entries()){
      const display=row.map((value,i)=>numeric.includes(i)&&Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):String(value));doc.font('Body').fontSize(8);
      const height=Math.max(35,...display.map((value,i)=>doc.heightOfString(value,{width:widths[i]-16,lineGap:2})+20));if(y+height>bottom){newPage();heading();}
      if(index%2)doc.rect(left,y,contentWidth,height).fill('#fafbf9');let x=left;
      display.forEach((value,i)=>{text(value,x+8,y+10,widths[i]-16,8,false,ink,numeric.includes(i)?'right':'left');x+=widths[i];});y+=height;doc.moveTo(left,y).lineTo(width-left,y).strokeColor(line).lineWidth(.4).stroke();
    }y+=18;
  }
  newPage();text('Business at a glance',left,y,contentWidth,20,true);y+=33;text('Income and expenses are reported separately. Amounts use the selected currency.',left,y,contentWidth,8,false,muted);y+=30;
  const summary=rows.slice(2).filter(row=>row.length===2),cardWidth=(contentWidth-24)/3;
  summary.forEach((row,index)=>{const col=index%3;if(col===0&&index>0)y+=86;const x=left+col*(cardWidth+12);doc.roundedRect(x,y,cardWidth,72,7).fill(paper);text(row[0],x+12,y+12,cardWidth-24,8,false,muted);text(`${options.currency} ${Number(row[1]).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`,x+12,y+34,cardWidth-24,12,true,brand);});y+=96;
  const sections=[
    {name:'Current project balances (all dates)',title:'Project Balances',note:'Current lifetime balances. Work completion and payment status are separate.',ratios:[1.7,1.25,1,1,1,1,1.15],numeric:[2,3,4]},
    {name:'Payments',title:'Payments Received',note:'Confirmed payments within the selected dates. Voided entries are excluded.',ratios:[1.25,1.7,1.1,1,1,1.1],numeric:[3,4]},
    {name:'Office expenses',title:'Office Expenses',note:'Standalone office costs within the selected dates. Salaries are listed separately.',ratios:[2.5,1.4,1.2,1.2],numeric:[3]},
    {name:'Salaries / advances',title:'Salary & Advance Payments',note:'Payments within the selected dates, including salary advances.',ratios:[2,1.1,1.3,1.1,1.2],numeric:[3]},
    {name:'Current salary obligations (all dates)',title:'Salary Obligations',note:'Current monthly obligations, including advances already paid.',ratios:[2,1.1,1.1,1.2,1.1],numeric:[2,3,4]},
  ];
  for(const block of sections){const start=rows.findIndex(row=>row[0]===block.name&&row.length>2);if(start<0)continue;let end=start+1;while(end<rows.length&&rows[end].length)end++;section(block.title,block.note);const header=rows[start].map((cell,i)=>i===0?(block.name==='Payments'?'Reference':block.name==='Office expenses'?'Description':block.name.startsWith('Current salary')||block.name==='Salaries / advances'?'Employee':'Project'):cell);const entries=rows.slice(start+1,end).map(row=>row.map((value,i)=>typeof value==='string'&&/^[A-Z]+(?:_[A-Z]+)*$/.test(value)&&!block.numeric.includes(i)?readableLabel(value):value));table(header,entries,block.ratios,block.numeric);}
  const range=doc.bufferedPageRange();
  for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.moveTo(left,796).lineTo(width-left,796).strokeColor(line).lineWidth(.7).stroke();text(`${options.brandName} · Confidential`,left,801,contentWidth/2,7,false,muted);text(`Generated ${generated} PKT · ${i+1} / ${range.count}`,left+contentWidth/2,801,contentWidth/2,7,false,muted,'right');doc.page.margins.bottom=40;}
  doc.end();return result;
}
