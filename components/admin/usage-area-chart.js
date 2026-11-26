"use client";
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {chartDomain,usageSeriesPaths} from '../../lib/openai-usage-chart.js';
import {reportNumber,reportUsd} from '../../lib/openai-usage-format.js';
import styles from './openai-usage-report.module.css';
const seriesFor={cost:[{key:'cost',label:'OpenAI cost',color:'#078cff'}],tokens:[{key:'input',label:'Input',color:'#078cff'},{key:'output',label:'Output',color:'#b5ddff',base:'input'},{key:'cached',label:'Cached input',color:'#0759a8',lineOnly:true}],requests:[{key:'requests',label:'Model requests',color:'#078cff'}]};
export default function UsageAreaChart({points,kind,label,available=false,emptyMessage='Connect reporting to load this chart.',selectedDate=null,onSelectDate,contextLabel=''}){
 const host=useRef(null),[width,setWidth]=useState(900),[active,setActive]=useState(null),id=useId().replace(/:/g,'');
 useEffect(()=>{const element=host.current;if(!element)return;const resize=()=>setWidth(Math.max(270,element.clientWidth));resize();const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();},[]);
 const series=seriesFor[kind],height=245,left=kind==='cost'?66:48,right=14,top=16,bottom=height-35;
 const domain=useMemo(()=>chartDomain(points.map(p=>kind==='tokens'?(p.input===null||p.output===null?null:p.input+p.output):p[kind==='cost'?'cost':'requests']),kind==='cost'),[points,kind]);
 const x=index=>left+(width-left-right)*(points.length<2?.5:index/(points.length-1));
 const y=value=>bottom-(value-domain.min)/(domain.max-domain.min)*(bottom-top);
 const activity=available&&points.some(point=>series.some(s=>Number.isFinite(point[s.key])&&point[s.key]!==0));
 const selectedIndex=points.findIndex(point=>point.date===selectedDate),displayIndex=active??(selectedIndex>=0?selectedIndex:null);
 const current=available&&displayIndex!==null?points[Math.min(displayIndex,points.length-1)]:null;
 const dateLabel=value=>new Date(value+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
 const axis=value=>kind==='cost'&&Math.abs(value)<1000?reportUsd(String(value)):new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1,...(kind==='cost'?{style:'currency',currency:'USD'}:{})}).format(value);
 const tickIndexes=[...new Set(Array.from({length:width<480?3:6},(_,i)=>Math.round((points.length-1)*i/(width<480?2:5))))];
 function move(event){if(!available)return;const bounds=host.current.getBoundingClientRect(),relative=event.clientX-bounds.left;setActive(Math.max(0,Math.min(points.length-1,Math.round((relative-left)/(width-left-right)*(points.length-1)))));}
 function key(event){if(!available)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectDate?.(points[displayIndex??0]?.date);return;}if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)){event.preventDefault();if(event.key==='Escape')setActive(null);else if(event.key==='Home')setActive(0);else if(event.key==='End')setActive(points.length-1);else setActive(value=>Math.max(0,Math.min(points.length-1,(value??0)+(event.key==='ArrowRight'?1:-1))));}}
 return <div className={styles.chartBlock}>
  <div ref={host} className={styles.plot} onPointerMove={move} onPointerLeave={()=>setActive(null)} onClick={event=>{if(!available)return;const bounds=host.current.getBoundingClientRect(),index=Math.max(0,Math.min(points.length-1,Math.round((event.clientX-bounds.left-left)/(width-left-right)*(points.length-1))));onSelectDate?.(points[index]?.date);}}>
   <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label+(available?'. Hover or use arrow keys for daily values; click or press Enter to select a date.':'')} tabIndex={available?0:undefined} onFocus={()=>{if(available)setActive(selectedIndex>=0?selectedIndex:0);}} onBlur={()=>setActive(null)} onKeyDown={key}>
    <defs><clipPath id={id+'-clip'}><rect x={left} y={top} width={Math.max(1,width-left-right)} height={bottom-top}/></clipPath>{series.map(s=><linearGradient key={s.key} id={id+s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".55"/><stop offset="100%" stopColor={s.color} stopOpacity=".08"/></linearGradient>)}</defs>
    {domain.ticks.map((tick,index)=><g key={index}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/><text x={left-12} y={y(tick)+4} textAnchor="end" className={styles.axisText}>{available?axis(tick):'—'}</text></g>)}
    <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} className={styles.baseline}/>
    {tickIndexes.map(index=>points[index]&&<text key={index} x={x(index)} y={height-8} textAnchor={index===0?'start':index===points.length-1?'end':'middle'} className={styles.axisText}>{dateLabel(points[index].date)}</text>)}
    <g clipPath={`url(#${id}-clip)`}>{activity&&series.flatMap(s=>usageSeriesPaths(points,s.key,{x,y,base:s.base}).map((path,index)=><g key={s.key+index}>{!s.lineOnly&&<path data-series={s.key} d={path.area} fill={`url(#${id+s.key})`}/>}<path data-line={s.key} d={path.line} fill="none" stroke={s.color} strokeWidth={s.lineOnly?1.8:1.5}/></g>))}{current&&<line x1={x(displayIndex)} x2={x(displayIndex)} y1={top} y2={bottom} className={styles.cursorLine}/>}</g>
   </svg>
   {!activity&&<div className={styles.chartEmpty}><span className={styles.emptySymbol} aria-hidden="true">{available?'·':'↗'}</span><span>{available?'No reported activity for this period':emptyMessage}</span></div>}
   {current&&<div className={styles.tooltip} role="status" style={{left:Math.max(2,Math.min(98,x(displayIndex)/width*100))+'%',transform:displayIndex>points.length/2?'translateX(-100%)':undefined}}><strong>{dateLabel(current.date)} · UTC</strong>{contextLabel&&<span>{contextLabel}</span>}{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label}<b>{kind==='cost'?(current[s.key]===null?'Unavailable':reportUsd(String(current[s.key]))):reportNumber(current[s.key])}</b></span>)}</div>}
  </div>
  <div className={styles.legend}>{series.map(s=><span key={s.key}><i style={{background:available?s.color:'#a8b8c8'}}/>{s.label}</span>)}</div>
 </div>;
}
