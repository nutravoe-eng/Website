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
 "@/lib/brevo": {sendBrevoTextEmail:async input=>{ assert.equal(input.toEmail,"nutravoe@gmail.com"); assert.match(input.subject,/SMS limit for the hour/); assert.match(input.textContent,/80 of 100/); emails++; return {success:true}; }},
});
process.env.BREVO_API_KEY = "test-only";
process.env.BREVO_FROM_EMAIL = "verified@example.com";
process.env.OTP_ALERT_EMAIL = "nutravoe@gmail.com";
await alertOtpBudget("otp-phone-hour",5,0,3600);
await alertOtpBudget("otp-global-hour",100,21,3600);
assert.equal(claims,0);
await alertOtpBudget("otp-global-hour",100,20,3600);
await alertOtpBudget("otp-global-hour",100,19,3600);
assert.equal(emails,1);
console.log("OTP bot validation and alert threshold/deduplication tests passed");

const { sendBrevoTextEmail } = load("lib/brevo.ts");
delete process.env.BREVO_FROM_EMAIL;
let sentPayload;
globalThis.fetch = async (_url, options) => { sentPayload = JSON.parse(options.body); return {ok:true}; };
assert.equal((await sendBrevoTextEmail({toEmail:"nutravoe@gmail.com",subject:"Test",textContent:"Plain text"})).success,true);
assert.equal(sentPayload.sender.email,"nutravoe@gmail.com");
assert.equal(sentPayload.textContent,"Plain text");
assert.equal(sentPayload.templateId,undefined);
globalThis.fetch = async () => ({ok:false,status:400});
assert.equal((await sendBrevoTextEmail({toEmail:"nutravoe@gmail.com",subject:"Test",textContent:"Plain text"})).success,false);
console.log("Plain-text Brevo payload and failure checks passed");
