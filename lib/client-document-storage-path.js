import {documentFileFormat} from './client-document-formats.js';
export function documentStoragePath(client,id,filename){
 if(!/^[1-9][0-9]*$/.test(String(client))||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Invalid document scope');
 documentFileFormat(filename);
 const name=filename.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ ()-]/g,'_').replace(/^\.+/,'_').trim();
 return 'clients/'+client+'/'+id+'/'+name;
}
export function assertDocumentStoragePath(client,id,path){
 const prefix='clients/'+client+'/'+id+'/';
 if(typeof path!=='string'||!path.startsWith(prefix)||!path.slice(prefix.length)||/[\\\x00-\x1f]/.test(path)||path.slice(prefix.length).includes('/')||['.','..'].includes(path.slice(prefix.length)))throw Error('Invalid document object scope');
 return path;
}
