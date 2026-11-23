// Presentation hints only. These labels never authorize or change a file URL.
const googleTypes={document:'Open in Google Docs',spreadsheet:'Open in Google Sheets',presentation:'Open in Google Slides'};
const mimeLabels={
 'application/pdf':'View PDF',
 'application/msword':'Open Word document',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'Open Word document',
 'application/vnd.ms-excel':'Open spreadsheet',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'Open spreadsheet',
 'application/vnd.ms-powerpoint':'Open presentation',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':'Open presentation',
 'text/plain':'View text file','text/csv':'Open spreadsheet',
};
const extensions={pdf:'View PDF',doc:'Open Word document',docx:'Open Word document',odt:'Open document',rtf:'Open document',xls:'Open spreadsheet',xlsx:'Open spreadsheet',ods:'Open spreadsheet',csv:'Open spreadsheet',ppt:'Open presentation',pptx:'Open presentation',odp:'Open presentation',png:'View image',jpg:'View image',jpeg:'View image',webp:'View image',gif:'View image',svg:'View image',txt:'View text file'};
export function documentOpenLabel({delivery,mimeType,sourceUrl,filename}={}) {
 const mime=typeof mimeType==='string'?mimeType.toLowerCase().split(';')[0].trim():'';
 const native=mime.startsWith('application/vnd.google-apps.')?mime.slice('application/vnd.google-apps.'.length):'';
 // Protected delivery exports native Google documents as PDF; its open action
 // serves that PDF rather than opening the original Google editing application.
 if(googleTypes[native])return delivery==='protected'?'View PDF':googleTypes[native];
 if(mimeLabels[mime])return mimeLabels[mime];
 if(/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/.test(mime))return 'View image';
 if(delivery==='link'&&typeof sourceUrl==='string'){
  try{const url=new URL(sourceUrl);if(url.protocol==='https:'&&url.hostname==='docs.google.com'&&!url.username&&!url.password&&!url.port){
   const app=url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]{10,200}(?:\/|$)/)?.[1];
   if(app)return googleTypes[app==='spreadsheets'?'spreadsheet':app];
  }}catch{/* Opaque or unknown links keep a generic action. */}
 }
 const extension=typeof filename==='string'?filename.trim().match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase():'';
 return extensions[extension]||'Open file';
}
