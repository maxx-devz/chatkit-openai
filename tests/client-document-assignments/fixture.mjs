import {randomBytes} from "node:crypto";
export async function createAssignmentFixture(db,auth,origin){
 const actual=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
 if(actual.host!=="127.0.0.1"||!/^aoc_documents_[a-f0-9]{10}$/.test(actual.name)||new URL(origin).hostname!=="127.0.0.1")throw Error("Require disposable local document fixture");
 const f={origin,database:actual.name,accounts:{},clients:[]};
 for(const key of ["admin","client","internal","unrelated"]){
  const username="docs."+key+"."+randomBytes(5).toString("hex"),password=randomBytes(24).toString("hex");
  const created=await auth.api.signUpEmail({body:{username,password,name:"Document check "+key,email:username+"@example.invalid"}});
  const u=(await db.query("INSERT INTO portal_users(external_id,display_name) VALUES($1,$2) RETURNING id::text",[created.user.id,"Document check "+key])).rows[0];
  f.accounts[key]={id:u.id,externalId:created.user.id,username,password};
 }
 await db.query("INSERT INTO portal_admins(user_id,is_active) VALUES($1,true),($2,true)",[f.accounts.admin.id,f.accounts.internal.id]);
 await db.query("INSERT INTO portal_internal_users(user_id,hubstaff_user_id) VALUES($1,99101)",[f.accounts.internal.id]);
 for(const name of ["Boundary client A","Boundary client B"]){
  const c=(await db.query("INSERT INTO portal_clients(slug,display_name,hubstaff_project_url,hubstaff_monthly_hours_limit) VALUES($1,$2,$3,20) RETURNING id::text,display_name name",["docs-check-"+f.clients.length,name,"https://tasks.hubstaff.com/app/organizations/1/projects/"+(7100+f.clients.length)])).rows[0];f.clients.push(c);
 }
 await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'client_admin',true)",[f.clients[0].id,f.accounts.client.id]);
 return f;
}
