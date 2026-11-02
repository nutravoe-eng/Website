import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source = ts.transpileModule(fs.readFileSync("lib/payments/fulfill.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let gateway, due, reads, writes;
const admin = {from: () => {
 const chain = {select:()=>chain,eq:()=>chain,maybeSingle:async()=>{ reads++; return {data: reads===1 ? due : {payment_status:"paid"},error:null}; },update:()=>{writes++;return chain;}};
 return chain;
}};
const mocks = {
 "@/lib/supabase/admin": {adminSupabase:admin},
 "@/lib/payments/cashfree": {getCashfreePaymentDetails:async()=>gateway},
 "@/lib/payments/merchant-id": {parseMerchantOrderId:id=>({kind:id.startsWith("ord_")?"order":"subscription",id:id.slice(4)})},
 "@/lib/subscription": {}, "@/lib/request-notification-email": {},
};
const exports = {};
vm.runInNewContext(source,{exports,require:name=>{if(!(name in mocks))throw Error(name);return mocks[name];},console});
for (const kind of ["order","subscription"]) {
 const merchantOrderId = kind === "order" ? "ord_test" : "sub_test";
 const column = kind === "order" ? "total" : "total_amount_rs";
 const valid = {order_id:merchantOrderId,order_status:"PAID",order_amount:499,order_currency:"INR",cf_order_id:"gateway"};
 for(const [changes,reject] of [[{},false],[{order_amount:599},true],[{order_amount:399},true],[{order_currency:"USD"},true],[{order_amount:NaN},true],[{order_id:"different"},true],[{order_amount:499.001},true]]) {
  gateway={...valid,...changes};due={[column]:"499.00"};reads=0;writes=0;
  const run=()=>exports.applyCashfreePaymentState({merchantOrderId,providerStatus:"PAID"});
  if(reject) {await assert.rejects(run);assert.equal(reads <= 1,true);}
  else {assert.equal((await run()).paid,true);assert.equal(reads,2);}
  assert.equal(writes,0);
 }
 gateway={...valid,order_status:"ACTIVE"};reads=0;
 assert.equal((await exports.applyCashfreePaymentState({merchantOrderId,providerStatus:"PAID"})).paid,false);
 assert.equal(reads,0);
}
console.log("Payment verification: matching INR accepted; wrong amount/currency/identity, invalid precision, and unpaid gateway status rejected for orders and subscriptions");
