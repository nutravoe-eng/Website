import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, mocks = {}) {
 const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports = {};
 vm.runInNewContext(source, { exports, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; }, process, console, fetch: (...args) => globalThis.fetch(...args), AbortSignal });
 return exports;
}
const { verifyOtpBotToken } = load("lib/otp-bot-verification.ts");
delete process.env.TURNSTILE_SECRET_KEY;
assert.equal(await verifyOtpBotToken("token"), false);
process.env.TURNSTILE_SECRET_KEY = "test-only";
for (const [result, expected] of [
 [{success:true,action:"otp-send",hostname:"nutravoe.in"}, true],
 [{success:false,action:"otp-send",hostname:"nutravoe.in"}, false],
 [{success:true,action:"other",hostname:"nutravoe.in"}, false],
 [{success:true,action:"otp-send",hostname:"attacker.example"}, false],
]) {
 globalThis.fetch = async () => ({ok:true,json:async()=>result});
 assert.equal(await verifyOtpBotToken("token"), expected);
}
globalThis.fetch = async () => { throw Error("timeout"); };
assert.equal(await verifyOtpBotToken("token"), false);
let claims = 0, emails = 0;
const { alertOtpBudget } = load("lib/otp-alerts.ts", {
 "@/lib/supabase/admin": {adminSupabase:{rpc:async()=>({data:{allowed:++claims === 1},error:null})}},
 "@/lib/brevo": {sendBrevoEmail:async input=>{ assert.equal(input.toEmail,"nutravoe@gmail.com"); emails++; return {success:true}; }},
});
process.env.BREVO_OTP_ALERT_TEMPLATE_ID = "123";
process.env.OTP_ALERT_EMAIL = "nutravoe@gmail.com";
await alertOtpBudget("otp-phone-hour",5,0,3600);
await alertOtpBudget("otp-global-hour",100,21,3600);
assert.equal(claims,0);
await alertOtpBudget("otp-global-hour",100,20,3600);
await alertOtpBudget("otp-global-hour",100,19,3600);
assert.equal(emails,1);
console.log("OTP bot validation and alert threshold/deduplication tests passed");
