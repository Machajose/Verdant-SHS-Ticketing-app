import QRCode from "qrcode";
export async function downloadTicketArtwork(event,ticket,message){
  const canvas=document.createElement("canvas");canvas.width=1776;canvas.height=896;
  const c=canvas.getContext("2d");if(!c)throw new Error("Could not create ticket image.");
  const split=1320;
  c.fillStyle="#fff";c.fillRect(0,0,canvas.width,canvas.height);
  const face=c.createLinearGradient(0,0,split,896);face.addColorStop(0,"#0d422b");face.addColorStop(.58,"#155c39");face.addColorStop(1,"#0c3a26");c.fillStyle=face;c.fillRect(0,0,split,896);
  c.globalAlpha=.12;c.strokeStyle="#e6f5e9";c.lineWidth=2;
  for(let i=0;i<5;i++){c.beginPath();c.arc(1150,80,160+i*52,0,Math.PI*2);c.stroke()}c.globalAlpha=1;
  c.fillStyle="#fff";c.font="600 24px Arial";c.fillText("MURANG’A UNIVERSITY OF TECHNOLOGY",74,83);
  c.fillStyle="#d8eee0";c.font="600 20px Arial";c.fillText("SCHOOL OF HEALTH SCIENCES",76,122);
  c.fillStyle="#fff";c.font="600 82px Georgia";c.fillText("Annual Gala",74,226);
  c.fillStyle="#d8eee0";c.font="600 21px Arial";c.fillText("HEALING HANDS · ELEGANT HEARTS",78,273);
  roundRect(c,54,555,1205,280,18,"rgba(5,39,24,.94)");
  c.fillStyle="#cce9d5";c.font="600 22px Arial";
  const meta=(ticket.department+"   ·   "+ticket.ticketType+"   ·   "+ticket.ticketId).toUpperCase();
  c.fillText(meta,88,608,1125);
  c.fillStyle="#fff";c.font="700 58px Arial";c.fillText(ticket.fullName.slice(0,32),88,692,1125);
  c.fillStyle="#e6f3e9";c.font="500 29px Arial";
  const welcome=(ticket.guestCount>1?"Group admission · "+ticket.guestCount+" guests · ":"")+message;
  drawWrappedText(c,welcome,88,750,1100,42,2);
  c.fillStyle="#d8eee0";c.font="600 18px Arial";c.fillText("VOGUE · A TOUCH OF WHITE",88,811);
  c.fillStyle="#fff";c.fillRect(split,0,456,896);c.fillStyle="#17633d";c.fillRect(split,0,8,896);
  c.fillStyle="#155132";c.font="700 22px Arial";c.textAlign="center";c.fillText("ADMISSION PASS",1548,114);
  c.fillStyle="#fff";c.fillRect(1388,202,320,320);c.strokeStyle="#17633d";c.lineWidth=3;roundRectStroke(c,1388,202,320,320,16);
  const qr=await QRCode.toDataURL(ticket.token,{width:300,margin:1,errorCorrectionLevel:"H",color:{dark:"#123d2a",light:"#ffffff"}});
  const qrImg=await loadImage(qr);c.drawImage(qrImg,1403,217,290,290);
  c.fillStyle="#155132";c.font="700 21px Arial";c.fillText("SCAN TO VERIFY",1548,581);
  c.fillStyle="#263c2e";c.font="700 25px Arial";c.fillText(ticket.ticketId,1548,655);
  c.fillStyle="#65776a";c.font="600 18px Arial";c.fillText(ticket.guestCount+" "+(ticket.guestCount===1?"ADMISSION":"ADMISSIONS"),1548,704);
  c.fillStyle="#65776a";c.font="16px Arial";c.fillText("KEEP THIS PASS READY",1548,798);
  const a=document.createElement("a"),slug=event.name.toLowerCase().replace(/[^a-z0-9]+/g,"-");
  a.download=ticket.ticketId+"-"+slug+".png";a.href=canvas.toDataURL("image/png");a.click();
}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})}
function roundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill()}
function roundRectStroke(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.stroke()}
function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,maxLines){const words=text.split(/\s+/);let line="",count=0;for(const word of words){const next=line?line+" "+word:word;if(ctx.measureText(next).width>maxWidth&&line){cFill(ctx,line,x,y+count*lineHeight,maxWidth);count++;line=word;if(count>=maxLines-1)break}else line=next}if(line)cFill(ctx,line,x,y+count*lineHeight,maxWidth)}
function cFill(ctx,line,x,y,width){ctx.fillText(line,x,y,width)}
