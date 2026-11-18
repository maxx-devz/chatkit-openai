export const ADMIN_VIEWS={overview:{title:"Overview",description:"Client portal operations and reporting status."},
  clients:{title:"Clients",description:"Select a client to review its workspace, access and integrations."},
  usage:{title:"AI Usage",description:"Recorded provider usage and costs; reporting allowances are separate from access limits."},
  assistant:{title:"AI Assistant",description:"Private AOC administrator assistant."},
  security:{title:"Access & Security",description:"Provider configuration and client access safeguards."}};
export function adminView(value) {return Object.hasOwn(ADMIN_VIEWS,value)?value:"overview";}
export const ADMIN_CLIENT_TABS=[['overview','Overview'],['access','Access'],['usage','AI Usage & Credits'],['integrations','Integrations'],['activity','Activity']];
export function adminClientTab(value) {return ADMIN_CLIENT_TABS.some(([key])=>key===value)?value:"overview";}
export function legacyAdminHash(hash) {return ({"#overview":{view:"overview"},"#clients":{view:"clients"},"#portal-usage":{view:"usage"},
  "#assistant":{view:"assistant"},"#ai-controls":{view:"clients",tab:"usage"},"#security":{view:"security"}})[hash] || null;}
