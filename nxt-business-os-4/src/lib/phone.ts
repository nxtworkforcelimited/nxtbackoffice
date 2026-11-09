// Phone number clean-up for calling lists.
// Conservative: a number is only rewritten to international format when the
// country is clear. Anything unclear is kept exactly as typed and compared by digits.
export type PhoneResult={e164:string|null;key:string};

const EMPTY:PhoneResult={e164:null,key:''};

export function normalisePhone(raw:string|null|undefined,defaultCountry:'263'|'44'='263'):PhoneResult{
 const input=String(raw??'').trim();
 if(!input)return EMPTY;
 // "ext" / "x" extensions and notes after the number are ignored.
 const main=input.split(/\s*(?:ext\.?|x|;|,|\/|\bor\b)\s*/i)[0];
 const hasPlus=/^\s*(\+|00)/.test(main);
 let digits=main.replace(/\D/g,'');
 if(/^\s*00/.test(main))digits=digits.replace(/^00/,'');
 if(!digits)return {e164:null,key:''};
 // Already international.
 if(hasPlus||/^(263|44)/.test(digits)&&digits.length>=11){
  if(digits.startsWith('263')&&digits.length===12)return ok(digits);
  if(digits.startsWith('44')&&digits.length===12)return ok(digits);
  return {e164:null,key:digits};
 }
 // National format with a leading zero. Length tells Zimbabwe and UK mobiles apart.
 if(digits.startsWith('0')){
  const national=digits.slice(1);
  if(digits.length===10&&/^[1-9]/.test(national))return ok('263'+national);        // Zimbabwe: 0 + 9 digits
  if(digits.length===11&&digits.startsWith('07'))return ok('44'+national);          // UK mobile: 07 + 9 digits
  if(digits.length===11&&/^0[1-3]/.test(digits))return ok('44'+national);          // UK geographic: 01/02/03 + 9 digits
 }
 // Nine digits with no zero, as written in many Zimbabwe sheets (771234567).
 if(digits.length===9&&defaultCountry==='263'&&/^7[1-9]/.test(digits))return ok('263'+digits);
 return {e164:null,key:digits};
}
function ok(d:string):PhoneResult{return {e164:'+'+d,key:d};}

// Stable key for duplicate checks: the E.164 digits when known, otherwise the bare digits.
export function phoneKey(raw:string|null|undefined){return normalisePhone(raw).key;}
