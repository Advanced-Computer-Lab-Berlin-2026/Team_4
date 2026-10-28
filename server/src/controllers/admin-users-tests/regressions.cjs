// Run against an isolated replica set: TEST_MONGO_URI=... node src/controllers/admin-users-tests/regressions.cjs
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'admin-users-regression-only';
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Item = require('../../models/Item');
const Category = require('../../models/Category');
const Favorite = require('../../models/Favorite');
const HouseholdLink = require('../../models/HouseholdLink');
const LenderApplication = require('../../models/LenderApplication');
const app = require('../../app');
let server, base, admin, member, lender, cookie; const results=[];
async function request(path, method='GET', body, token=cookie) {
 const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}), 'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status, body:await res.json()};
}
const token=u=>jwt.sign({id:String(u._id)},process.env.JWT_SECRET);
let seq=0;
async function user(extra={}) { const i=++seq; return User.create({username:`test${i}`,name:`Person ${i}`,email:`test${i}@example.com`,phone:`0100000${String(i).padStart(4,'0')}`,address:{street:'Street',city:'City'},passwordHash:'unused-test-hash',...extra}); }
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});} console.log(results.at(-1));}
(async()=>{
 if(!process.env.TEST_MONGO_URI)throw Error('TEST_MONGO_URI must point to a disposable replica set');
 await mongoose.connect(process.env.TEST_MONGO_URI,{dbName:`admin_users_test_${process.pid}`});
 await Promise.all([User,Item,Category,Favorite,HouseholdLink,LenderApplication].map(m=>m.init()));
 admin=await user({role:'admin'}); member=await user(); lender=await user({lenderStatus:'verified'}); cookie=token(admin);
 server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});base=`http://127.0.0.1:${server.address().port}`;
 await check('Guest and member cannot access any admin-user endpoint',async()=>{for(const t of ['',token(member)])for(const [path,method,body] of [['','GET'],['/'+member.id,'GET'],['/'+member.id+'/status','PATCH',{status:'suspended'}],['/'+member.id,'DELETE']])assert.equal((await request('/api/admin-users'+path,method,body,t)).status,t?403:401);});
 await check('Basic details include structured address and exclude password hash',async()=>{const r=await request('/api/admin-users/'+member.id);assert.equal(r.status,200);assert.equal(r.body.data.address.city,'City');assert.ok(!JSON.stringify(r.body).includes('passwordHash'));});
 await check('Search is literal and malformed regex cannot cause server errors',async()=>{await user({name:'Literal [Person]'});let r=await request('/api/admin-users?q=%5B');assert.equal(r.status,200);assert.equal(r.body.total,1);r=await request('/api/admin-users?q=.*');assert.equal(r.body.total,0);});
 await check('Invalid pagination and filter types rejected',async()=>{for(const q of ['page=-1','limit=0','limit=99999','page=abc','q[x]=test','role=invalid','status=invalid'])assert.equal((await request('/api/admin-users?'+q)).status,400,q);});
 await check('Lender filter uses member role plus verified lender status',async()=>{const r=await request('/api/admin-users?role=lender');assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.data[0]._id,lender.id);});
 await check('Pagination exposes all accounts without overlapping pages',async()=>{for(let i=0;i<12;i++)await user();const a=await request('/api/admin-users?limit=10&page=1'),b=await request('/api/admin-users?limit=10&page=2');assert.ok(a.body.total>10);assert.equal(a.body.data.length,10);assert.ok(b.body.data.length>0);assert.ok(!a.body.data.some(x=>b.body.data.some(y=>x._id===y._id)));});
 await check('Malformed and missing IDs return controlled errors',async()=>{for(const suffix of ['','/status']){const method=suffix?'PATCH':'GET';assert.equal((await request('/api/admin-users/nope'+suffix,method,suffix?{status:'active'}:undefined)).status,400);}assert.equal((await request('/api/admin-users/'+new mongoose.Types.ObjectId())).status,404);});
 await check('Missing or conflicting status rejected without changing account',async()=>{for(const body of [{},{status:'invalid'},{status:'active',isSuspended:true}])assert.equal((await request('/api/admin-users/'+member.id+'/status','PATCH',body)).status,400);assert.equal((await User.findById(member.id)).status,'active');});
 await check('Suspend/reinstate changes access and records administrator',async()=>{let r=await request('/api/admin-users/'+member.id+'/status','PATCH',{status:'suspended',reason:'QA reason'});assert.equal(r.status,200);assert.equal(r.body.data.suspension.by,admin.id);assert.equal(r.body.data.suspension.reason,'QA reason');assert.equal((await request('/api/auth/me','GET',undefined,token(member))).status,403);r=await request('/api/admin-users/'+member.id+'/status','PATCH',{status:'active'});assert.equal(r.status,200);assert.equal((await request('/api/auth/me','GET',undefined,token(member))).status,200);});
 await check('Admin accounts cannot be suspended',async()=>{assert.equal((await request('/api/admin-users/'+admin.id+'/status','PATCH',{status:'suspended'})).status,409);assert.equal((await User.findById(admin.id)).status,'active');});
 // Restore actor after baseline test to allow subsequent independent checks.
 await User.updateOne({_id:admin.id},{$set:{status:'active'}});
 await check('An administrator cannot delete their own account',async()=>{assert.equal((await request('/api/admin-users/'+admin.id.toUpperCase(),'DELETE')).status,409);assert.equal((await request('/api/admin-users/'+admin.id,'DELETE')).status,409);});
 if(!await User.exists({_id:admin.id})){admin=await user({role:'admin'});cookie=token(admin);}
 await check('Removal hides owned items and clears dependent Sprint 1 records',async()=>{const target=await user({lenderStatus:'verified'});const cat=await Category.create({name:'Tools',slug:'tools'});const item=await Item.create({owner:target.id,category:cat.id,title:'Drill',description:'Drill',depositAmount:1});await Favorite.create({user:member.id,item:item.id});await HouseholdLink.create({requester:target.id,recipient:member.id,relation:'spouse'});await LenderApplication.create({user:target.id});assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,200);assert.equal(await User.findById(target.id),null);assert.equal((await request('/api/catalog/'+item.id)).status,404);assert.equal(await HouseholdLink.countDocuments({requester:target.id}),0);assert.equal(await Favorite.countDocuments({item:item.id}),0);assert.equal(await LenderApplication.countDocuments({user:target.id}),0);assert.equal((await request('/api/auth/me','GET',undefined,token(target))).status,401);});
 await check('Failed removal rolls back account, listing and dependent records',async()=>{const target=await user();const cat=await Category.findOne();const item=await Item.create({owner:target.id,category:cat.id,title:'Rollback drill',description:'Drill',depositAmount:1});await Favorite.create({user:member.id,item:item.id});const original=HouseholdLink.deleteMany;HouseholdLink.deleteMany=()=>{throw Error('Injected removal failure');};try{assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,500);}finally{HouseholdLink.deleteMany=original;}assert.ok(await User.findById(target.id));assert.equal((await Item.findById(item.id)).isArchived,false);assert.equal(await Favorite.countDocuments({item:item.id}),1);assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,200);});
 await check('Private upload survives rollback and is cleaned after successful removal',async()=>{const fs=require('node:fs/promises');const path=require('node:path');const {absolutePath}=require('../../middleware/upload');const target=await user();const relative=`private/lender-docs/admin-delete-test-${process.pid}.txt`;const file=absolutePath(relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fictional test document');try{await LenderApplication.create({user:target.id,documents:[{type:'id_document',path:relative}]});const original=User.deleteOne;User.deleteOne=()=>{throw Error('Injected final delete failure');};try{assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,500);}finally{User.deleteOne=original;}assert.equal(await fs.readFile(file,'utf8'),'fictional test document');assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,200);let exists=true;for(let i=0;i<30&&exists;i++){await new Promise(r=>setTimeout(r,10));exists=await fs.access(file).then(()=>true,()=>false);}assert.equal(exists,false);}finally{await fs.rm(file,{force:true});}});
 await check('Another administrator can be removed',async()=>{const target=await user({role:'admin'});assert.equal((await request('/api/admin-users/'+target.id,'DELETE')).status,200);assert.equal(await User.findById(target.id),null);});
 if(process.env.TEST_REPORT_PATH)require('node:fs').writeFileSync(process.env.TEST_REPORT_PATH,JSON.stringify(results,null,2));
 if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(mongoose.connection.readyState)await mongoose.connection.dropDatabase();await mongoose.disconnect();});
